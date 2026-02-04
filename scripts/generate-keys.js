const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const outDir = path.resolve(__dirname, '..', 'keys');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const signerArg = process.argv[2];
const keyId = signerArg && signerArg.trim().length > 0 ? signerArg.trim() : `signer-${Date.now()}`;
const publicPath = path.join(outDir, `${keyId}.public.json`);
const privatePath = path.join(outDir, `${keyId}.private.json`);

if (fs.existsSync(publicPath) || fs.existsSync(privatePath)) {
  console.error(`Key files already exist for ${keyId}`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const publicDer = publicKey.export({ format: 'der', type: 'spki' });
const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
const publicKeyBase64 = Buffer.from(publicDer).toString('base64');
const privateKeyBase64 = Buffer.from(privateDer).toString('base64');

const publicPayload = {
  signer_id: keyId,
  public_key: publicKeyBase64,
};

const privatePayload = {
  signer_id: keyId,
  private_key: privateKeyBase64,
};

fs.writeFileSync(publicPath, JSON.stringify(publicPayload, null, 2));
fs.writeFileSync(privatePath, JSON.stringify(privatePayload, null, 2));

console.log(`Generated key pair: ${keyId}`);
console.log(`Public: keys/${keyId}.public.json`);
console.log(`Private: keys/${keyId}.private.json`);
