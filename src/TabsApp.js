import React, {Component} from 'react';
import {Tabs, Tab} from 'material-ui/Tabs';

import InputIcon from 'material-ui/svg-icons/action/input';
import SettingsIcon from 'material-ui/svg-icons/action/settings';
import BuildIcon from 'material-ui/svg-icons/action/build';

import VPNParameters from './VPNParameters';
import ClientOptions from './ClientOptions';
import ConfiguratorOutput from './ConfiguratorOutput';

class TabsApp extends Component {
  state = {
    vpnParameters: {
      numberOfUsers: 1,
    },
    clientOptions: {},
  };

  render() {
    const {vpnParameters} = this.state;

    return (
      <Tabs>
        <Tab icon={<InputIcon />} label="VPN parameters" >
          <VPNParameters onChange={vpnParameters => this.setState({vpnParameters})}/>
        </Tab>

        <Tab icon={<SettingsIcon />} label="Usernames and passwords" >
          <ClientOptions
            numberOfUsers={vpnParameters.numberOfUsers}
            certificateOnlyAuth={vpnParameters.certificateOnlyAuth || true}
          />
        </Tab>

        <Tab icon={<BuildIcon />} label="Configurator Output" >
          <ConfiguratorOutput
            vpnParameters={vpnParameters}
            certificateOnlyAuth={vpnParameters.certificateOnlyAuth || true}
          />
        </Tab>
      </Tabs>
    );
  }
}

TabsApp.propTypes = {};
TabsApp.defaultProps = {};

export default TabsApp;
