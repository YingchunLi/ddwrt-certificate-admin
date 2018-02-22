import React from 'react';


import IconButton from 'material-ui/IconButton';
import DescriptionIcon from 'material-ui/svg-icons/action/description';

import {
  TableRow,
  TableRowColumn,
} from 'material-ui/Table';

import {RadioButton, RadioButtonGroup} from 'material-ui/RadioButton';
import TextField from 'material-ui/TextField';

const styles = {
  label: {
    // paddingLeft: 0,
    // paddingRight: 0,
    // width: '30%',
    // maxWidth: 350,
    // wordWrap: 'break-word',
  },

  element: {
    width: '66.7%',
    // width: '70%',
    // paddingLeft: 0,
    // paddingRight: 0,
    // overflowX: 'visible',
  },

  icon: {
    width: 50,
    // maxWidth: 50,
    paddingLeft: 0,
    paddingRight: 20,
    overflow: 'visible',
    verticalAlign: 'top',
    zIndex: 1000,
  },

  tooltip: {
    paddingRight: 20,
  }

};

// renders a table row
export const renderTableRow = (label, component, options = {}) => {
  const {displayBorder = false, key, copyToClipboard, autoLabelWidth=false} = options;
  const elementStyle = autoLabelWidth ? {width: '100%'} : styles.element;
  return (
    <TableRow displayBorder={displayBorder} key={key}>
      <TableRowColumn style={styles.label}><label>{label}</label></TableRowColumn>
      <TableRowColumn style={elementStyle}>
        {component}
        {
          copyToClipboard &&
          //{/*<TableRowColumn style={styles.icon}>*/}
          <IconButton
            style={styles.icon}
            // iconStyle={styles.icon}
            tooltipStyles={styles.tooltip}
            tooltip="Copy to clipboard"
            tooltipPosition="bottom-left"
            onClick={copyToClipboard}>
            <DescriptionIcon />
          </IconButton>
          // </TableRowColumn>
        }
      </TableRowColumn>

    </TableRow>
  );
};

// https://stackoverflow.com/questions/14313183/javascript-regex-how-do-i-check-if-the-string-is-ascii-only#answer-14313213
const isASCII = (str, extended) => {
  return (extended ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(str);
};

export const renderTextFieldTableRow = (label, fieldName, object, onChange, options = {}) => {
  const {
    required,
    filedType='text',
    min,
    max,
    pattern,
    hintText,
    validator,
    displayBorder = false,
    fieldComponent,
    checker,
  } = options;
  const numericAttributes = filedType === 'number' ? {min, max} : {};
  // const value = _.get(object, fieldName, '');
  const value = object[fieldName] || '';
  const _onChange = (fieldName, value) => isASCII(value) && (!validator || validator(value)) && onChange(fieldName, value);

  const errorRequired = required && !value && "This field is required";
  const errorPattern = pattern && !new RegExp(pattern).test(value) && "Input format is not valid";
  const errorChecker = checker && checker(value);

  const errorText = errorRequired || errorPattern || errorChecker;
  const component = fieldComponent ||
    <TextField  id={fieldName}
                type={filedType}
                value={value}
                onChange={(event, value) => _onChange(fieldName, value)}
                {...numericAttributes}
                pattern={pattern}
                hintText={hintText}
                errorText={errorText}
    />;
  return (
    <TableRow displayBorder={displayBorder} key={`row${fieldName}`}>
      <TableRowColumn style={styles.label}><label>{label}</label></TableRowColumn>
      <TableRowColumn style={styles.element}>{component}</TableRowColumn>
    </TableRow>
  );
};

export const renderRadioButtonGroup = (labels, values, groupName, object, onChange, options={}) => {
  const {option1Disabled=false, option2Disabled=false} = options;
  return (
    <RadioButtonGroup name={groupName}
                      valueSelected={object[groupName]}
                      onChange={(event, value) => onChange(groupName, value)}
    >
      <RadioButton label={labels[0]} value={values[0]} disabled={option1Disabled} />
      <RadioButton label={labels[1]} value={values[1]} disabled={option2Disabled} />
    </RadioButtonGroup>
  );
};

export const renderDropDownTableRow = (label, fieldName, object, onChange, options = {}) => {
  const {displayBorder = false} = options;
  const component =
    <TextField  id={fieldName}
                value={object[fieldName] || ''}
                onChange={(event, value) => onChange(fieldName, value)}
    />;
  return (
    <TableRow displayBorder={displayBorder} key={`row${fieldName}`}>
      <TableRowColumn><label>{label}</label></TableRowColumn>
      <TableRowColumn>{component}</TableRowColumn>
    </TableRow>
  );
};

export const subnetMaskToCidrPrefix = mask => {
  const maskNodes = mask.match(/(\d+)/g);
  let cidrPrefix = 0;
  for(let i in maskNodes) {
    cidrPrefix += (((maskNodes[i] >>> 0).toString(2)).match(/1/g) || []).length;
  }
  return cidrPrefix;
};