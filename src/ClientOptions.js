import React from 'react';
import PropTypes from 'prop-types';

import update from 'immutability-helper';

import _ from 'lodash';

import {Card, CardHeader, CardText} from 'material-ui/Card';
import { Table, TableBody, } from 'material-ui/Table';

import TextField from 'material-ui/TextField';

import {renderTableRow} from './utils';

const ClientOption = ({clientOption, idx, certificateOnlyAuth, nameCounts, onChange}) => {
  const handleChange = (field, value) => {
    const newClientOption = update(clientOption, {[field]: {$set: value}});
    onChange(idx, newClientOption);
  };

  const errorText = (nameCounts && nameCounts[clientOption.username] > 1) ? 'Duplicate username': '';
  return (
    <Card key={idx} initiallyExpanded={true}>
      {/*<CardHeader title={`Client ${idx + 1} Options`} actAsExpander={true} showExpandableButton={true}/>*/}
      <CardHeader title={`Client ${idx + 1} Options`} />
      {/*<CardText expandable={true}>*/}
      <CardText>
        <Table>
          <TableBody displayRowCheckbox={false} showRowHover={true}>
            {
              renderTableRow('Client File Username',
                <TextField
                  id={`client${idx+1}Username`}
                  value={clientOption.username || ''}
                  errorText={errorText}
                  onChange={(event, value)  => handleChange('username', value) }
                />
              )
            }

            {
              !certificateOnlyAuth &&
              renderTableRow('Client File Password',
                <TextField
                  id={`client${idx+1}Password`}
                  value={clientOption.password || ''}
                  onChange={(event, value)  => handleChange('password', value) }
                />
              )
            }

          </TableBody>
        </Table>
      </CardText>
    </Card>
  );
};


const ClientOptions = ({clientOptions, certificateOnlyAuth, onChange}) => {

  const nameCounts = _.countBy(clientOptions, clientOption => clientOption.username);

  const handleClientOptionChange = (clientIdx, clientOption) => {
    let newClientOptions = clientOptions.slice();
    newClientOptions[clientIdx] = clientOption;
    onChange(newClientOptions);
  };

  // console.log('****', 'ClientOptions rendered with clientOptions:', clientOptions);
  return (
    <div>
      {
        clientOptions.map((clientOption, idx) =>
          <ClientOption
            key={idx}
            clientOption={clientOption}
            idx={idx}
            certificateOnlyAuth={certificateOnlyAuth}
            onChange={handleClientOptionChange}
            nameCounts={nameCounts}
          />
        )
      }
    </div>
  );
};

ClientOptions.propTypes = {
  numberOfUsers:        PropTypes.number,
  certificateOnlyAuth:  PropTypes.bool,
};
ClientOptions.defaultProps = {};

export default ClientOptions;
