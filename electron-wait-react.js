const net = require('net');
const port = process.env.PORT ? (process.env.PORT - 100) : 5001;

process.env.ELECTRON_START_URL = `http://127.0.0.1:${port}`;
console.log('ELECTRON_START_URL', process.env.ELECTRON_START_URL);

const client = new net.Socket();

let startedElectron = false;
const tryConnection = () => client.connect({ host: '127.0.0.1', port }, () => {
    client.end();
    if(!startedElectron) {
      console.log('starting electron');
      startedElectron = true;
      const exec = require('child_process').exec;
      exec('npm run electron');
    }
  }
);

tryConnection();

client.on('error', (error) => {
  console.log('error', error);
  setTimeout(tryConnection, 1000);
});