import React from 'react';
import ReactDOM from 'react-dom';


// Theming
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
// import getMuiTheme from 'material-ui/styles/getMuiTheme';

// import * as Theme from './theme';

// import './bootstrap.css';
import App from './App';

// theme customization: not used now
// const muiTheme = getMuiTheme({
//   palette: {
//     primary1Color: Theme.PRIMARY_COLOR,
//     primary2Color: Theme.PRIMARY_COLOR_DARKER,
//     accent1Color: Theme.SECONDARY_COLOR,
//     pickerHeaderColor: Theme.PRIMARY_COLOR,
//   },
// });


ReactDOM.render(
  <MuiThemeProvider >
    <App/>
  </MuiThemeProvider>,
  document.getElementById('root')
);
