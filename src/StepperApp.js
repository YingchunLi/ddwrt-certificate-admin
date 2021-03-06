import React, {Component} from 'react';
import _ from 'lodash';

import {Step, StepButton, Stepper} from 'material-ui/Stepper';

import FlatButton from 'material-ui/FlatButton';
import RaisedButton from 'material-ui/RaisedButton';
import Snackbar from 'material-ui/Snackbar';

import VPNParameters from './VPNParameters';
import CertificateOptions from './CertificateOptions';
import ConfiguratorOutput from './ConfiguratorOutput';

import {executableDir, changeKeyfilesPath, isDev, publicAddress, internalNetwork, routerInternalIP} from './environment';
import {VPN_OPTION_CA_GENERATE_NEW, VPN_OPTION_CA_USE_EXISTING_ROUTE} from "./vpn-utils";

const INITIAL_STATE = {
  vpnParameters: {
    numberOfUsers: isDev ? 3 : 1,
    userKeysDir:  executableDir,

    // certificate properties
    commonNameHasBeenSet:   false,        //indicate if user has entered common name or not
    keySize:                2048,
    certificateDuration:    1,            //how long the certificate would be valid

    // network properties
    networkPublicIpOrDDNSAddressOfRouter: isDev ? (publicAddress || '192.168.1.1') : publicAddress,
    vpnPort:                1194,
    internalNetwork:        internalNetwork,
    internalNetworkMask:    '255.255.255.0',
    routerInternalIP:       routerInternalIP,
    vpnClientNetworkSegment:'10.0.8.0',
    vpnClientSubnetMask:    '255.255.255.0',

    // other options
    optRouterMode:          'EDGE-SERVER',
    optRegenerateCA:        isDev ? VPN_OPTION_CA_USE_EXISTING_ROUTE : VPN_OPTION_CA_GENERATE_NEW,
    caKeysDir:              '',
    optStartWithWANUp:      true,
    optUseUDP:              true,
    optSendLANTrafficOnly:  true,
    optCertificateOnlyAuth: true,
    optPrependClientOutputFileNameWithIPDDNSName: false,
  },
  serverOptions: [{username: 'server'}],
  clientOptions: isDev ? [{username: 'client1'},{username: 'client2'},{username: 'client3'}] : [{username: 'client1'}],
  showServerOptions: false,

  configuratorOutput: {
    configuratorMode: 'manual',
    sshServer:      isDev ? (publicAddress || '192.168.1.1') : '',
    sshServerErrorText: '',
    sshPort:        22,
    sshUsername:    isDev ? 'ubnt': '',
    sshPassword:    isDev ? 'ubnt': '',

    optStoreCaKeys: 'none',
    caKeysDir:      '',

    caCertPem:       '',
    caPrivateKeyPem:  '',
    dhParamsPem:      '',
    additionalConfig: '',
    ipTablesConfig: '',
    certificateStage: 0,    // 0 - not started, 1 - in progress, 2 - done
    stateTexts : [],
    preFlightCheckState: '',

    ignoreConfigurationErrors: false,
  },

  // stepper related
  finished: false,
  stepIndex: 0,

  // snackbar
  snackbarOpen: false,
  snackbarMessage: '',
};

class StepperApp extends Component {
  state = INITIAL_STATE;

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
    // update clientOptions and configuartorOutput if needed
    const clientOptions = this.updateClientOptions(vpnParameters);
    const configuratorOutput = this.updateConfiguratorOptions(vpnParameters);
    this.setState({vpnParameters, clientOptions, configuratorOutput});
  };

  updateClientOptions = (vpnParameters) => {
    let newClientOptions = _.cloneDeep(this.state.clientOptions);

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
    return newClientOptions;
  };

  updateConfiguratorOptions = (vpnParameters) => {
    if (vpnParameters.optRegenerateCA === VPN_OPTION_CA_USE_EXISTING_ROUTE) {
      return {...this.state.configuratorOutput, configuratorMode : 'ssh'};
    }

    return this.state.configuratorOutput;
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

  resetConfiguration = (event) => {
    event.preventDefault();
    changeKeyfilesPath(executableDir);
    this.setState({...INITIAL_STATE, stepIndex: 0, finished: false});
  };

  onUpdateState = (newStateText, {append, certificateStage} = {}) => {
    this.setState((prevState, props) => {
      const previousStateTexts = _.clone(prevState.configuratorOutput.stateTexts);
      var stateTexts = [];
      if (append) {
        var lastPreviousStateText = _.last(previousStateTexts);
        lastPreviousStateText += newStateText;
        stateTexts = _.take(previousStateTexts, previousStateTexts.length -1)
        stateTexts.push(lastPreviousStateText);
      } else {
        stateTexts = [...previousStateTexts, newStateText];
      }
      const configuratorOutput = {...prevState.configuratorOutput, stateTexts, certificateStage};
      return {...prevState, configuratorOutput};
      
    })
  };

  render() {
    const {vpnParameters, serverOptions, clientOptions, showServerOptions, configuratorOutput, finished, stepIndex} = this.state;
    const contentStyle = {margin: '0 16px'};

    const vpnParametersPage =
      <VPNParameters
        vpnParameters={vpnParameters}
        onChange={this.handleVpnParametersChange}
      />;

    const clientOptionsPage =
      <div>
        {serverOptions && showServerOptions &&
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

        // onChange={configuratorOutput => {console.log(configuratorOutput);this.setState({configuratorOutput})}}
        onFieldChange={fieldStatus => {this.setState((prevState) => ({configuratorOutput: {...prevState.configuratorOutput, ...fieldStatus}}))}}
        onUpdateState={this.onUpdateState}
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
                  this.resetConfiguration(event);
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
