import React from 'react';
import PropTypes from 'prop-types';

import update from 'immutability-helper';

import _ from 'lodash';

import {Card, CardHeader, CardText} from 'material-ui/Card';
import { Table, TableBody, } from 'material-ui/Table';

import TextField from 'material-ui/TextField';

import {renderTableRow} from './utils';

const CertificateOption = ({certificateOption, idx, certificateOnlyAuth, nameCounts, onChange, mode}) => {
  const handleChange = (field, value) => {
    const newOption = update(certificateOption, {[field]: {$set: value}});
    onChange(idx, newOption);
  };
  const errorText = (nameCounts && nameCounts[certificateOption.username] > 1) ? 'Duplicate username': '';
  return (
    <Card key={idx} initiallyExpanded={true}>
      {/*<CardHeader title={`Client ${idx + 1} Options`} actAsExpander={true} showExpandableButton={true}/>*/}
      <CardHeader title={mode === 'Server' ? 'Server Options' : `${mode} ${idx + 1} Options`} />
      {/*<CardText expandable={true}>*/}
      <CardText>
        <Table>
          <TableBody displayRowCheckbox={false} showRowHover={true}>
            {
              renderTableRow(`${mode} File Username`,
                <TextField
                  id={`${mode}${idx+1}Username`}
                  value={certificateOption.username || ''}
                  errorText={errorText}
                  onChange={(event, value)  => handleChange('username', value) }
                />
              )
            }

            {
              !certificateOnlyAuth &&
              renderTableRow(`${mode} File Password`,
                <TextField
                  id={`${mode}${idx+1}Password`}
                  value={certificateOption.password || ''}
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


const CertificateOptions = ({certificateOptions, certificateOnlyAuth, onChange, mode="Client"}) => {

  const nameCounts = _.countBy(certificateOptions, option => option.username);

  const handleCertificateOptionChange = (idx, option) => {
    let newOptions = certificateOptions.slice();
    newOptions[idx] = option;
    onChange(newOptions);
  };

  return (
    <div>
      {
        certificateOptions.map((certificateOption, idx) =>
          <CertificateOption
            mode={mode}
            key={idx}
            certificateOption={certificateOption}
            idx={idx}
            certificateOnlyAuth={certificateOnlyAuth}
            onChange={handleCertificateOptionChange}
            nameCounts={nameCounts}
          />
        )
      }
    </div>
  );
};

CertificateOptions.propTypes = {
  numberOfUsers:        PropTypes.number,
  certificateOnlyAuth:  PropTypes.bool,
};
CertificateOptions.defaultProps = {};

export default CertificateOptions;
