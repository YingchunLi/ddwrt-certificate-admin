import React from 'react';
import PropTypes from 'prop-types';
// material UI
import {Card, CardHeader, CardText} from 'material-ui/Card';
import {Table, TableBody, TableRow, TableRowColumn,} from 'material-ui/Table';
import Checkbox from 'material-ui/Checkbox';
import CircularProgress from 'material-ui/CircularProgress';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';

import {
  ADDRESS_BEING_CHECKED,
  ADDRESS_IS_REACHABLE,
  ADDRESS_NOT_REACHABLE,
  errorTexts,
  renderTableRow,
  renderTextFieldTableRow
} from './utils';

import {buildCA, readExistingCA} from './certificate-utils';
// electron api
import {caCertFile, clipboard, dialog, executableDir, fs, isDev, ping, shell} from './environment';
import {RadioButton, RadioButtonGroup} from "material-ui/RadioButton";
import FlatButton from 'material-ui/FlatButton';

import _ from "lodash";

import {autoConfigViaSSH, loadCAKeyFromRouter, loadCACertFromRouter, checkSSHConfig} from './ssh-utils';
import {
  generateAdditionalConfig,
  generateClientConfigs,
  generateDHParam,
  generateFireWallConfig,
  generateServerConfigs,
  isDdWrtMode,
  isEdgeRouterMode,
  VPN_OPTION_CA_GENERATE_NEW,
  VPN_OPTION_CA_USE_EXISTING_LOCAL,
  VPN_OPTION_CA_USE_EXISTING_ROUTE
} from "./vpn-utils";

/**
 * Componet for configurator output
 */
const ConfiguratorOutput = (
  {
    vpnParameters,
    serverOptions,
    clientOptions,
    configuratorOutput,

    onFieldChange,
    onUpdateState,
    showMessage
  }) => {

  const {
    configuratorMode,
    sshServer,
    sshServerErrorText,
    sshUsername,
    sshPassword,

    optStoreCaKeys,
    caKeysDir,

    caCertPem,
    caPrivateKeyPem,
    dhParamsPem,
    additionalConfig,
    ipTablesConfig,

    certificateStage,
    stateTexts,

    ignoreConfigurationErrors
  }
    = configuratorOutput;
  
  const optRouterMode = vpnParameters.optRouterMode;
  const ddWrtMode = isDdWrtMode(optRouterMode);
  const edgeRouterMode = isEdgeRouterMode(optRouterMode);

  const updateState = (stateText, {finish=false, append=false} = {}) => {
    const certificateStage = !finish ? 1 : 0;
    onUpdateState(stateText, {certificateStage, append});
    console.log(stateText);
  };

  const generateNewCA = async (vpnParameters, configuratorOutput) => {
    const {caCert, caPrivateKey, caCertPem, caPrivateKeyPem} = await buildCA(vpnParameters);

    fs.writeFileSync(caCertFile, caCertPem);
    if (configuratorOutput.optStoreCaKeys === 'local') {
      fs.writeFileSync(`${configuratorOutput.caKeysDir}/ca.key`, caPrivateKeyPem);
      fs.writeFileSync(`${configuratorOutput.caKeysDir}/ca.crt`, caCertPem);
    }

    return {caCert, caPrivateKey, caCertPem, caPrivateKeyPem};
  };

  const reuseExistingCA = async (vpnParameters) => {
    try {
      const localCAKeyFile = `${vpnParameters.caKeysDir}/ca.key`;
      const localCACertFile = `${vpnParameters.caKeysDir}/ca.crt`;
      //TODO: check existence
      const caPrivateKeyPem = fs.readFileSync(localCAKeyFile, 'utf8');
      //TODO: generate crt from private key if no cert exists
      const caCertPem = fs.readFileSync(localCACertFile, 'utf8');

      // write to client output dir (used by client configurations and ssh auto configuration)
      fs.writeFileSync(caCertFile, caCertPem);

      const {caCert, caPrivateKey} =  await readExistingCA(caPrivateKeyPem, caCertPem);

      return {caCert, caPrivateKey, caCertPem, caPrivateKeyPem};
    } catch (e) {
      // error log here

    }
  };

  const loadCAFromRouter = async (configs) => {
    const caPrivateKeyPem = await loadCAKeyFromRouter(configs);
    const caCertPem = await loadCACertFromRouter(configs);

    fs.writeFileSync(caCertFile, caCertPem);

    const {caCert, caPrivateKey} =  await readExistingCA(caPrivateKeyPem, caCertPem);
    return {caCert, caPrivateKey, caCertPem, caPrivateKeyPem};
  };

  const runAutoConfig = async (configuratorOutput, vpnParameters) => {
    updateState('Auto configure using ssh settings');
    try {
      await autoConfigViaSSH(configuratorOutput, vpnParameters);
      updateState(`Auto configure done successfully`);
    } catch (e) {
      console.error(e);
      updateState(`Auto configure failed : ${e.message}. Please do the configuration manually`);
    } finally {
    }
  };

  const generateConfigurations = async () => {
    onFieldChange({stateTexts: []});

    const generateNewCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_GENERATE_NEW;
    const useExistingLocalCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_LOCAL;
    const useExistingRouterCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_ROUTE;
    const buildCAMessage = useExistingLocalCAKey ? 'Reusing existing local CA' :
      (useExistingRouterCAKey ? 'Loading CA key/cert from router' : 'Building CA');
    updateState(buildCAMessage);

    const {caCert, caPrivateKey, caCertPem, caPrivateKeyPem} =
      useExistingLocalCAKey ?
        await reuseExistingCA(vpnParameters) :
        (useExistingRouterCAKey ?
            await loadCAFromRouter(configuratorOutput) :
            await generateNewCA(vpnParameters, configuratorOutput)
        );

    updateState('Generating server certificates');
    await generateServerConfigs(caCert, caPrivateKey, vpnParameters, serverOptions, updateState);

    updateState('Generating client certificates');
    await generateClientConfigs(caCert, caPrivateKey, vpnParameters, clientOptions, updateState);

    updateState('Generating dh pem');
    const dhParamsPem = await generateDHParam(isDev);

    const additionalConfig = generateAdditionalConfig(vpnParameters);
    const ipTablesConfig = generateFireWallConfig(vpnParameters);

    // auto configuration
    if (edgeRouterMode && configuratorMode === 'ssh' && generateNewCAKey) {
      await runAutoConfig({...configuratorOutput, caPrivateKeyPem}, vpnParameters)
    }

    if (edgeRouterMode && configuratorMode === 'ssh' && useExistingRouterCAKey) {
      updateState(`Auto configure done successfully`);
    }
    // update final
    onFieldChange(
      {
        // configuratorMode,
        // sshServer,
        // sshServerErrorText,
        // sshPort,
        // sshUsername,
        // sshPassword,
        // optStoreCaKeys,
        // caKeysDir,

        caCertPem,
        caPrivateKeyPem,
        dhParamsPem,
        additionalConfig,
        ipTablesConfig,

        certificateStage: 2,
        // stateTexts,

        ignoreConfigurationErrors,
      }
    );
  };

  const generateConfigurationsCatchError = async () => {
    try {
      await generateConfigurations();
    } catch (e) {
      console.error(e);
      updateState(`Auto configure failed : ${e.message}. Please do the configuration manually`, {finish: true});
      // onConfiguratorError(`Auto configure failed : ${e.message}. Please do the configuration manually`);
    }
  };

  const preFlightCheck = async () => {
    try {
      onFieldChange({stateTexts: []});

      // const useExistingLocalCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_LOCAL;
      // const useExistingRouterCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_ROUTE;
      // const buildCAMessage = useExistingLocalCAKey ? 'Reusing existing local CA' :
        // (useExistingRouterCAKey ? 'Loading CA key/cert from router' : 'Building CA');
      // updatePreFlightCheckState(buildCAMessage);
      updateState("Doing preflight check");
  
      const useExistingRouterCAKey = vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_ROUTE;
      const sshOutput = await checkSSHConfig(vpnParameters, configuratorOutput, updateState, useExistingRouterCAKey) ;
      updateState(sshOutput || "Pre flight check done successfully.", {finish: true});
    } catch (e) {
      console.error(e);
      updateState(`preFlight check failed:\n${e.message}.`, {finish: true});
      // onConfiguratorError(`preFlight check failed:\n${e.message}.`);
    }
  };

  const copyToClipboard = (data, what) => {
    clipboard.writeText(data);
    showMessage(`Copied ${what} to clipboard.`)
  };

  const changeSSHServer = (e, sshServer) => {
    // this.handleChange('networkPublicIpOrDDNSAddressOfRouter', host);
    onFieldChange({sshServer});
    // onChange({...configuratorOutput, sshServer});
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

  const selectCAKeyDir = (e) => {
    const checkAndSetFilePath = (filePaths) => {
      if (filePaths && filePaths.length > 0) {
        const caKeysDir = filePaths[0];
        try {
          fs.accessSync(caKeysDir, fs.W_OK);
          onFieldChange({caKeysDir});
        } catch (e) {
          // ignore any exception
          alert(`Directory [${caKeysDir}] is not writable!`)
        }
      }
    };

    dialog.showOpenDialog( {properties: ['openDirectory']}, checkAndSetFilePath);
    // e.preventDefault();
  };

  const onConfiguratorModeChange = (configuratorMode) => {
    if (configuratorMode === 'manual' && optStoreCaKeys === 'router') {
      onFieldChange({configuratorMode, optStoreCaKeys: 'none'});
    } else {
      onFieldChange({configuratorMode});
    }
  };

  // elements
  const configuratorAlreadyRun = certificateStage !== 0;
  const configuratorModeElement =
    <RadioButtonGroup name="configuratorMode"
                      key="configuratorMode"
                      valueSelected={configuratorMode}
                      onChange={(event, value) => onConfiguratorModeChange(value)}
    >
      <RadioButton label="Manually Configure" value="manual" disabled={vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_ROUTE}/>
      <RadioButton label="Configure via SSH" value="ssh" disabled={configuratorAlreadyRun}/>
    </RadioButtonGroup>;

  const storeCaKeysElementOptionNone = <RadioButton key="storeCaKeysElementOptionNone" label="Do not store private key" value="none" disabled={configuratorAlreadyRun}/>;
  const storeCaKeysElementOptionLocal = <RadioButton key="storeCaKeysElementOptionLocal" label="Store private key locally" value="local" disabled={configuratorAlreadyRun}/>;
  const storeCaKeysElementOptionRouter = <RadioButton key="storeCaKeysElementOptionRouter" label="Store private key on router" value="router" disabled={ddWrtMode || configuratorAlreadyRun} />;
  const storeCaKeysElementOptions = (edgeRouterMode && configuratorMode === 'ssh') ?
    [storeCaKeysElementOptionNone, storeCaKeysElementOptionRouter, storeCaKeysElementOptionLocal] :
    [storeCaKeysElementOptionNone, storeCaKeysElementOptionLocal];

  const storeCaKeysElement =
    <div>
      <RadioButtonGroup name="optStoreCaKeys"
                        key="optStoreCaKeys"
                        valueSelected={optStoreCaKeys}
                        onChange={(event, value) => onFieldChange({optStoreCaKeys: value})}
      >
        {storeCaKeysElementOptions}
      </RadioButtonGroup>

      {
        optStoreCaKeys === 'local' &&
        <div style={{display: 'flex'}}>
          <TextField fullWidth={true} value={caKeysDir} id="caKeysDir"/>
          <FlatButton label="Browse" primary={true} onClick={selectCAKeyDir}/>
        </div>
      }
    </div>;

  const sshServerElement =
    <TextField
      id="sshServer"
      value={sshServer}
      onChange={changeSSHServer}
      onBlur={finishChangingSSHServer}
      errorText={sshServerErrorText}
      errorStyle={sshServerErrorText === ADDRESS_IS_REACHABLE ? {color: '#8cc152'} :
        sshServerErrorText === ADDRESS_BEING_CHECKED ? {color: '#f6bb42'} : undefined}
    />;

  const sshUsernameElement =
    <TextField
      id="sshUsername"
      value={sshUsername}
      onChange={(e, value) => onFieldChange({sshUsername: value})}
    />;

  const sshPasspordElement =
    <TextField
      id="sshPassword"
      type="password"
      value={sshPassword}
      onChange={(e, value) => onFieldChange({sshPassword: value})}
    />;

  const sshOutputRow =
    <TextField
      id="sshOutput"
      fullWidth={true}
      value={stateTexts ? stateTexts.join("\n") : ""}
      multiLine={true}
      disabled={true}
    />;

  return <div>
    <Card initiallyExpanded={true}>
      <CardHeader title={`Configurator Output`}/>
      <CardText expandable={true}>
        <div style={{marginBottom: 10, position: 'relative'}}>
          <Table selectable={false} style={{tableLayout: 'auto'}} key="sshConfigurations">
            <TableBody displayRowCheckbox={false} showRowHover={true}>

              { edgeRouterMode && renderTableRow("Configurator Mode", configuratorModeElement, {key: 'configuratorMode'}) }

              { vpnParameters.optRegenerateCA === VPN_OPTION_CA_GENERATE_NEW && renderTableRow("Store private key", storeCaKeysElement, {key: 'optStoreCaKeys'}) }

              {
                edgeRouterMode && configuratorMode === 'ssh' &&
                [
                  renderTableRow("SSH server host or ip address", sshServerElement, { key: 'sshServer'}),

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

                  renderTableRow("SSH User name", sshUsernameElement, { key: 'sshUsername'}),

                  renderTableRow("SSH password", sshPasspordElement, { key: 'sshPassword'}),

                ]
              }
            </TableBody>
          </Table>



          { edgeRouterMode && configuratorMode === 'ssh' &&
            [
              <RaisedButton
                key="PreflightCheckButton"
                label="Preflight check"
                primary={true}
                onClick={preFlightCheck}
                disabled={configuratorAlreadyRun || (!_.isEmpty(errorTexts) && !ignoreConfigurationErrors)}
              />,
              <span key="span"> </span>
            ]
          }
          <RaisedButton
            label="Click me to run configurator"
            primary={true}
            onClick={generateConfigurationsCatchError}
            disabled={configuratorAlreadyRun || (!_.isEmpty(errorTexts) && !ignoreConfigurationErrors)}
          />
 
        </div>

        {/*{stateText}*/}
        {certificateStage === 1 && <CircularProgress/>}

        {/* ssh output */}  
        {!_.isEmpty(stateTexts) && sshOutputRow}

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

                  upload: <strong>ca.crt</strong>, <strong>server.key</strong>, <strong>server.crt</strong> and <strong>dh.pem</strong> to <strong>/config/auth</strong>
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
