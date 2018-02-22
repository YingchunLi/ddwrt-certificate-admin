import React, {Component} from 'react';
import _ from 'lodash';
import ip from 'ip';

import {
  Step,
  Stepper,
  // StepLabel,
  StepButton,
} from 'material-ui/Stepper';

import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import Snackbar from 'material-ui/Snackbar';

import VPNParameters from './VPNParameters';
import ClientOptions from './ClientOptions';
import ConfiguratorOutput from './ConfiguratorOutput';

const electron = window.require('electron');
const remote = electron.remote;
const {process} = remote;
const fs = remote.require('fs');

const executableDir = process.env.PORTABLE_EXECUTABLE_DIR || '.';

const electron_start_url = process.env.ELECTRON_START_URL;
const isDev = !!electron_start_url;

const caCertFile = `${executableDir}/ca.crt`;
const caPrivateKeyFile = `${executableDir}/ca.key`;
const caExists = fs.existsSync(caCertFile) && fs.existsSync(caPrivateKeyFile);

const os = remote.require('os');

const interfaces = os.networkInterfaces();
const privateAddresses = [];
const publicAddresses = [];
_.forEach(interfaces, (addresses, interfaceName) => {
  const noneInternalAddresses = addresses.filter(address => address.family === 'IPv4' && !address.internal);

  noneInternalAddresses.forEach(address => {
    if (address.internal) return;
    if (ip.isPrivate(address.address)) {
      privateAddresses.push({interfaceName, ...address});
    } else {
      publicAddresses.push({interfaceName, ...address});
    }

  });
});

console.log('****publicAddresses', publicAddresses);
console.log('****privateAddresses', privateAddresses);

const privateAddress = privateAddresses.length > 0 && privateAddresses[0].address;
const internalNetwork = privateAddress ? ip.mask(privateAddress, '255.255.255.0'): '192.168.1.0';
const routerInternalIP = ip.or(internalNetwork, '0.0.0.1');

const publicAddress = publicAddresses.length > 0 ? publicAddresses[0].address : isDev ? '47.23.38.149' : '';

class StepperApp extends Component {
  state = {
    vpnParameters: {
      numberOfUsers: isDev ? 3 : 1,
      userKeysDir:  executableDir,

      keySize:                1024,

      networkPublicIpOrDDNSAddressOfRouter: publicAddress,
      vpnPort:                1194,
      internalNetwork:    internalNetwork,
      routerInternalIP:       routerInternalIP,
      networkSegment:         '10.0.8.0',
      subnetMask:             '255.255.255.0',

      // other options
      optRegenerateCA:        (isDev && caExists) ? false: true,
      optStartWithWANUp:      true,
      optUseUDP:              true,
      optSendLANTrafficOnly:  true,
      optCertificateOnlyAuth: true,
    },
    clientOptions: isDev ? [{username: 'client1'},{username: 'client2'},{username: 'client3'}] : [{username: 'client1'}],

    configuratorOutput: {
      caCertPem:       '',
      caPrivateKeyPem:  '',
      dhParamsPem:      '',
      additionalConfig: '',
      ipTablesConfig: '',
      certificateStage: 0,
      stateText: '',
    },

    // stepper related
    finished: false,
    stepIndex: 0,

    // snackbar
    snackbarOpen: false,
    snackbarMessage: '',
  };

  handleNext = () => {
    const {stepIndex} = this.state;
    this.setState({
      stepIndex: stepIndex + 1,
      finished: stepIndex >= 2,
    });
  };

  handlePrev = () => {
    const {stepIndex} = this.state;
    if (stepIndex > 0) {
      this.setState({stepIndex: stepIndex - 1});
    }
  };

  handleVpnParametersChange = (vpnParameters) => {
    const clientOptions = this.state.clientOptions;
    let newClientOptions = _.cloneDeep(clientOptions);

    const numberOfUsers = vpnParameters.numberOfUsers;
    const currentNumberofUsers = this.state.vpnParameters.numberOfUsers;

    if (numberOfUsers !== currentNumberofUsers) {
      newClientOptions = newClientOptions.slice(0, numberOfUsers);

      if (newClientOptions.length < numberOfUsers) {
        newClientOptions[numberOfUsers - 1] = {username: `client${numberOfUsers}`};
        _.range(numberOfUsers).forEach(idx => {
            if (!newClientOptions[idx]) {
              newClientOptions[idx] = {username: `client${idx+1}`};
            }
          }
        );
      }
    }

    // handle server
    this.setState({clientOptions: newClientOptions, vpnParameters})
  };


  showMessage = (message) => {
    this.setState({
      snackbarMessage: message,
      snackbarOpen: true,
    });
  };

  hideMessage = () => {
    this.setState({
      snackbarOpen: false,
    });
  };

  render() {
    const {vpnParameters, clientOptions, configuratorOutput, finished, stepIndex} = this.state;
    const contentStyle = {margin: '0 16px'};

    const vpnParametersPage =
      <VPNParameters
        vpnParameters={vpnParameters}
        onChange={this.handleVpnParametersChange}
      />;

    const clientOptionsPage =
      <ClientOptions
        clientOptions={clientOptions}
        numberOfUsers={vpnParameters.numberOfUsers}
        certificateOnlyAuth={vpnParameters.optCertificateOnlyAuth}
        onChange={clientOptions => this.setState({clientOptions})}
      />;

    const configuratorOutputPage =
      <ConfiguratorOutput
        vpnParameters={vpnParameters}
        clientOptions={clientOptions}
        configuratorOutput={configuratorOutput}
        onChange={configuratorOutput => {console.log(configuratorOutput);this.setState({configuratorOutput})}}
        showMessage={this.showMessage}
      />;

    const getStepContent = (stepIndex) => {
      switch (stepIndex) {
        case 0:   return vpnParametersPage;
        case 1:   return clientOptionsPage;
        case 2:   return configuratorOutputPage;
        default:  return 'You\'re a long way from home sonny jim!';
      }
    };

    return (
      <div style={{width: '100%', margin: 'auto'}}>
        <Stepper linear={false} activeStep={stepIndex}>
          <Step>
            <StepButton onClick={() => this.setState({stepIndex: 0})}>VPN parameters</StepButton>
          </Step>
          <Step>
            <StepButton onClick={() => this.setState({stepIndex: 1})}>Usernames and passwords</StepButton>
          </Step>
          <Step>
            <StepButton onClick={() => this.setState({stepIndex: 2})}>Configurator Output</StepButton>
          </Step>
        </Stepper>
        <div style={contentStyle}>
          {finished ? (
            <p>
              <a
                href="#reset"
                onClick={(event) => {
                  event.preventDefault();
                  this.setState({stepIndex: 0, finished: false});
                }}
              >
                Click here
              </a> to rerun the program.
            </p>
          ) : (
            <div>
              {getStepContent(stepIndex)}
              <div style={{marginTop: 12}}>
                <FlatButton
                  label="Back"
                  disabled={stepIndex === 0}
                  onClick={this.handlePrev}
                  style={{marginRight: 12}}
                />
                <RaisedButton
                  label={stepIndex === 2 ? 'Finish' : 'Next'}
                  primary={true}
                  onClick={this.handleNext}
                />
              </div>
            </div>
          )}
        </div>

        <Snackbar
          open={this.state.snackbarOpen}
          message={this.state.snackbarMessage}
          autoHideDuration={2000}
          onRequestClose={this.hideMessage}
        />
      </div>
    );

  }
}

StepperApp.propTypes = {};
StepperApp.defaultProps = {};

export default StepperApp;
