import React, {Component} from 'react';
import _ from 'lodash';

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
import CertificateOptions from './CertificateOptions';
import ConfiguratorOutput from './ConfiguratorOutput';

import {executableDir, isDev, caExists} from './environment';
import {publicAddress, internalNetwork, routerInternalIP} from './environment';

class StepperApp extends Component {
  state = {
    vpnParameters: {
      numberOfUsers: isDev ? 3 : 1,
      userKeysDir:  executableDir,

      keySize:                2048,

      networkPublicIpOrDDNSAddressOfRouter: publicAddress,
      vpnPort:                1194,
      internalNetwork:        internalNetwork,
      routerInternalIP:       routerInternalIP,
      networkSegment:         '10.0.8.0',
      subnetMask:             '255.255.255.0',

      // other options
      optRouterMode:          'DD-WRT',
      optRegenerateCA:        !(isDev && caExists),
      optStartWithWANUp:      true,
      optUseUDP:              true,
      optSendLANTrafficOnly:  true,
      optCertificateOnlyAuth: true,
      optPrependClientOutputFileNameWithIPDDNSName: false,
    },
    // serverOptions: [{username: 'server1'}],
    clientOptions: isDev ? [{username: 'client1'},{username: 'client2'},{username: 'client3'}] : [{username: 'client1'}],

    configuratorOutput: {
      configuratorMode: 'manual',
      sshServer:      isDev ? publicAddress : '',
      sshServerErrorText: '',
      sshPort:        22,
      sshUsername:    isDev ? 'ubnt': '',
      sshPassword:    '',

      caCertPem:       '',
      caPrivateKeyPem:  '',
      dhParamsPem:      '',
      additionalConfig: '',
      ipTablesConfig: '',
      certificateStage: 0,
      stateText: '',
    },

    configuratorStatus : {
      sshAutoConfigureOutput: '',
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
    const {vpnParameters, serverOptions, clientOptions, configuratorOutput, configuratorStatus, finished, stepIndex} = this.state;
    const contentStyle = {margin: '0 16px'};

    const vpnParametersPage =
      <VPNParameters
        vpnParameters={vpnParameters}
        onChange={this.handleVpnParametersChange}
      />;

    const clientOptionsPage =
      <div>
        {serverOptions &&
        <CertificateOptions
          mode="Server"
          certificateOptions={serverOptions}
          numberOfUsers={vpnParameters.numberOfUsers}
          certificateOnlyAuth={vpnParameters.optCertificateOnlyAuth}
          onChange={serverOptions => this.setState({serverOptions})}
        />
        }
        <CertificateOptions
          certificateOptions={clientOptions}
          numberOfUsers={vpnParameters.numberOfUsers}
          certificateOnlyAuth={vpnParameters.optCertificateOnlyAuth}
          onChange={clientOptions => this.setState({clientOptions})}
        />
      </div>;

    const configuratorOutputPage =
      <ConfiguratorOutput
        vpnParameters={vpnParameters}
        serverOptions={serverOptions}
        clientOptions={clientOptions}
        configuratorOutput={configuratorOutput}
        onChange={configuratorOutput => {console.log(configuratorOutput);this.setState({configuratorOutput})}}
        onFieldChange={fieldStatus => {this.setState((prevState) => ({configuratorOutput: {...prevState.configuratorOutput, ...fieldStatus}}))}}
        configuratorStatus={configuratorStatus}
        onConfiguratorStatusChange={(key, value) => this.setState({configuratorStatus: {...configuratorStatus, [key]: value}})}
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
