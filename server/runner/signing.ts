import { createPrivateKey, generateKeyPairSync, sign } from 'crypto';
import { BlueprintEnvelope } from '../../shared/schema';
import { canonicalizeEnvelope } from './security';

export interface SignerKeyPair {
  publicKeyBase64: string;
  privateKeyBase64: string;
}

export function createSignerKeyPair(): SignerKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ format: 'der', type: 'spki' });
  const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' });
  return {
    publicKeyBase64: Buffer.from(publicDer).toString('base64'),
    privateKeyBase64: Buffer.from(privateDer).toString('base64'),
  };
}

export function signEnvelope(
  envelope: BlueprintEnvelope,
  options: {
    signerId: string;
    privateKeyBase64: string;
    nonce?: string;
    publicKeyBase64?: string;
  },
): BlueprintEnvelope {
  const nonce = options.nonce ?? `nonce-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const auth = {
    signer_id: options.signerId,
    nonce,
    algorithm: 'ED25519' as const,
    ...(options.publicKeyBase64 ? { public_key: options.publicKeyBase64 } : {}),
  };
  const unsigned = { ...envelope, auth };
  const payload = canonicalizeEnvelope(unsigned);
  const privateKey = createPrivateKey({
    key: Buffer.from(options.privateKeyBase64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(payload), privateKey).toString('base64');
  return {
    ...unsigned,
    auth: {
      ...auth,
      signature,
    },
  };
}
