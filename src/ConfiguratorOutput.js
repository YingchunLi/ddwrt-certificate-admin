import React from 'react';
import PropTypes from 'prop-types';

// material UI
import {Card, CardHeader, CardText} from 'material-ui/Card';
import { Table, TableRow, TableRowColumn, TableBody, } from 'material-ui/Table';
import Checkbox from 'material-ui/Checkbox';
import CircularProgress from 'material-ui/CircularProgress';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';

import {errorTexts, renderTableRow, renderTextFieldTableRow} from './utils';
import {ADDRESS_BEING_CHECKED, ADDRESS_IS_REACHABLE, ADDRESS_NOT_REACHABLE} from "./utils";

import {buildCA, readExistingCA, buildClientCertificate, generateDHParams, staticDhPem} from './certificate-utils';

// electron api
import {shell, fs, executableDir, isDev, clipboard, ping} from './environment';
import {caCertFile, caPrivateKeyFile, dhPemFile} from './environment';
import {RadioButton, RadioButtonGroup} from "material-ui/RadioButton";
import FlatButton from 'material-ui/FlatButton';

import _ from "lodash";

import {autoConfigViaSSH} from './ssh-utils';
import {isDdWrtMode, isEdgeRouterMode, generateClientConfigs, generateAdditionalConfig, generateFireWallConfig} from "./vpn-utils";
import {VPN_OPTION_CA_USE_EXISTING_LOCAL} from "./vpn-utils";


const ConfiguratorOutput = (
  {
    vpnParameters,
    serverOptions,
    clientOptions,
    configuratorOutput,
    onChange = ()=>{},
    onFieldChange,
    configuratorStatus,
    onConfiguratorStatusChange,
    showMessage
  }) => {

  const {
    configuratorMode,
    sshServer,
    sshServerErrorText,
    sshPort,
    sshUsername,
    sshPassword,

    caCertPem,
    caPrivateKeyPem,
    dhParamsPem,
    additionalConfig,
    ipTablesConfig,

    certificateStage,
    stateText,

    ignoreConfigurationErrors
  }
    = configuratorOutput;

  const optRouterMode = vpnParameters.optRouterMode;
  const ddWrtMode = isDdWrtMode(optRouterMode);
  const edgeRouterMode = isEdgeRouterMode(optRouterMode);

  const updateState = stateText => onChange({...configuratorOutput, stateText, certificateStage: 1});

  const generateServerCA = async () => {
    console.log('building root ca');

    const {caCert, caPrivateKey, caCertPem, caPrivateKeyPem} = await buildCA(vpnParameters);

    // create client key pairs and sign their public key using ca root certificate
    fs.writeFileSync(caCertFile, caCertPem);
    fs.writeFileSync(caPrivateKeyFile, caPrivateKeyPem);

    return {
      caCert,
      caPrivateKey,
      caCertPem,
      caPrivateKeyPem,
    }
  };

  const reuseExistingCA = async () => {
    try {
      //TODO: check existence
      const caCertPem = fs.readFileSync(caCertFile, 'utf8');
      const caPrivateKeyPem = fs.readFileSync(caPrivateKeyFile, 'utf8');

      const {caCert, caPrivateKey} =  await readExistingCA(caPrivateKeyPem, caCertPem);

      return {
        caCert,
        caPrivateKey,
        caCertPem,
        caPrivateKeyPem,
      }
    } catch (e) {
      // error log here

    }
  };

  const generateDHParam = async () => {
    // create DH.pem
    console.log('start creating dhparam');

    // const dhParamsPem = dhparam();
    const dhParamsPem = await generateDHParams();

    console.log('end creating dh.pem');
    console.log('dh.pem:', dhParamsPem);

    fs.writeFileSync(dhPemFile, dhParamsPem);

    return dhParamsPem;
  };

  const generateServerConfigs = async (caCert, caPrivateKey) => {
    // create server key pair
    if (serverOptions && serverOptions.length > 0) {
      console.log('generating server certificates');

      let date = new Date();
      if (isDev) {
        date.setDate(date.getDate() - 1);
      }

      const userKeysDir = vpnParameters.userKeysDir ||executableDir;
      for (let i = 0; i < serverOptions.length; ++i) {
        const option = serverOptions[i];
        const username = option.username;
        const clientCertOptions =
          {
            commonName: username,
            keySize: vpnParameters.keySize,
            password: option.password,
          };
        updateState(`Generating certificates for server ${i+1}`);
        console.log(`Generating certificates for server ${i+1}`);

        const {certPem, privateKeyPem} =
          await buildClientCertificate(caCert, caPrivateKey, {...clientCertOptions, validityStart: date});

        // generate client opvn file
        const clientOvpn=`client
remote ${vpnParameters.networkPublicIpOrDDNSAddressOfRouter} ${vpnParameters.vpnPort}
port ${vpnParameters.vpnPort}
dev tun
#secret ${username}.key
proto tcp

comp-lzo
route-gateway ${vpnParameters.routerInternalIP} 
float

ca ca.crt
cert ${username}.crt
key ${username}.key
`;

        const destDir = `${userKeysDir}/${username}`;
        // const stat = fs.statSync(clientDestDir);
        // if (stat.isDirectory()) {
        //   fs.rmdirSync(clientDestDir);
        // }

        if (!fs.existsSync(destDir)) {
          console.log(`making dir [${destDir}]`);
          fs.mkdirSync(destDir);
        }
        fs.writeFileSync(`${destDir}/${username}.crt`, certPem);
        fs.writeFileSync(`${destDir}/${username}.key`, privateKeyPem);
        fs.writeFileSync(`${destDir}/${username}.ovpn`, clientOvpn);

      }
    }
  };


  const runAutoConfig = async (configuratorOutput) => {
    updateState('Auto configure using ssh settings');
    try {
      await autoConfigViaSSH(configuratorOutput, vpnParameters);
      onConfiguratorStatusChange('sshAutoConfigureOutput', `Auto configure done successfully`);
    } catch (e) {
      onConfiguratorStatusChange('sshAutoConfigureOutput', `Auto configure failed : ${e.message}. Please do the configuration manually`);
    } finally {
    }
  };

  const generateConfigurations = async () => {
    onConfiguratorStatusChange('sshAutoConfigureOutput', '');

    const buildCAMessage = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_LOCAL ? 'Reusing existing CA' : 'Building CA';
    updateState(buildCAMessage);
    console.log(buildCAMessage);
    const {caCert, caPrivateKey, caCertPem, caPrivateKeyPem } = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_LOCAL ? await reuseExistingCA() : await generateServerCA();

    updateState('Generating server certificates');
    await generateServerConfigs(caCert, caPrivateKey);

    updateState('Generating client certificates');
    await generateClientConfigs(caCert, caPrivateKey, vpnParameters, clientOptions, updateState);

    updateState('Generating dh pem');
    const dhParamsPem = isDev ? staticDhPem: await generateDHParam();

    const additionalConfig = generateAdditionalConfig(vpnParameters);
    const ipTablesConfig = generateFireWallConfig(vpnParameters);

    // auto configuration
    if (configuratorMode === 'ssh') {
      await runAutoConfig(configuratorOutput, vpnParameters)
    }

    // update final
    onChange(
      {
        configuratorMode,
        sshServer,
        sshServerErrorText,
        sshPort,
        sshUsername,
        sshPassword,

        caCertPem,
        caPrivateKeyPem,
        dhParamsPem,
        additionalConfig,
        ipTablesConfig,

        certificateStage: 2,
        stateText: '',

        ignoreConfigurationErrors,
      }
    );
  };

  const copyToClipboard = (data, what) => {
    clipboard.writeText(data);
    showMessage(`Copied ${what} to clipboard.`)
  };

  const changeSSHServer = (e, sshServer) => {
    // this.handleChange('networkPublicIpOrDDNSAddressOfRouter', host);
    // onFieldChange({sshServer});
    onChange({...configuratorOutput, sshServer});
    // pingAddress(sshServer);
  };

  const finishChangingSSHServer = () => {
    pingAddress(sshServer);
  };

  const updateSSHServerErrorText = (sshServerErrorText) => {
    onFieldChange({sshServerErrorText})
  };

  const pingAddress = _.debounce(host => {
    if (host.trim() === '') {
      updateSSHServerErrorText('This field is required');
      return;
    }

    updateSSHServerErrorText(ADDRESS_BEING_CHECKED);
    ping.sys.probe(host, isAlive => {
      console.log('**** got ping result for host', host, '****isAlive', isAlive);
      if (isAlive) {
        updateSSHServerErrorText(ADDRESS_IS_REACHABLE);
      } else {
        if (host === sshServer) {
          updateSSHServerErrorText(ADDRESS_NOT_REACHABLE);
        } else {
          console.log('host does not equal to latest ip. ignore.', host, sshServer);
          if (sshServerErrorText === ADDRESS_BEING_CHECKED) {
            updateSSHServerErrorText(undefined);
          }
        }
      }
    });
  }, 1000);

  const textFieldRows = 6;

  return <div>
    <Card initiallyExpanded={true}>
      <CardHeader title={`Configurator Output`}/>
      <CardText expandable={true}>
        <div style={{marginBottom: 10, position: 'relative'}}>

          {edgeRouterMode && [
            <RadioButtonGroup name="configuratorMode"
                              key="configuratorMode"
                              valueSelected={configuratorMode}
                              onChange={(event, value) => onChange({...configuratorOutput, configuratorMode: value})}
            >
              <RadioButton label="Manually Configure" value="manual" disabled={certificateStage === 1}/>
              <RadioButton label="Configure via SSH" value="ssh" disabled={certificateStage === 1}/>
            </RadioButtonGroup>,


            <Table selectable={false} style={{tableLayout: 'auto'}} key="sshConfigurations">
              <TableBody displayRowCheckbox={false} showRowHover={false}>
                {configuratorMode === 'ssh' && [
                  renderTableRow("SSH server host or ip address",
                    <TextField
                      id="sshServer"
                      value={sshServer}
                      onChange={changeSSHServer}
                      onBlur={finishChangingSSHServer}
                      errorText={sshServerErrorText}
                      errorStyle={sshServerErrorText === ADDRESS_IS_REACHABLE ? {color: '#8cc152'} :
                        sshServerErrorText === ADDRESS_BEING_CHECKED ? {color: '#f6bb42'} : undefined}
                    />,
                    {
                      key: 'sshServer', autoLabelWidth: true,
                    }
                  ),

                  renderTextFieldTableRow('SSH port', 'sshPort', configuratorOutput,
                    (fieldName, sshPort) => onFieldChange({sshPort}),
                    {
                      required: true,
                      filedType: 'number',
                      min: 1,
                      max: 65535,
                      hintText: 'Enter a value between 1 and 65535',
                      validator: value => Number(value) >= 1 && Number(value) <= 65535
                    }
                  ),

                  renderTableRow("SSH User name",
                    <TextField
                      id="sshUsername"
                      value={sshUsername}
                      onChange={(e, value) => onChange({...configuratorOutput, sshUsername: value})}
                    />,
                    {
                      key: 'sshUsername',
                      autoLabelWidth: true,
                    }
                  ),

                  renderTableRow("SSH password",
                    <TextField
                      id="sshPassword"
                      type="password"
                      value={sshPassword}
                      onChange={(e, value) => onChange({...configuratorOutput, sshPassword: value})}
                    />,
                    {
                      key: 'sshPassword',
                      autoLabelWidth: true,
                    }
                  ),

                  <TableRow displayBorder={false} key="sshAutoConfigureOutput">
                    <TableRowColumn colSpan={2}>
                      {
                        configuratorStatus.sshAutoConfigureOutput
                      }
                    </TableRowColumn>
                  </TableRow>
                ]
                }
              </TableBody>
            </Table>]
          }

          <RaisedButton
            label={stateText || 'Click me to run configurator'}
            primary={true}
            onClick={generateConfigurations}
            disabled={certificateStage === 1 || (!_.isEmpty(errorTexts) && !ignoreConfigurationErrors)}
          />
        </div>

        {/*{stateText}*/}
        {certificateStage === 1 && <CircularProgress/>}

        {
          !_.isEmpty(errorTexts) &&
          <Table selectable={false} style={{tableLayout: 'auto'}}>
            <TableBody displayRowCheckbox={false} showRowHover={false}>
              <TableRow key="header" displayBorder={false}>
                <TableRowColumn colSpan={2}>
                  There are some errors with the configuration parameters. Please correct them before proceeding.
                </TableRowColumn>
              </TableRow>
              <TableRow key="errors" displayBorder={false}>
                <TableRowColumn colSpan={2} style={{color: 'red'}}>
                  {
                    _.map(errorTexts, (errorText, field) => [`${field}: ${errorText}`, <br/>])
                  }
                </TableRowColumn>
              </TableRow>
              <TableRow key="confirmOverride" displayBorder={false}>>
                <TableRowColumn colSpan={2}>
                  <Checkbox
                    label="Override errors, even though the resulting files probably won't work"
                    onCheck={(event, isInputChecked) => onFieldChange({ignoreConfigurationErrors: isInputChecked})}
                  />
                </TableRowColumn>
              </TableRow>
            </TableBody>
          </Table>
        }


        <Table selectable={false} style={{tableLayout: 'auto'}}>
          <TableBody displayRowCheckbox={false} showRowHover={false}>
            {certificateStage === 2 && ddWrtMode &&
            <TableRow displayBorder={false}>
              <TableRowColumn colSpan={2}>
                Set "OpenVPN" to "ENABLE".
                <br/>
                {`Set "Start Type" to "${vpnParameters.optStartWithWANUp ? 'WAN Up' : 'Server Up'}".`}
                <br/>
                <br/>

                Set "Config as" to "SERVER".
                <br/>
                Set "Server Mode" to "ROUTER (TUN)".
                <br/>
                <br/>

                {`Set "Network" to "${vpnParameters.vpnClientNetworkSegment}".`}
                <br/>
                {`Set "Netmask" to "${vpnParameters.vpnClientSubnetMask}".`}
                <br/>
                <br/>

                {`Set "Port" to "${vpnParameters.vpnPort}".`}
                <br/>
                {`Set "Tunnel Protocol" to "${vpnParameters.optUseUDP ? 'UDP' : 'TCP'}".`}
                <br/>
                <br/>

                Set "Encryption Cypher" to "BLOWFISH CBC".
                <br/>
                Set "Hash Algorithm" to "SHA1".
                <br/>
              </TableRowColumn>
            </TableRow>
            }
          </TableBody>
        </Table>

        <Table selectable={false} style={{tableLayout: 'auto'}}>
          {/* dd-wrt only output */}
          <TableBody displayRowCheckbox={false} showRowHover={false}>
            {certificateStage === 2 && ddWrtMode && [
              renderTableRow("Set 'Public Server Cert' to",
                <TextField
                  id="caCertPem"
                  value={caCertPem}
                  multiLine={true}
                  // rows={3}
                  rowsMax={textFieldRows}
                  fullWidth={true}
                  disabled={true}
                />,
                {
                  key: 'caCertPem',
                  copyToClipboard: () => copyToClipboard(caCertPem, 'public server cert'),
                  autoLabelWidth: true,
                }
              ),


              renderTableRow("Set 'Private Server Key' to",
                <TextField
                  id="caPrivateKeyPem"
                  value={caPrivateKeyPem}
                  multiLine={true}
                  // rows={8}
                  rowsMax={textFieldRows}
                  fullWidth={true}
                  disabled={true}
                />,
                {
                  key: 'caPrivateKeyPem',
                  copyToClipboard: () => copyToClipboard(caPrivateKeyPem, 'private server key'),
                  autoLabelWidth: true,
                }
              ),

              renderTableRow("Set 'DH PEM'",
                <TextField
                  id="dhParamsPem"
                  value={dhParamsPem}
                  multiLine={true}
                  // rows={8}
                  rowsMax={textFieldRows}
                  fullWidth={true}
                  disabled={true}
                />,
                {
                  key: 'dhParamsPem',
                  copyToClipboard: () => copyToClipboard(dhParamsPem, 'dh pem'),
                  autoLabelWidth: true,
                }
              )
            ]}

            {/* dd-wrt only output */}
            {certificateStage === 2 && ddWrtMode && [
              renderTableRow("Add this to 'Additional Config'",
                <TextField
                  id="additionalConfig"
                  value={additionalConfig}
                  multiLine={true}
                  fullWidth={true}
                />,
                {
                  key: 'additionalConfig',
                  copyToClipboard: () => copyToClipboard(additionalConfig, 'additional config'),
                  autoLabelWidth: true,
                }
              ),

              renderTableRow("SSH into the router, and add these lines to configure iptables",
                <TextField
                  id="ipTablesConfig"
                  value={ipTablesConfig}
                  multiLine={true}
                  fullWidth={true}
                />,
                {
                  key: 'iptableConfig',
                  copyToClipboard: () => copyToClipboard(ipTablesConfig, 'iptables config'),
                  autoLabelWidth: true,
                }
              ),
            ]}

            {/* edge router only output */}
            {certificateStage === 2 && edgeRouterMode && configuratorMode !== 'ssh' && [
              <TableRow displayBorder={false} key="selectKey">
                <TableRowColumn>
                  <label>Upload your certificate files to the router.<br />
                  If you're using Filezilla, set the QuickConnect to:<br />
                  Server: xxx <br />
                  Username: (your username;<strong>'ubnt'</strong> by default)<br />
                  Password: (your password;<strong>'ubnt'</strong> by default)<br />
                  Port: <strong>22</strong> (unless you changed it)
                  </label>
                </TableRowColumn>
                <TableRowColumn style={{}}>
                  <div>
                    Files are here: <FlatButton key="browseCertificateFilesFolder" label="Browse" primary={true} onClick={e => shell.openItem(executableDir)} />
                  </div>

                  <br/>

                  upload: <strong>ca.crt</strong>, <strong>ca.key</strong>, and <strong>dh.pem</strong> to <strong>/config/auth</strong>
                </TableRowColumn>
              </TableRow>,

              renderTableRow("SSH into the router, and add these lines to configure openvpn server",
                <TextField
                  id="additionalConfig"
                  value={additionalConfig}
                  multiLine={true}
                  fullWidth={true}
                />,
                {
                  key: 'additionalConfig',
                  copyToClipboard: () => copyToClipboard(additionalConfig, 'additional config'),
                  autoLabelWidth: true,
                }
              ),

              renderTableRow("SSH into the router, and add these lines to configure iptables",
                <TextField
                  id="ipTablesConfig"
                  value={ipTablesConfig}
                  multiLine={true}
                  fullWidth={true}
                />,
                {
                  key: 'iptableConfig',
                  copyToClipboard: () => copyToClipboard(ipTablesConfig, 'iptables config'),
                  autoLabelWidth: true,
                }
              ),
            ]}

          </TableBody>
        </Table>

      </CardText>
    </Card>
  </div>;
};

ConfiguratorOutput.propTypes = {
  vpnParameters:        PropTypes.object,
  clientOptions:        PropTypes.arrayOf(PropTypes.object),
  configuratorOutput:   PropTypes.object,

};
ConfiguratorOutput.defaultProps = {};

export default ConfiguratorOutput;
