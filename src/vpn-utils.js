import {getVpnCommands} from './ssh-utils';
import {subnetMaskToCidrPrefix} from "./utils";
import {executableDir, fs, isDev} from "./environment";
import {buildClientCertificate} from "./certificate-utils";

export const isDdWrtMode = routerMode => routerMode === 'DD-WRT';
export const isEdgeRouterMode = routerMode => routerMode === 'EDGE-SERVER';



/************* client configurations ***********/
export const generateClientConfigs = async (caCert, caPrivateKey, vpnParameters, clientOptions, updateState) => {
  // create client key pair
  if (clientOptions && clientOptions.length > 0) {
    console.log('generating client certificates');

    let date = new Date();
    if (isDev) {
      date.setDate(date.getDate() - 1);
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
      const clientOvpn = generateClientOvpn(vpnParameters, username);

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

const generateClientOvpn = (vpnParameters, username) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateClientOvpnForDDWRT(vpnParameters, username)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateClientOvpnForEdgeRouter(vpnParameters, username);
  }
};

const generateClientOvpnForDDWRT = (vpnParameters, username) => {
  return `client
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
};

const generateClientOvpnForEdgeRouter = (vpnParameters, username) => {
  return `client
remote ${vpnParameters.networkPublicIpOrDDNSAddressOfRouter} ${vpnParameters.vpnPort}
port ${vpnParameters.vpnPort}
dev tun
proto udp

float
resolv-retry infinite
nobind
persist-key
persist-tun
verb 3

ca ca.crt
cert ${username}.crt
key ${username}.key
`
};


/************* open vpn server settings *********/
export const generateAdditionalConfig = (vpnParameters) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateVPNServerConfigForDDWRT(vpnParameters)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateVPNServerConfigForEdgeRouter(vpnParameters);
  }
};

const generateVPNServerConfigForDDWRT = (vpnParameters) => {
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
      vpnParameters.optUseUDP ? 'proto udp' : 'proto tcp',
      //'keepalive 10 120'
    ].filter(o => o !== '').join('\n');


  return `${configurableOptions}

dh /tmp/openvpn/dh.pem
ca /tmp/openvpn/ca.crt
cert /tmp/openvpn/ca.crt
key /tmp/openvpn/key.pem`
};

export const generateVPNServerConfigForEdgeRouter = (vpnParameters, configDir='/config/auth') => {
  const {
    networkSegment,
    subnetMask,

    internalNetwork,
    routerInternalIP

  } = vpnParameters;

  const cidrPrefix = subnetMaskToCidrPrefix(subnetMask);
  const vnpCidr = `${networkSegment}/${cidrPrefix}`;

  return `set interfaces openvpn vtun0 mode server
set interfaces openvpn vtun0 server subnet ${vnpCidr} 
set interfaces openvpn vtun0 server push-route ${internalNetwork}/24
set interfaces openvpn vtun0 server name-server ${routerInternalIP}
 
set interfaces openvpn vtun0 tls ca-cert-file ${configDir}/ca.crt
set interfaces openvpn vtun0 tls cert-file ${configDir}/ca.crt
set interfaces openvpn vtun0 tls key-file ${configDir}/ca.key
set interfaces openvpn vtun0 tls dh-file ${configDir}/dh.pem`;
};

/************* firewall settings *********/

export const generateIpTablesConfig = (vpnParameters) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateIpTablesConfigForDDWRT(vpnParameters)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateIpTablesConfigForEdgeRouter(vpnParameters);
  }
};


const generateIpTablesConfigForDDWRT = (vpnParameters) => {
  const cidrPrefix = subnetMaskToCidrPrefix(vpnParameters.subnetMask);
  const vnpCidr = `${vpnParameters.networkSegment}/${cidrPrefix}`;
  return `iptables -I INPUT 1 -p tcp -dport 443 -j ACCEPT
iptables -I FORWARD 1 -source  ${vnpCidr} -j ACCEPT
iptables -I FORWARD -i br0 -o tun0 -j ACCEPT
iptables -I FORWARD -i tun0 -o br0 -j ACCEPT
iptables -t nat -A POSTROUTING -s ${vnpCidr} -j MASQUERADE`;
};

const generateIpTablesConfigForEdgeRouter = (vpnParameters) => {
  return `set firewall name WAN_LOCAL rule 30 action accept
set firewall name WAN_LOCAL rule 30 description openvpn
set firewall name WAN_LOCAL rule 30 destination port ${vpnParameters.vpnPort}
set firewall name WAN_LOCAL rule 30 protocol udp`
};
