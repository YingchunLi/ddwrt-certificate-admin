import {getVpnCommands} from './ssh-utils';
import {subnetMaskToCidrPrefix} from "./utils";

export const isDdWrtMode = routerMode => routerMode === 'DD-WRT';
export const isEdgeRouterMode = routerMode => routerMode === 'EDGE-SERVER';


/************* open vpn server settings *********/

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

export const generateAdditionalConfig = (vpnParameters) => {
  if (isDdWrtMode(vpnParameters.optRouterMode)) {
    return generateVPNServerConfigForDDWRT(vpnParameters)
  } else if (isEdgeRouterMode(vpnParameters.optRouterMode)) {
    return generateVPNServerConfigForEdgeRouter(vpnParameters);
  }
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
