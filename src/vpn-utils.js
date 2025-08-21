import {subnetMaskToCidrPrefix} from "./utils";
import {executableDir, fs, isDev, caCertFile, dhPemFile} from "./environment";
import {buildClientCertificate, generateDHParams, staticDhPem} from "./certificate-utils";

export const isDdWrtMode = routerMode => routerMode === 'DD-WRT';
export const isEdgeRouterMode = routerMode => routerMode === 'EDGE-SERVER';

export const VPN_OPTION_CA_GENERATE_NEW = 'generateNew';
export const VPN_OPTION_CA_USE_EXISTING_LOCAL = 'useExistingLocal';
export const VPN_OPTION_CA_USE_EXISTING_ROUTE = 'useExistingRoute';

const copyFileSync = fs.copyFileSync || ((src, dest) => fs.writeFileSync(dest, fs.readFileSync(src)));

/************* client configurations ***********/
export const generateClientConfigs = async (caCert, caPrivateKey, caCertPem, vpnParameters, clientOptions, updateState) => {
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
          certificateDuration: vpnParameters.certificateDuration,
          password: client.password,
        };
      updateState(`Generating certificates for client ${i+1}`);
      console.log(`Generating certificates for client ${i+1}`);

      const {certPem: clientCertPem, privateKeyPem: clientPrivateKeyPem} =
        await buildClientCertificate(caCert, caPrivateKey, {...clientCertOptions, validityStart: date});

      const clientFilenamePrefix = vpnParameters.optPrependClientOutputFileNameWithIPDDNSName ?
        `${vpnParameters.networkPublicIpOrDDNSAddressOfRouter}-${username}` : username;

      // generate client opvn file
      const clientOvpn = generateClientOvpn(vpnParameters, clientFilenamePrefix, caCertPem, clientCertPem, clientPrivateKeyPem);
      const clientDestDir = `${destDir}/${username}`;
      // const stat = fs.statSync(clientDestDir);
      // if (stat.isDirectory()) {
      //   fs.rmdirSync(clientDestDir);
      // }
      if (!fs.existsSync(clientDestDir)) {
        console.log(`making dir [${clientDestDir}]`);
        fs.mkdirSync(clientDestDir);

      }
      if (!vpnParameters.optEmbedCertificates) {
        fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.crt`, clientCertPem);
        fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.key`, clientPrivateKeyPem);
        copyFileSync(caCertFile, `${clientDestDir}/${clientFilenamePrefix}-ca.crt`);
      }
      fs.writeFileSync(`${clientDestDir}/${clientFilenamePrefix}.ovpn`, clientOvpn);
    }
  }
};

const generateClientOvpn = (vpnParameters, username, caCertPem, clientCertPem, clientPrivateKeyPem) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateClientOvpnForDDWRT(vpnParameters, username, caCertPem, clientCertPem, clientPrivateKeyPem)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateClientOvpnForEdgeRouter(vpnParameters, username, caCertPem, clientCertPem, clientPrivateKeyPem);
  }
};

const generateClientOvpnForDDWRT = (vpnParameters, username, caCertPem, clientCertPem, clientPrivateKeyPem) => {
  const {optEmbedCertificates} = vpnParameters;

  const certs = optEmbedCertificates ?
    `<ca>
${caCertPem}
</ca>
<cert>
${clientCertPem}
</cert>
<key>
${clientPrivateKeyPem}
</key>
`
    :
    `ca ${username}-ca.crt
cert ${username}.crt
key ${username}.key
`;

  return `client
remote ${vpnParameters.networkPublicIpOrDDNSAddressOfRouter} ${vpnParameters.vpnPort}
port ${vpnParameters.vpnPort}
dev tun
#secret ${username}.key
proto tcp

comp-lzo
route-gateway ${vpnParameters.routerInternalIP} 
float

${certs}
`;
};

const generateClientOvpnForEdgeRouter = (vpnParameters, username, caCertPem, clientCertPem, clientPrivateKeyPem) => {
  const {optEmbedCertificates} = vpnParameters;

  const certs = optEmbedCertificates ?
    `<ca>
${caCertPem}
</ca>
<cert>
${clientCertPem}
</cert>
<key>
${clientPrivateKeyPem}
</key>
`
    :
    `ca ${username}-ca.crt
cert ${username}.crt
key ${username}.key
`;

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

${certs}
`
};


/************* open vpn server settings *********/
export const generateServerConfigs = async (caCert, caPrivateKey, vpnParameters, serverOptions, updateState) => {
  // create server key pair
  if (serverOptions && serverOptions.length > 0) {
    let date = new Date();
    if (isDev) {
      date.setDate(date.getDate() - 1);
    }

    const userKeysDir = vpnParameters.userKeysDir ||executableDir;
    for (let i = 0; i < serverOptions.length; ++i) {
      const option = serverOptions[i];
      const username = option.username;
      const serverCertOptions =
        {
          commonName: username,
          keySize: vpnParameters.keySize,
          certificateDuration: vpnParameters.certificateDuration,
          password: option.password,
          validityStart: date,
          linuxFormat: true,
        };
      updateState(`Generating certificates for server ${i+1}`);

      const {certPem, privateKeyPem} =
        await buildClientCertificate(caCert, caPrivateKey, serverCertOptions);

      // const destDir = `${userKeysDir}/${username}`;
      const destDir = `${userKeysDir}`;   //TODO: this assumes we only have one server

      if (!fs.existsSync(destDir)) {
        console.log(`making dir [${destDir}]`);
        fs.mkdirSync(destDir);
      }
      fs.writeFileSync(`${destDir}/${username}.crt`, certPem);
      fs.writeFileSync(`${destDir}/${username}.key`, privateKeyPem);
    }
  }
};

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
cert /tmp/openvpn/server.crt
key /tmp/openvpn/server.key`
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
  const vpnCidr = `${vpnClientNetworkSegment}/${vpnCidrPrefix}`;

  const internalNetworkCidrPrefix = subnetMaskToCidrPrefix(internalNetworkMask);

  return `configure

set interfaces openvpn vtun0 mode server
set interfaces openvpn vtun0 server subnet ${vpnCidr}
set interfaces openvpn vtun0 server push-route ${internalNetwork}/${internalNetworkCidrPrefix}
set interfaces openvpn vtun0 server name-server ${routerInternalIP}
 
set interfaces openvpn vtun0 tls ca-cert-file ${configDir}/ca.crt
set interfaces openvpn vtun0 tls cert-file ${configDir}/server.crt
set interfaces openvpn vtun0 tls key-file ${configDir}/server.key
set interfaces openvpn vtun0 tls dh-file ${configDir}/dh.pem

commit
save`;
};

/**** dh.pem ****/
export const generateDHParam = async (useStaticDHPerm = false) => {
  let dhParamsPem = staticDhPem;
  if (!useStaticDHPerm) {
    // create DH.pem
    console.log('start creating dhparam');

    // const dhParamsPem = dhparam();
    dhParamsPem = await generateDHParams();

    console.log('end creating dh.pem');
    console.log('dh.pem:', dhParamsPem);
  }

  fs.writeFileSync(dhPemFile, dhParamsPem);

  return dhParamsPem;
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

/************ check version */
// const sourceScriptTemplate = `source /opt/vyatta/etc/functions/script-template`
// export const getFirmwareVersionCommand = () => `${sourceScriptTemplate}
export const getFirmwareVersionCommand = () => `/opt/vyatta/bin/vyatta-op-cmd-wrapper show version | grep Version | awk '{print $2}' | cut -d'+' -f 1 | sed 's/^v//' | cut -d '.' -f 1-2`
// export const getFirewallRuleStatusCommand = () => `/opt/vyatta/bin/vyatta-op-cmd-wrapper show firewall name WAN_LOCAL | grep ':openvpn'`;
// export const getOpenVPNInterfaceCommand = () => `/opt/vyatta/bin/vyatta-show-interfaces.pl --action=show-brief --intf-type=openvpn`;
// export const getOpenVPNInterfaceCommand = () => `/opt/vyatta/bin/vyatta-op-cmd-wrapper show interfaces openvpn`;
export const getOpenVPNInterfaceCommand = () => `/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands | grep 'interfaces openvpn'`;

export const getOpenVPNInterfacePushRouteCommand = (vpnParameters) => {
  const {
    internalNetwork,
    internalNetworkMask,
  } = vpnParameters;

  const internalNetworkCidrPrefix = subnetMaskToCidrPrefix(internalNetworkMask);
  const pushRoute = `${internalNetwork}/${internalNetworkCidrPrefix}`;

  return `/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands | grep 'interfaces openvpn' | grep push-route | grep ${pushRoute}`;

}

// port forward
export const getPortForwardCommand = ({vpnPort = 1194}) => `/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands | grep 'set port-forward' | grep 'original-port ${vpnPort}'`;

export const getPortForwardForwardToAddressCommand = (ruleNumber) => {
  return `/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands | grep 'set port-forward rule ${ruleNumber}' | grep forward-to`;
}

// ls /opt/vyatta/share/vyatta-op/templates/show