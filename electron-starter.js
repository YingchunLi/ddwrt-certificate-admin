const electron = require('electron');
// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

const path = require('path');
const url = require('url');
const fs = require('fs');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const dialog = electron.dialog;

function createWindow () {
  // Allow dev server ports if restricted
  if (process.env.ELECTRON_START_URL) {
    const urlObj = new URL(process.env.ELECTRON_START_URL);
    app.commandLine.appendSwitch('explicitly-allowed-ports', urlObj.port);
  }
  console.log(`ELECTRON_START_URL=${process.env.ELECTRON_START_URL}`);
  if (process.env.ELECTRON_START_URL)  {
    // comment this out or change it if you have it on a different location
    const reactPluginPath = 'chromeExtensions/react_4.0.4_0';
    if (fs.existsSync(reactPluginPath)) {
      console.log('adding React Developer Tools chrome extension');
      try {
        if (BrowserWindow.addDevToolsExtension) {
          BrowserWindow.addDevToolsExtension(reactPluginPath);
        } else if (electron.session && electron.session.defaultSession && electron.session.defaultSession.loadExtension) {
          electron.session.defaultSession.loadExtension(path.resolve(reactPluginPath))
            .catch((err) => console.log('failed to load devtools extension', err));
        }
      } catch (e) {
        console.log('error loading devtools extension', e);
      }
    } else {
      console.log(reactPluginPath + " does not exist. cannot load the plugin")
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({width: 1024, height: 768,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      nodeIntegrationInWorker: true,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js')
    }});


  // and load the index.html of the app.
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, '/build/index.html'),
    protocol: 'file:',
    slashes: true
  });
  mainWindow.loadURL(startUrl);

  try {
    // Initialize @electron/remote for renderer
    require('@electron/remote/main').initialize();
    require('@electron/remote/main').enable(mainWindow.webContents);
  } catch (e) {
    console.log('failed to initialize @electron/remote', e);
  }

  // Open the DevTools.
  if (process.env.ELECTRON_START_URL) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
});

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

