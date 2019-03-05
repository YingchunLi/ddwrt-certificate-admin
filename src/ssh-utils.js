import {node_ssh, fs} from "./environment";
import {caCertFile, caPrivateKeyFile, dhPemFile} from './environment';
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

const putCertificateFilesToRemote = async (remoteConfigDir='/config/auth') => {
  console.log(`creating remote dir ${remoteConfigDir}`);
  await ssh.mkdir(remoteConfigDir);
  console.log(`putting ca/server certificate file [${caCertFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(caCertFile, `${remoteConfigDir}/ca.crt`);
  console.log(`putting ca/server key file [${caCertFile}] to remote [${remoteConfigDir}]`);
  await ssh.putFile(caPrivateKeyFile, `${remoteConfigDir}/ca.key`);
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
  let localFilename, remoteFilename;
  let fileGenerated = false;
  let filePutToRemote = false;
  try {
    // 1. generate local file
    const filename = generateRandomFilename();
    localFilename = `${filename}.local`;
    remoteFilename = `/tmp/${filename}`;

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
  }
};

const generateRandomFilename = (length=10) => {
  let filename = "";
  const POSSIBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const POSSIBLE_CHARS_LENGTH = POSSIBLE_CHARS.length;

  for (let i = 0; i < length; i++) {
    const randomCharIndex = Math.floor(Math.random() * POSSIBLE_CHARS_LENGTH);
    filename += POSSIBLE_CHARS.charAt(randomCharIndex);
  }

  return filename;
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
  return ['begin', ...fireWallCommands, 'commit', 'end']
    .map(line => `${fireWallCommandPrefix} ${line}`)
    .join('\n');
};

const getVpnCommands = vpnParameters => generateVPNServerConfigForEdgeRouter(vpnParameters);

const generateCommands = (configs, vpnParameters, configDir) => {
  const vpnCommands = getVpnCommands(vpnParameters);
  const commands = `
 source /opt/vyatta/etc/functions/script-template   
 configure
 
 ${vpnCommands}
 
 commit
 save
  `;
  return commands;
};

export const autoConfigViaSSH = async (configs, vpnParameters, configDir='/config/auth') => {
  const {
    sshServer,
    sshUsername,
    sshPassword
  } = configs;

  let connectionOpen = false;
  try {
    await connect(sshServer, sshUsername, sshPassword);
    connectionOpen = true;

    await putCertificateFilesToRemote();

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
