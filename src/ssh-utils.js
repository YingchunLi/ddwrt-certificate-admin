import {node_ssh, fs, tmp, path, ping} from "./environment";
import {caCertFile, serverCertFile, serverPrivateKeyFile, dhPemFile} from './environment';
import {
  generateFireWallConfigForEdgeRouter,
  generateVPNServerConfigForEdgeRouter,
  getFirmwareVersionCommand,
  getOpenVPNInterfaceCommand,
  getOpenVPNInterfacePushRouteCommand,
  getPortForwardCommand,
  getPortForwardForwardToAddressCommand,
}
from './vpn-utils';

const ssh = new node_ssh();

const connect = async (host, username, password, port=22) => {
  console.log(`opening connection`);
  const configs = {
    host,
    username,
    port,
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
      console.log("writing caPrivateKeyPem:" + caPrivateKeyPem);
      fs.writeFileSync(caPrivateKeyFileName, caPrivateKeyPem);
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
const runCommands = async (commands, deleteTempFiles = true) => {
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
    if (deleteTempFiles) return;
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

const readFileContentFromRouter = async (configs, filename, configDir='/config/auth') => {
  const {
    sshServer,
    sshUsername,
    sshPassword,
  } = configs;

  let connectionOpen = false;
  try {
    await connect(sshServer, sshUsername, sshPassword);
    connectionOpen = true;

    const commandResult = await ssh.execCommand(`cat ${configDir}/${filename}`);
    if (commandResult.stderr) {
      console.error(commandResult.stderr);
      throw new Error(commandResult.stderr.replace('cat: ', ''));
    }
    return commandResult.stderr ? null : commandResult.stdout;
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

const checkFileExistsOnRouter = async (configs, filename, configDir='/config/auth') => {
  // let connectionOpen = false;
  try {
    // await connect(sshServer, sshUsername, sshPassword);
    // connectionOpen = true;

    const commandResult = await ssh.execCommand(`ls ${configDir}/${filename}`);
    if (commandResult.stderr) {
      console.error(commandResult.stderr);
      return false;
    }
    return true;
  } catch (e) {
    // if (!connectionOpen) {
      // throw new Error("failed to open ssh connection: " + e.message);
    // } else {
      throw e;
    // }
  } finally {
    // close();
  }
};

export const executeCommand = async (command, errorCallback) => {
  const commandResult = await ssh.execCommand(command);
  console.log(commandResult)
  if (commandResult.stderr && errorCallback) {
    errorCallback(commandResult.stderr);
  }
  return commandResult.stderr ? null : commandResult.stdout;
}

export const executeCommandWithReturnCode = async (command) => {
  console.log(command);
  const commandResult = await ssh.execCommand(command);
  console.log(commandResult);
  return commandResult.code;
}

const pingHost = async (host) => {
  const response = await ping.promise.probe(host);
  console.log("response: " + response);
  return response;
}

export const checkSSHConfig = async(vpnParameters, configs, updateState, useExistingRouterCAKey) => {
    
  const {
    sshServer,
    sshUsername,
    sshPassword,
    sshPort,
  } = configs;

  try {
    // ping router 
    updateState(`Pinging remote host ${sshServer}...`)
    const pingResult = await pingHost(sshServer);
    updateState(" done", {append: true});

    if (!pingResult.alive) {
      console.error(`host not reachable`);
      throw new Error(`host ${sshServer} not reachable`);
    }

    // ssh to router
    updateState(`Trying ssh to remote host ${sshServer} on port ${sshPort} with given credential...`)
    const message = await connect(sshServer, sshUsername, sshPassword, sshPort);
    updateState(" done", {append: true});
    console.log(message);

    // get firmware version
    updateState(`Check firmware version`);
    const command = getFirmwareVersionCommand();
    const firmwareVersion = await executeCommand(command);
    updateState(`Firmware version is: ${firmwareVersion}`);
    if (Number(firmwareVersion) < 1.8) {
      throw new Error(`Firmware version is too old. Please update to latest firmware.`);
    }

    // check key exists
    if (useExistingRouterCAKey) {
      updateState(`Check Router CA key exists...`);
      const caKeyExistsOnRouter = await cAKeyFieExistsOnRouter(configs);
      updateState(caKeyExistsOnRouter ? ' Yes' : ' No', {append : true});
      if (! caKeyExistsOnRouter) {
        throw new Error(`No ca key file found on router`);
      }
    }

    // check fireware rule for vpn port
    updateState("Checking if openvpn virtual tunnel interface is set...");
    const openVPNInterfaceCommand = getOpenVPNInterfaceCommand(vpnParameters);
    const openvpnFirewallRuleEnabled = await executeCommandWithReturnCode(openVPNInterfaceCommand);
    if (openvpnFirewallRuleEnabled === 1) {
      updateState(`openvpn virtual tunnel interface is not configurated.`);
    } else {
      const openVPNInterfacePushRouteCommand = getOpenVPNInterfacePushRouteCommand(vpnParameters);
      const openvpnPushRouteSetCorrectly = await executeCommandWithReturnCode(openVPNInterfacePushRouteCommand);
      if (openvpnPushRouteSetCorrectly === 1) {
        throw new Error(`openvpn virtual tunnel interface config exists but push-route not set correctly!`)
      }
      updateState("openvpn virtual tunnel interface set correctly.");
    }

    // check port forward rule
    updateState("Checking if port forward rule is set...");
    const portForwardCommand = getPortForwardCommand(vpnParameters);
    const portForwardCommandResult = await ssh.execCommand(portForwardCommand);
    if (portForwardCommandResult.code === 1) {
      updateState(`No port-forward rule set on port ${vpnParameters.vpnPort}.`);
    } else {
      const portForwardRuleOutput = portForwardCommandResult.stdout;
      const matches = portForwardRuleOutput.match(/set port-forward rule (\d*) original-port/);
      if (matches) {
        const ruleNumber = matches[1];
        const portForwardForwardToAddressCommand = getPortForwardForwardToAddressCommand(ruleNumber);
        console.log(portForwardForwardToAddressCommand);
        const portForwardForwardToAddressOutput = await executeCommand(portForwardForwardToAddressCommand);
        console.log(portForwardForwardToAddressOutput);

        if (!portForwardForwardToAddressOutput) {
          throw new Error(`Error getting forward-to address for port-forward rule ${ruleNumber}`)
        }
        
        const forwardToAddressMatches = portForwardForwardToAddressOutput.match(/forward-to address (.*)/);
        if (!forwardToAddressMatches) {
          throw new Error(`Error getting forward-to address for port-forward rule ${ruleNumber}`)
        }
        const forwardToAddress = forwardToAddressMatches[1];

        const forwardToPortMatches = portForwardForwardToAddressOutput.match(/forward-to port (.*)/);
        if (!forwardToPortMatches) {
          throw new Error(`Error getting forward-to address for port-forward rule ${ruleNumber}`)
        }
        const forwardToPort = forwardToPortMatches[1];

        const forwardToAddressAndPort = `${forwardToAddress}:${forwardToPort}`;
        const expectedForwardToAddressAndPort = `${vpnParameters.networkPublicIpOrDDNSAddressOfRouter}:${vpnParameters.vpnPort}` 

        if (forwardToAddressAndPort !== expectedForwardToAddressAndPort) {
          throw new Error(`Port forward rule found for rule ${ruleNumber} with forward address [${forwardToAddressAndPort}]. Expected: [${expectedForwardToAddressAndPort}]`);
        }

        updateState(`Port forward rule found for rule ${ruleNumber} with correct forward address ${forwardToAddressAndPort}`);
      }
     updateState("No issue found with port forward rule.");
    }



    return message;

  } catch (e) {
    if (e.message.startsWith("connect ECONNREFUSED")) {
      throw new Error(`Error connectting ${sshServer} on port ${sshPort}. Check SSH service is open on the given port`)
    }
    if (e.message === "All configured authentication methods failed") {
      throw new Error(`SSH authentication error. Check if given user name and password are correct`)
    }
    throw e;
  } finally {
    close();
  }
};

export const loadCAKeyFromRouter = async (configs) => await readFileContentFromRouter(configs, "ca.key");
export const loadCACertFromRouter = async (configs) => await readFileContentFromRouter(configs, "ca.crt");
export const cAKeyFieExistsOnRouter = async (configs) => await checkFileExistsOnRouter(configs, "ca.key");
export const cACertFileExistsOnRouter = async (configs) => await checkFileExistsOnRouter(configs, "ca.crt");
