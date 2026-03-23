import _ from "lodash";
const ipUtils = {
  isPrivate: (addr) => {
    const parts = addr.split('.');
    if (parts.length === 4) {
      const p1 = parseInt(parts[0], 10);
      const p2 = parseInt(parts[1], 10);
      return (p1 === 10) ||
             (p1 === 172 && (p2 >= 16 && p2 <= 31)) ||
             (p1 === 192 && typeof p2 === 'number' && p2 === 168) ||
             (p1 === 127) ||
             (p1 === 169 && p2 === 254);
    }
    return /^fe80:/i.test(addr) || /^fc[0-9a-f]{2}:/i.test(addr) || /^fd[0-9a-f]{2}:/i.test(addr) || addr === '::1';
  },
  ipToInt: (ipStr) => {
    if (!ipStr || typeof ipStr !== 'string') return 0;
    return ipStr.split('.').reduce((int, octet) => (int << 8) + parseInt(octet, 10), 0) >>> 0;
  },
  intToIp: (int) => [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.'),
  mask: (ipStr, maskStr) => {
    return ipUtils.intToIp(ipUtils.ipToInt(ipStr) & ipUtils.ipToInt(maskStr));
  },
  or: (ipStr, maskStr) => {
    return ipUtils.intToIp(ipUtils.ipToInt(ipStr) | ipUtils.ipToInt(maskStr));
  }
};

// Use @electron/remote in modern Electron
const { clipboard, shell } = window.require('electron');
const remote = window.require('@electron/remote');
export { remote, clipboard };
export const dialog = remote.dialog;
export { shell };

// Access Node modules through remote in renderer
export const fs = remote.require('fs');
export const os = remote.require('os');
export const ping = remote.require('ping');
export const node_ssh = remote.require('node-ssh');
export const tmp = remote.require('tmp');
export const path = remote.require('path');

tmp.setGracefulCleanup();

// env related
const {process} = remote;
const electron_start_url = process.env.ELECTRON_START_URL;
export const executableDir = process.env.PORTABLE_EXECUTABLE_DIR || './output';
export const isDev = !!electron_start_url;        // we are in dev mode env ELECTRON_START_URL is set

// ca files
export let caCertFile = `${executableDir}/ca.crt`;
export let serverCertFile = `${executableDir}/server.crt`;
export let serverPrivateKeyFile = `${executableDir}/server.key`;
export let dhPemFile = `${executableDir}/dh.pem`;
export const changeKeyfilesPath = (keyFilesDir) => {
  caCertFile = `${keyFilesDir}/ca.crt`;
  serverCertFile = `${keyFilesDir}/server.crt`;
  serverPrivateKeyFile = `${keyFilesDir}/server.key`;
  dhPemFile = `${keyFilesDir}/dh.pem`;
};

// network address
const interfaces = os.networkInterfaces();
const privateAddresses = [];
const publicAddresses = [];
_.forEach(interfaces, (addresses, interfaceName) => {
  const noneInternalAddresses = addresses.filter(address => address.family === 'IPv4' && !address.internal);

  noneInternalAddresses.forEach(address => {
    if (address.internal) return;
    if (ipUtils.isPrivate(address.address)) {
      privateAddresses.push({interfaceName, ...address});
    } else {
      publicAddresses.push({interfaceName, ...address});
    }

  });
});

console.log('****publicAddresses', publicAddresses);
console.log('****privateAddresses', privateAddresses);

const privateAddress = privateAddresses.length > 0 && privateAddresses[0].address;
export const internalNetwork = isDev ? (privateAddress ? ipUtils.mask(privateAddress, '255.255.255.0'): '192.168.1.0') : '';

export const routerInternalIP = ipUtils.or(internalNetwork, '0.0.0.1');

export const publicAddress = publicAddresses.length > 0 ? publicAddresses[0].address :  '';
