import {node_ssh, fs, tmp, path} from "./environment";
import {caCertFile, serverCertFile, serverPrivateKeyFile, dhPemFile} from './environment';
import {generateFireWallConfigForEdgeRouter, generateVPNServerConfigForEdgeRouter} from './vpn-utils';

const ssh = new node_ssh();

const connect = async (host, username, password) => {
  console.log(`opening connection`);
  const configs = {
    host,
    username,
    port: 22,
    password,
    tryKeyboard: true,
    onKeyboardInteractive: (name, instructions, instructionsLang, prompts, finish) => {
      if (prompts.length > 0 && prompts[0].prompt.toLowerCase().includes('password')) {
        finish([password])
      }
    }
  };
  await ssh.connect(configs);
};

const putCertificateFilesToRemote = async (storeCaKeys, caPrivateKeyPem, remoteConfigDir='/config/auth') => {
  console.log(`creating remote dir ${remoteConfigDir}`);
  await ssh.mkdir(remoteConfigDir);

  console.log(`putting ca certificate file [${caCertFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(caCertFile, `${remoteConfigDir}/ca.crt`);

  if (storeCaKeys === 'router') {
    const [caPrivateKeyFile, caPrivateKeyFileName] = generateRandomFile();
    console.log(`putting ca key file [${caPrivateKeyFileName}] to remote [${remoteConfigDir}]`);
    try {
      fs.writeFileSync(caPrivateKeyFileName, caPrivateKeyFileName);
      await ssh.putFile(caPrivateKeyFileName, `${remoteConfigDir}/ca.key`);
    } finally {
      caPrivateKeyFile.removeCallback();
    }
  }

  console.log(`putting server certificate file [${serverCertFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(serverCertFile, `${remoteConfigDir}/server.crt`);

  console.log(`putting server key file [${serverPrivateKeyFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(serverPrivateKeyFile, `${remoteConfigDir}/server.key`);

  console.log(`putting dh pem file [${dhPemFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(dhPemFile, `${remoteConfigDir}/dh.pem`);
};

const putCommandFileToRemote = async (localFilename, remoteFilename) => {
  console.log(`putting local command file [${localFilename}] to remote [${remoteFilename}]`);
  await ssh.putFile(localFilename, remoteFilename);
};

const executeRemoteCommandFile = async (filename) => {
  console.log("executing remote command file: " + filename);
  await ssh.exec('/bin/bash', [filename], {
    // cwd: '/var/www',
    onStdout(chunk) {
      console.log('[stdout][execute]:', chunk.toString('utf8'))
    },
    onStderr(chunk) {
      console.log('[stderr][execute]:', chunk.toString('utf8'))
    },
  });
};

const removeRemoteCommandFile = async (remoteFilename) => {
  console.log("removing remote command file: " + remoteFilename);
  await ssh.exec('rm', [remoteFilename], {
    // cwd: '/var/www',
    onStdout(chunk) {
      console.log('[stdout][remove file]:', chunk.toString('utf8'))
    },
    onStderr(chunk) {
      console.log('remove file:', chunk.toString('utf8'))
    },
  });
};

const close = () => {
  console.log("closing connection");
  ssh.dispose();
};

// https://stackoverflow.com/questions/20907125/how-execute-multiple-commands-on-ssh2-using-nodejs
const runCommands = async (commands) => {
  console.log(commands);
  let tempfile, filename, localFilename, remoteFilename;
  let fileGenerated = false;
  let filePutToRemote = false;
  try {
    // 1. generate local file
    [tempfile, localFilename, filename] = generateRandomFile();
    remoteFilename = `/tmp/${filename}`;

    console.log(filename);
    console.log(localFilename);
    console.log(remoteFilename);

    generateCommandFileLocally(localFilename, commands);
    fileGenerated = true;

    await putCommandFileToRemote(localFilename, remoteFilename);
    filePutToRemote = true;

    // execute command remotely
    await executeRemoteCommandFile(remoteFilename);
  } catch (e) {
    throw new Error("Error running command:" + e.message);
  } finally {
    if (filePutToRemote) await removeRemoteCommandFile(remoteFilename);
    if (fileGenerated) removeLocalCommandFile(localFilename);
    if (tempfile) tempfile.removeCallback();
  }
};

const generateRandomFile = () => {
  const tempfile = tmp.fileSync();
  const filename = tempfile.name;
  console.log(filename);
  console.log(path.basename(filename));
  return [tempfile, filename, path.basename(filename)]
};

const generateCommandFileLocally = (fileName, commands) => {
  console.log(`generating local command file [${fileName}]`);
  fs.writeFileSync(fileName, commands);
};

const removeLocalCommandFile = localFilename => {
  console.log("removing local command file: " + localFilename);
  fs.unlinkSync(localFilename);
};

const generateFireWallConfigCommands = vpnParameters => {
  const fireWallCommandPrefix = '/opt/vyatta/sbin/vyatta-cfg-cmd-wrapper';
  const fireWallCommands = generateFireWallConfigForEdgeRouter(vpnParameters).split('\n');
  return ['begin', ...fireWallCommands, 'end']
    .map(line => `${fireWallCommandPrefix} ${line}`)
    .join('\n');
};

const getVpnCommands = vpnParameters => generateVPNServerConfigForEdgeRouter(vpnParameters);

const generateCommands = (configs, vpnParameters, configDir) => {
  const vpnCommands = getVpnCommands(vpnParameters);
  const commands = `
 source /opt/vyatta/etc/functions/script-template   
 
 ${vpnCommands}
 
 sudo killall -HUP openvpn
 
  `;
  return commands;
};

export const autoConfigViaSSH = async (configs, vpnParameters, configDir='/config/auth') => {
  const {
    sshServer,
    sshUsername,
    sshPassword,
    optStoreCaKeys,
    caPrivateKeyPem,
  } = configs;


  let connectionOpen = false;
  try {
    await connect(sshServer, sshUsername, sshPassword);
    connectionOpen = true;

    await putCertificateFilesToRemote(optStoreCaKeys, caPrivateKeyPem);

    const commands = generateCommands(configs, vpnParameters, configDir);
    await runCommands(commands);

    const fireWallCommands = generateFireWallConfigCommands(vpnParameters);
    await runCommands(fireWallCommands);

  } catch (e) {
    if (!connectionOpen) {
      throw new Error("failed to open ssh connection: " + e.message);
    } else {
      throw e;
    }
  } finally {
    close();
  }
};
