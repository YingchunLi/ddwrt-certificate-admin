import {subnetMaskToCidrPrefix} from "./utils";
import {executableDir, fs, isDev, caCertFile} from "./environment";
import {buildClientCertificate} from "./certificate-utils";

export const isDdWrtMode = routerMode => routerMode === 'DD-WRT';
export const isEdgeRouterMode = routerMode => routerMode === 'EDGE-SERVER';

export const VPN_OPTION_CA_GENERATE_NEW = 'generateNew';
export const VPN_OPTION_CA_USE_EXISTING_LOCAL = 'useExistingLocal';
export const VPN_OPTION_CA_USE_EXISTING_ROUTE = 'useExistingRoute';

const copyFileSync = fs.copyFileSync || ((src, dest) => fs.writeFileSync(dest, fs.readFileSync(src)));

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

      const clientFilenamePrefix = vpnParameters.optPrependClientOutputFileNameWithIPDDNSName ?
        `${vpnParameters.networkPublicIpOrDDNSAddressOfRouter}-${username}` : username;

      // generate client opvn file
      const clientOvpn = generateClientOvpn(vpnParameters, clientFilenamePrefix);
      const clientDestDir = `${destDir}/${username}`;
      // const stat = fs.statSync(clientDestDir);
      // if (stat.isDirectory()) {
      //   fs.rmdirSync(clientDestDir);
      // }
      if (!fs.existsSync(clientDestDir)) {
        console.log(`making dir [${clientDestDir}]`);
        fs.mkdirSync(clientDestDir);

      }
      fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.crt`, clientCertPem);
      fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.key`, clientPrivateKeyPem);
      fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.ovpn`, clientOvpn);
      copyFileSync(caCertFile, `${clientDestDir}/${clientFilenamePrefix}-ca.crt`)

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

ca ${username}-ca.crt
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

ca ${username}-ca.crt
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
      `push "route ${vpnParameters.internalNetwork} ${vpnParameters.internalNetworkMask}"`,
      // `push "dhcp-option DNS 8.8.8.8"`,
      `dev tun`,
      vpnParameters.optSendLANTrafficOnly ? '' : 'push "redirect-gateway def1"',        // option: redirect all l
      `server ${vpnParameters.vpnClientNetworkSegment} ${vpnParameters.vpnClientSubnetMask}`,
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
    vpnClientNetworkSegment,
    vpnClientSubnetMask,

    internalNetwork,
    internalNetworkMask,
    routerInternalIP

  } = vpnParameters;

  const vpnCidrPrefix = subnetMaskToCidrPrefix(vpnClientSubnetMask);
  const vnpCidr = `${vpnClientNetworkSegment}/${vpnCidrPrefix}`;

  const internalNetworkCidrPrefix = subnetMaskToCidrPrefix(internalNetworkMask);

  return `configure

set interfaces openvpn vtun0 mode server
set interfaces openvpn vtun0 server subnet ${vnpCidr}
set interfaces openvpn vtun0 server push-route ${internalNetwork}/${internalNetworkCidrPrefix}
set interfaces openvpn vtun0 server name-server ${routerInternalIP}
 
set interfaces openvpn vtun0 tls ca-cert-file ${configDir}/ca.crt
set interfaces openvpn vtun0 tls cert-file ${configDir}/ca.crt
set interfaces openvpn vtun0 tls key-file ${configDir}/ca.key
set interfaces openvpn vtun0 tls dh-file ${configDir}/dh.pem

commit
save`;
};

/************* firewall settings *********/

export const generateFireWallConfig = (vpnParameters) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateFireWallConfigForDDWRT(vpnParameters)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateFireWallConfigForEdgeRouter(vpnParameters);
  }
};


const generateFireWallConfigForDDWRT = (vpnParameters) => {
  const cidrPrefix = subnetMaskToCidrPrefix(vpnParameters.vpnClientSubnetMask);
  const vnpCidr = `${vpnParameters.vpnClientNetworkSegment}/${cidrPrefix}`;
  return `iptables -I INPUT 1 -p tcp -dport 443 -j ACCEPT
iptables -I FORWARD 1 -source  ${vnpCidr} -j ACCEPT
iptables -I FORWARD -i br0 -o tun0 -j ACCEPT
iptables -I FORWARD -i tun0 -o br0 -j ACCEPT
iptables -t nat -A POSTROUTING -s ${vnpCidr} -j MASQUERADE`;
};

export const generateFireWallConfigForEdgeRouter = (vpnParameters) => {
  const ruleOrder = "90";
  return `set firewall name WAN_LOCAL rule ${ruleOrder} action accept
set firewall name WAN_LOCAL rule ${ruleOrder} description openvpn
set firewall name WAN_LOCAL rule ${ruleOrder}  destination port ${vpnParameters.vpnPort}
set firewall name WAN_LOCAL rule ${ruleOrder}  protocol udp
commit
save`
};
