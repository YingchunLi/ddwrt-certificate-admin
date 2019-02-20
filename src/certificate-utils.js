const forge = require('node-forge');

const pki = forge.pki;

// dos2unix
String.prototype.removeCarriageReturns = function (){
  return this.replace(/\r\n/g, "\n");
};

// generate a keypair
export const generateKeyPair = (keysize=2048, encryptWithPassword) => {
  return new Promise((resolve, reject) => {
    pki.rsa.generateKeyPair(
      { bits: keysize, workers: -1},
      (err, keys) => {
        if (err) {
          reject(err);
        }

        // convert private key to PEM
        const privateKey = keys.privateKey;
        let privateKeyPem = encryptWithPassword
          ? pki.encryptRsaPrivateKey(privateKey, encryptWithPassword)
          : pki.privateKeyToPem(privateKey);
        privateKeyPem = privateKeyPem.removeCarriageReturns();
        resolve({keys, privateKeyPem});
      }
    );
  });
};

export const readExistingCA = (caPrivateKeyPem, caCertPem) => {
  return new Promise((resolve, reject) => {
       const caPrivateKey = pki.privateKeyFromPem(caPrivateKeyPem);
       const caCert = pki.certificateFromPem(caCertPem);
       resolve({caCert, caPrivateKey});

  });
};

// create a root CA X.509v3 certificate
export const buildCA = async (options = {}) => {
  const {
    validityStart = new Date(),
    validityEnd,
    keySize,
  } = options;

  // key pair
  const {keys:caKeys, privateKeyPem:caPrivateKeyPem} = await generateKeyPair(keySize);

  const caCert = pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;

  // root CA starts with '01'
  caCert.serialNumber = '01';

  // validity
  caCert.validity.notBefore = validityStart;
  if (validityEnd) {
    caCert.validity.notAfter = validityEnd;
  } else {
    caCert.validity.notAfter = new Date();
    caCert.validity.notAfter.setFullYear(caCert.validity.notBefore.getFullYear() + 1);
  }

  // subject and issuers should be the same
  const subjectAttributes =
    [
      'commonName', 'countryName', 'stateOrProvinceName',
      'localityName', 'organizationName', 'organizationalUnitName'
    ].filter(a => options[a])
      .map(attr => ({name: attr, value: options[attr]}));

  caCert.setSubject(subjectAttributes);
  caCert.setIssuer(subjectAttributes);

  // extensions
  const extensions =
    [
      {
        name: 'basicConstraints',
        cA: true
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        codeSigning: true,
        emailProtection: true,
        timeStamping: true
      },
      {
        name: 'nsCertType',
        client: true,
        server: true,
        email: true,
        objsign: true,
        sslCA: true,
        emailCA: true,
        objCA: true
      },
      {
        name: 'subjectAltName',
        altNames: [{
          type: 6, // URI
          value: 'http://example.org/webid#me'
        }, {
          type: 7, // IP
          ip: '127.0.0.1'
        }]
      },
      {
        name: 'subjectKeyIdentifier'
      }
    ];
  caCert.setExtensions(extensions);

  const caPrivateKey = caKeys.privateKey;
  // self sign
  caCert.sign(caPrivateKey);

  // convert a Forge certificate to PEM
  const caCertPem = pki.certificateToPem(caCert).removeCarriageReturns();

  return {caCert, caPrivateKey, caCertPem, caPrivateKeyPem};
};

// create a client X.509v3 certificate
export const buildClientCertificate = async (caCert, caPrivateKey, options = {}) => {
  const {
    validityStart = new Date(),
    validityEnd,
    keySize,
    password,
  } = options;

  // key pair
  const {keys, privateKeyPem} = await generateKeyPair(keySize, password);

  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;

  // root CA starts with '01'
  // cert.serialNumber = '01';

  // validity
  cert.validity.notBefore = validityStart;
  if (validityEnd) {
    cert.validity.notAfter = validityEnd;
  } else {
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  }

  // subject and issuers should be the same
  const subjectAttributes =
    [
      'commonName', 'countryName', 'stateOrProvinceName',
      'localityName', 'organizationName', 'organizationalUnitName'
    ].filter(a => options[a])
      .map(attr => ({name: attr, value: options[attr]}));

  cert.setSubject(subjectAttributes);
  cert.setIssuer(caCert.subject.attributes);

  // extensions
  // const extensions =
  //   [
  //     // {
  //     //   name: 'basicConstraints',
  //     //   cA: true
  //     // },
  //     {
  //       name: 'keyUsage',
  //       keyCertSign: true,
  //       digitalSignature: true,
  //       nonRepudiation: true,
  //       keyEncipherment: true,
  //       dataEncipherment: true
  //     },
  //     {
  //       name: 'extKeyUsage',
  //       serverAuth: true,
  //       clientAuth: true,
  //       codeSigning: true,
  //       emailProtection: true,
  //       timeStamping: true
  //     },
  //     {
  //       name: 'nsCertType',
  //       client: true,
  //       server: true,
  //       email: true,
  //       objsign: true,
  //       sslCA: true,
  //       emailCA: true,
  //       objCA: true
  //     },
  //     {
  //       name: 'subjectAltName',
  //       altNames: [{
  //         type: 6, // URI
  //         value: 'http://example.org/webid#me'
  //       }, {
  //         type: 7, // IP
  //         ip: '127.0.0.1'
  //       }]
  //     },
  //     {
  //       name: 'subjectKeyIdentifier'
  //     }
  //   ];
  // cert.setExtensions(extensions);

  // sign using root ca's private key
  cert.sign(caPrivateKey);

  // convert a Forge certificate to PEM
  const certPem = pki.certificateToPem(cert);

  return {cert, certPem, privateKeyPem};
};

export const generateDHParams = () => {
  // generate a random prime using Web Workers (if available, otherwise
// falls back to the main thread)
  var bits = 2048;
  var options = {
    algorithm: {
      name: 'PRIMEINC',
      workers: -1 // auto-optimize # of workers
    }
  };

  return new Promise((resolve) => {
    forge.prime.generateProbablePrime(bits, options, function (err, prime) {
      // hard-coded generator to be 2
      const generator = 2;

      // shortcut for asn.1 API
      const asn1 = forge.asn1;

      const dhParamsToAsn1 = (prime, generator) => {
        return asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.hexToBytes(prime.toString(16))),//prime
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.int32ToBytes(generator)), // generator
        ]);
      };

      // convert to ASN.1, then DER, then PEM-encode
      const dhParamsAsn = asn1.toDer(dhParamsToAsn1(prime, generator));
      const dhPem = forge.pem.encode({type: 'DH PARAMETERS', body: dhParamsAsn.getBytes()}, {maxline: 64});

      resolve(dhPem);
    });
  });
};


export const staticDhPem = `-----BEGIN DH PARAMETERS-----
MIIBCQKCAQCKgoa/NBgUDSFrEE/6twb/EDLAfMllfdU/w8/Gy/lEXxEiAApWgjuF
RuHHQ2PaharGPODFyAxxUMfGcMdCuwzAUZYEYtSRfnQsvA4v7m+/2LEz9Yhx5eLo
997a+hvGbLBBpf8VZjUTNSjnQvpYzZrO94ACUmCk+DQv7tvh/qe4GRJPp8MwK4DQ
nJLGAQeXa1WgaRtGIU3x1SRp2B4zZsj2BrGUUHaz7j4Pi+dTMcwABfHLlbnYR1QE
DkzXrybrGDSv1E48RiBuNOON02RoUrz1ERNcoF2C+MWjzbJ9e5iryrIB4l5ev4Wr
e7zH50OiQfDtv4ofD/KUPQdx38F+jz51AgMAAAI=
-----END DH PARAMETERS-----`;