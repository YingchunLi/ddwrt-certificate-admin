import React from 'react';
import PropTypes from 'prop-types';

import {Card, CardHeader, CardText} from 'material-ui/Card';
import { Table, TableRow, TableRowColumn, TableBody, } from 'material-ui/Table';

import CircularProgress from 'material-ui/CircularProgress';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';

import {renderTableRow, subnetMaskToCidrPrefix} from './utils';
import {buildCA, readExistingCA, buildClientCertificate, generateDHParams} from './certificate-utils';
import VPNParameters from "./VPNParameters";

// electron api
import {fs, executableDir, isDev, clipboard} from './environment';
import {caCertFile, caPrivateKeyFile, dhPemFile} from './environment';

const staticDhPem = `-----BEGIN DH PARAMETERS-----
MIIBCQKCAQCKgoa/NBgUDSFrEE/6twb/EDLAfMllfdU/w8/Gy/lEXxEiAApWgjuF
RuHHQ2PaharGPODFyAxxUMfGcMdCuwzAUZYEYtSRfnQsvA4v7m+/2LEz9Yhx5eLo
997a+hvGbLBBpf8VZjUTNSjnQvpYzZrO94ACUmCk+DQv7tvh/qe4GRJPp8MwK4DQ
nJLGAQeXa1WgaRtGIU3x1SRp2B4zZsj2BrGUUHaz7j4Pi+dTMcwABfHLlbnYR1QE
DkzXrybrGDSv1E48RiBuNOON02RoUrz1ERNcoF2C+MWjzbJ9e5iryrIB4l5ev4Wr
e7zH50OiQfDtv4ofD/KUPQdx38F+jz51AgMAAAI=
-----END DH PARAMETERS-----`;

const ConfiguratorOutput = ({vpnParameters, clientOptions, configuratorOutput, onChange = ()=>{}, showMessage}) => {

  const {
    caCertPem,
    caPrivateKeyPem,
    dhParamsPem,
    additionalConfig,
    ipTablesConfig,

    certificateStage,
    stateText,
  }
    = configuratorOutput;

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

  const generateClientConfigs = async (caCert, caPrivateKey) => {
    // create client key pair
    console.log('generating client certificates');
    if (clientOptions && clientOptions.length > 0) {


      let date = new Date();
      console.log('****date', date);
      if (isDev) {
        date.setDate(date.getDate() - 1);
        console.log('****date', date);
      }

      const destDir = vpnParameters.userKeysDir ||executableDir;
      for (let i = 0; i < clientOptions.length; ++i) {
        const client = clientOptions[i];
        const username = client.username;
        const clientCertOptions =
          {
            commonName: username,
            keySize: vpnParameters.keySize,
            password: client.password,
          };
        updateState(`Generating certificates for client ${i+1}`);
        console.log(`Generating certificates for client ${i+1}`);

        const {certPem: clientCertPem, privateKeyPem: clientPrivateKeyPem} =
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

        const clientDestDir = `${destDir}/${username}`;
        // const stat = fs.statSync(clientDestDir);
        // if (stat.isDirectory()) {
        //   fs.rmdirSync(clientDestDir);
        // }

        if (!fs.existsSync(clientDestDir)) {
          console.log(`making dir [${clientDestDir}]`);
          fs.mkdirSync(clientDestDir);
        }
        fs.writeFileSync(`${clientDestDir}/${username}.crt`, clientCertPem);
        fs.writeFileSync(`${clientDestDir}/${username}.key`, clientPrivateKeyPem);
        fs.writeFileSync(`${clientDestDir}/${username}.ovpn`, clientOvpn);

      }
    }
  };

  const generateAdditionalConfig = () => {
    // const tcpUdp = vpnParameters.optUseUDP ? 'udp': 'tcp';
    // const redirectGateway = vpnParameters.optSendLANTrafficOnly ? '' : 'push “redirect-gateway def1”';

    const configurableOptions =
      [
        `push "route ${vpnParameters.internalNetwork} 255.255.255.0"`,
        // `push "dhcp-option DNS 8.8.8.8"`,
        `dev tun`,
        vpnParameters.optSendLANTrafficOnly ? '' : 'push "redirect-gateway def1"',        // option: redirect all l
        `server ${vpnParameters.networkSegment} ${vpnParameters.subnetMask}`,
        vpnParameters.vpnPort === 1194 ? '' : `port ${vpnParameters.vpnPort}`,
        VPNParameters.optUseUDP ? 'proto udp' : 'proto tcp',
        //'keepalive 10 120'
      ].filter(o => o !== '').join('\n');


    return `${configurableOptions}

dh /tmp/openvpn/dh.pem
ca /tmp/openvpn/ca.crt
cert /tmp/openvpn/ca.crt
key /tmp/openvpn/key.pem`
  };


  const generateIpTablesConfig = () => {
    const cidrPrefix = subnetMaskToCidrPrefix(vpnParameters.subnetMask);
    const vnpCidr = `${vpnParameters.networkSegment}/${cidrPrefix}`;
    return `iptables -I INPUT 1 -p tcp -dport 443 -j ACCEPT
iptables -I FORWARD 1 -source  ${vnpCidr} -j ACCEPT
iptables -I FORWARD -i br0 -o tun0 -j ACCEPT
iptables -I FORWARD -i tun0 -o br0 -j ACCEPT
iptables -t nat -A POSTROUTING -s ${vnpCidr} -j MASQUERADE`;
  };

  const generateConfigurations = async () => {

    const buildCAMessage = !vpnParameters.optRegenerateCA ? 'Reusing existing CA' : 'Building CA';
    updateState(buildCAMessage);
    console.log(buildCAMessage);
    const {caCert, caPrivateKey, caCertPem, caPrivateKeyPem } = !vpnParameters.optRegenerateCA ? await reuseExistingCA() : await generateServerCA();

    updateState('Generating client certificates');
    await generateClientConfigs(caCert, caPrivateKey);

    updateState('Generating dh pem');
    const dhParamsPem = isDev ? staticDhPem: await generateDHParam();

    const additionalConfig = generateAdditionalConfig();
    const ipTablesConfig = generateIpTablesConfig();

    // update final
    onChange(
      {
        caCertPem,
        caPrivateKeyPem,
        dhParamsPem,
        additionalConfig,
        ipTablesConfig,

        certificateStage: 2,
        stateText: '',
      }
    );
  };

  const copyToClipboard = (data, what) => {
    clipboard.writeText(data);
    showMessage(`Copied ${what} to clipboard.`)
  };

  const textFieldRows = 6;

  return (
    <div >
      <Card initiallyExpanded={true}>
        <CardHeader title={`Configurator Output`} />
        <CardText expandable={true}>
          <div style={{marginBottom: 10, position: 'relative'}}>
            <RaisedButton
              label={stateText || 'Click me to run configurator'}
              primary={true}
              onClick={generateConfigurations}
              disabled={certificateStage === 1}
            />
          </div>

          {/*{stateText}*/}
          {certificateStage === 1 && <CircularProgress />}

          <Table selectable={false} style={{tableLayout: 'auto'}}>
            <TableBody displayRowCheckbox={false} showRowHover={false}>
              {certificateStage === 2 &&
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

                  {`Set "Network" to "${vpnParameters.networkSegment}".`}
                  <br/>
                  {`Set "Netmask" to "${vpnParameters.subnetMask}".`}
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
            <TableBody displayRowCheckbox={false} showRowHover={false}>
              {certificateStage === 2 && [
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
                ),

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
              ]
              }

            </TableBody>
          </Table>

        </CardText>
      </Card>
    </div>
  );
};

ConfiguratorOutput.propTypes = {
  vpnParameters:        PropTypes.object,
  clientOptions:        PropTypes.arrayOf(PropTypes.object),
  configuratorOutput:   PropTypes.object,

};
ConfiguratorOutput.defaultProps = {};

export default ConfiguratorOutput;
