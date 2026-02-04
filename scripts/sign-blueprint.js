const fs = require('fs');
const path = require('path');
const { createPrivateKey, sign } = require('crypto');

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalizeEnvelope(envelope) {
  const { auth, ...rest } = envelope;
  if (!auth) {
    return stableStringify(rest);
  }
  const { signature, ...authWithoutSig } = auth;
  return stableStringify({ ...rest, auth: authWithoutSig });
}

const [,, blueprintPath, privateKeyPath, outputPath] = process.argv;

if (!blueprintPath || !privateKeyPath) {
  console.error('Usage: node scripts/sign-blueprint.js <blueprint.json> <private-key.json> [output.json]');
  process.exit(1);
}

const blueprint = JSON.parse(fs.readFileSync(path.resolve(blueprintPath), 'utf8'));
const privateKeyData = JSON.parse(fs.readFileSync(path.resolve(privateKeyPath), 'utf8'));

if (!privateKeyData.private_key || !privateKeyData.signer_id) {
  console.error('Invalid private key file');
  process.exit(1);
}

const nonce = `nonce-${Date.now()}`;
blueprint.auth = {
  signer_id: privateKeyData.signer_id,
  nonce,
  algorithm: 'ED25519',
};

const payload = canonicalizeEnvelope(blueprint);
const privateKey = createPrivateKey({
  key: Buffer.from(privateKeyData.private_key, 'base64'),
  format: 'der',
  type: 'pkcs8',
});

const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');
blueprint.auth.signature = signature;

const target = outputPath || blueprintPath;
fs.writeFileSync(path.resolve(target), JSON.stringify(blueprint, null, 2));

console.log(`Signed blueprint written to ${target}`);
