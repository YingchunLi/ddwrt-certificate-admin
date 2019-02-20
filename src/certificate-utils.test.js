import {buildCA, buildClientCertificate, generateDHParams} from './certificate-utils';
import fs from 'fs';
// const forge = require('node-forge');
import forge from 'node-forge';
// import dhparam from 'dhparam';


const test = async () => {
  const options = {
    'commonName': 'example.org',
    'countryName': 'AU',
    'stateOrProvinceName': 'QLD',
    'localityName': 'Brisbane',
    'organizationName': 'DummySoft',
    'organizationalUnitName': 'Development'
  };
  const {cert, certPem, privateKeyPem, keys:caKeys} = await buildCA(options);
  console.log(certPem);
  console.log(privateKeyPem);

  fs.writeFileSync('ca.crt', certPem, (err) => {
    if (err) throw err;
    console.log('Error saving root ca certificate');
  });

  fs.writeFileSync('ca.key', privateKeyPem, (err) => {
    if (err) throw err;
    console.log('Error saving root ca private key');
  });

  const clientOptions = {
    'commonName': 'client1'
  };
  const {cert:clientCert, certPem:clientCertPem, privateKeyPem:ClientPrivateKeyPem} =
    buildClientCertificate(cert, caKeys.privateKey, clientOptions);
  console.log(clientCertPem);
  console.log(ClientPrivateKeyPem);

  fs.writeFileSync('client1.crt', clientCertPem, (err) => {
    if (err) throw err;
    console.log('Error saving root ca certificate');
  });

  fs.writeFileSync('client1.key', ClientPrivateKeyPem, (err) => {
    if (err) throw err;
    console.log('Error saving root ca private key');
  });


  // verify certificate
  var caStore = forge.pki.createCaStore();
  caStore.addCertificate(clientCert);
  try {
    forge.pki.verifyCertificateChain(caStore, [clientCert],
      function(vfd, depth, chain) {
        if(vfd === true) {
          console.log('SubjectKeyIdentifier verified: ' +
            clientCert.verifySubjectKeyIdentifier());
          console.log('Certificate verified.');
        }
        return true;
      });
  } catch(ex) {
    console.log('Certificate verification failure: ' +
      JSON.stringify(ex, null, 2));
  }console.log('All done');

};

it('Can generate root ca and client ca', async () => {
  test();
});

it('Can generate dh pem', () => {
  generateDHParams()
    .then(dhPem => console.log(dhPem));
});
