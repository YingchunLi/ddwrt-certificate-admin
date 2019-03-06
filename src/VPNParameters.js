import React, {Component} from 'react';
import PropTypes from 'prop-types';

import _ from 'lodash';
import update from 'immutability-helper';

import {Card, CardHeader, CardText} from 'material-ui/Card';
import FlatButton from 'material-ui/FlatButton';
import {
  Table,
  TableBody,
} from 'material-ui/Table';
import TextField from 'material-ui/TextField';
import DropDownMenu from 'material-ui/DropDownMenu';
import MenuItem from 'material-ui/MenuItem';

import {renderTableRow, renderTextFieldTableRow, renderRadioButtonGroup} from './utils';
import {ADDRESS_BEING_CHECKED, ADDRESS_IS_REACHABLE, ADDRESS_NOT_REACHABLE} from "./utils";

import {dialog, fs, ping, checkIfCAExists} from './environment';
import {isEdgeRouterMode} from "./vpn-utils";

const certificatePropertiesFields = [
  ['Country', 'countryName'],
  ['Province', 'stateOrProvinceName'],
  ['City', 'localityName'],
  ['Organization', 'organizationName'],
  ['Email Address', 'email'],
  ['Key CN', 'commonName', {required: true}],
  ['Key Name', 'organizationalUnitName'],
  // ['PCKS11 Module Path', 'pcks11ModulePath'],
  // ['PCKS11 PIN', 'pcks11Pin'],
  // ['Key Size', 'keySize', true]
];

const IP_ADDRESS_PATTERN = String.raw`((^|\.)((25[0-5])|(2[0-4]\d)|(1\d\d)|([1-9]?\d))){4}$`;
const networkPropertiesFields =
  [
    // ['Public IP or DDNS Address of Router', 'networkPublicIpOrDDNSAddressOfRouter',
    //   {required: true, pattern: IP_ADDRESS_PATTERN}
    // ],
    ['Port of VPN', 'vpnPort',
      {
        required: true,
        filedType: 'number',
        min: 1,
        max: 65535,
        hintText: 'Enter a value between 1 and 65535',
        validator: value => Number(value) >= 1 && Number(value) <= 65535
      }
    ],
    ['Internal Network to be accessed (e.g. 192.168.1.0)', 'internalNetwork',
      {required: true, pattern: IP_ADDRESS_PATTERN, checker:
        (value) => value && !value.endsWith('.0') && 'network addresses usually end in ".0", but this entry doesn\'t'}
    ],
    ['Router internal IP', 'routerInternalIP',
      {required: true, pattern: IP_ADDRESS_PATTERN}
    ],
    ['Network segments for VPN Clients', 'networkSegment',
      {required: true, pattern: IP_ADDRESS_PATTERN}
    ],
    ['Subnet Mask for VPN Clients', 'subnetMask',
      {required: true, pattern: IP_ADDRESS_PATTERN}
    ],
  ];



class VPNParameters extends Component {

  state = {
    publicIpErrorText: undefined,
  };

  handleChange = (field, value) => {
    let newVPNParameters = update(this.props.vpnParameters, {[field]: {$set: value}});

    // change 'Router internal IP' according to 'Internal Network to be accessed' change
    if (field === 'internalNetwork') {
      if (value.endsWith('.0')) {
        newVPNParameters.routerInternalIP = value.replace(/\.0$/, '.1');
      }
    }
    this.props.onChange && this.props.onChange(newVPNParameters);
  };

  handleNumericChange = (field, value) => {
    const numericValue = Number(value);
    this.handleChange(field, numericValue);
  };

  changeNumberOfUsers = (event, index, value) => this.handleChange('numberOfUsers', value);

  pingAddress = _.debounce(host => {
    if (host.trim() === '') {
      this.setState({publicIpErrorText: 'This field is required'});
      return;
    }

    this.setState({publicIpErrorText: ADDRESS_BEING_CHECKED});
    ping.sys.probe(host, isAlive => {
      console.log('**** got ping result for host', host, '****isAlive', isAlive);
      if (isAlive) {
        this.setState({publicIpErrorText: ADDRESS_IS_REACHABLE});
      } else {
        if (host === this.props.vpnParameters.networkPublicIpOrDDNSAddressOfRouter) {
          this.setState({publicIpErrorText: ADDRESS_NOT_REACHABLE})
        } else {
          console.log('host does not equal to latest ip. ignore.', host, this.props.vpnParameters.networkPublicIpOrDDNSAddressOfRouter)
          if (this.state.publicIpErrorText === ADDRESS_BEING_CHECKED) {
            this.setState((prevState) => prevState.publicIpErrorText === ADDRESS_BEING_CHECKED && {publicIpErrorText: undefined});
          }
        }
      }
    });
  }, 1000);


  changePublicIpDDNS = (e, host) => {
    this.handleChange('networkPublicIpOrDDNSAddressOfRouter', host);
    this.pingAddress(host);
  };

  selectKeyDir = (e) => {
    const checkAndSetFilePath = (filePaths) => {
      if (filePaths && filePaths.length > 0) {
        const directory = filePaths[0];
        try {
          fs.accessSync(directory, fs.W_OK);

          this.handleChange('userKeysDir', directory);
        } catch (e) {
          // ignore any exception
          alert(`Directory [${directory}] is not writable!`)
        }
      }
    };

    dialog.showOpenDialog( {properties: ['openDirectory']}, checkAndSetFilePath);
    // e.preventDefault();
  };




  render() {
    const {vpnParameters = {}} = this.props;
    const edgeRouterMode = isEdgeRouterMode(vpnParameters.optRouterMode);
    const caExists = checkIfCAExists();

    const numberOfUsersElement =
      <DropDownMenu value={vpnParameters.numberOfUsers} onChange={this.changeNumberOfUsers} >
        {
          _.range(1, 11).map(v => <MenuItem key={v} value={v} primaryText={v} />)
        }
      </DropDownMenu>;

    const clientKeysDirectoryElement =
      <div style={{display: 'flex'}}>
        <TextField fullWidth={true} value={vpnParameters.userKeysDir} id="usrKeysDir"/>
        <FlatButton label="Browse" primary={true} onClick={this.selectKeyDir} />
      </div>;

    const keySizeElement =
      <DropDownMenu value={vpnParameters.keySize} onChange={(event, index, value) => this.handleChange('keySize', value)} >
        {
          [1024, 2048, 4096].map(v => <MenuItem key={v} value={v} primaryText={v} />)
        }
      </DropDownMenu>;

    return (
      <div>

        {vpnParameters.optRegenerateCA !== false &&
        <Card id="certificatePropertiesCard" initiallyExpanded={true}>
          <CardHeader title="Certificate Properties" actAsExpander={true} showExpandableButton={true}/>
          <CardText expandable={true}>
            <Table>
              <TableBody displayRowCheckbox={false} showRowHover={true}>
                {
                  certificatePropertiesFields.map(field => {
                    const [label, fieldName, options={}] = field;
                    const {filedType} = options;
                    const callback = filedType === 'number' ? this.handleNumericChange : this.handleChange;
                    return renderTextFieldTableRow(label, fieldName, vpnParameters, callback, options);
                  })
                }
                {
                  renderTableRow('Key Size', keySizeElement)
                }
              </TableBody>
            </Table>
          </CardText>
        </Card>
        }

        <Card id="networkPropertiesCard" initiallyExpanded={true}>
          <CardHeader title="Network Properties" actAsExpander={true} showExpandableButton={true} />
          <CardText expandable={true}>
            <Table>
              <TableBody displayRowCheckbox={false} showRowHover={true}>

                {
                  renderTableRow('Public IP or DDNS Address of Router',
                    <TextField id='networkPublicIpOrDDNSAddressOfRouter'
                               value={vpnParameters.networkPublicIpOrDDNSAddressOfRouter}
                               onChange={this.changePublicIpDDNS}
                               errorText={this.state.publicIpErrorText || (vpnParameters.networkPublicIpOrDDNSAddressOfRouter === '' && 'This Field is Required')}
                               errorStyle={this.state.publicIpErrorText === ADDRESS_IS_REACHABLE ? {color: '#8cc152'} :
                                 this.state.publicIpErrorText === ADDRESS_BEING_CHECKED ? {color: '#f6bb42'} :
                                 undefined}
                    />)
                }

                {
                  networkPropertiesFields.map(field => {
                    const [label, fieldName, options={}] = field;
                    const {filedType} = options;
                    const callback = filedType === 'number' ? this.handleNumericChange : this.handleChange;
                    return renderTextFieldTableRow(label, fieldName, vpnParameters, callback, options);
                  })
                }

              </TableBody>
            </Table>
          </CardText>
        </Card>

        <Card id="otherOptionsCard" initiallyExpanded={true}>
          <CardHeader title="Other Options" actAsExpander={true} showExpandableButton={true} />
          <CardText expandable={true}>
            <Table>
              <TableBody displayRowCheckbox={false} showRowHover={true}>
                {
                  renderTableRow('Router mode',
                    renderRadioButtonGroup(['DD-WRT', 'Edge Router'], ['DD-WRT', 'EDGE-SERVER'],
                      'optRouterMode', vpnParameters, this.handleChange))
                }

                {
                  renderTableRow('Start with WAN Up, right?',
                    renderRadioButtonGroup(['Yes', 'No, just on startup'], [true, false],
                      'optStartWithWANUp', vpnParameters, this.handleChange,
                      {option1Disabled: edgeRouterMode, option2Disabled: edgeRouterMode}),
                    {'padding-bottom': '10px'}
                  )
                }

                {
                  renderTableRow('Generate a new CA, right?',
                    renderRadioButtonGroup(['Yes, keep it extra secure', 'No, use the existing one'], [true, false],
                      'optRegenerateCA', vpnParameters, this.handleChange, {option2Disabled: !caExists}))
                }

                {
                  renderTableRow('Use UDP, right?',
                    renderRadioButtonGroup(['Yes', 'No, Use TCP Instead'], [true, false],
                      'optUseUDP', vpnParameters, this.handleChange))
                }

                {
                  renderTableRow('Just send LAN traffic over the VPN, right?',
                    renderRadioButtonGroup(['Yes', 'No, send everything'], [true, false],
                      'optSendLANTrafficOnly', vpnParameters, this.handleChange))
                }

                {
                  renderTableRow('Certificate-only authentication is fine, right?',
                    renderRadioButtonGroup(['Yes', 'No, I need to specify users and passwords,too'], [true, false],
                      'optCertificateOnlyAuth', vpnParameters, this.handleChange))
                }

                {
                  renderTableRow('Number of users to generate', numberOfUsersElement)
                }

                {
                  renderTableRow('Directory to put generated user certificates and keys', clientKeysDirectoryElement)
                }


              </TableBody>
            </Table>
          </CardText>
        </Card>

      </div>
    );
  }
}

VPNParameters.propTypes = {
  vpnParameters:  PropTypes.object,
  onChange:       PropTypes.func,
};
VPNParameters.defaultProps = {};

export default VPNParameters;
