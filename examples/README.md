# Signed Blueprint Examples

These examples demonstrate how to generate keys, sign a blueprint, and apply it with the runner CLI.

## 1) Generate a signer key pair

```bash
node scripts/generate-keys.js
```

This writes `keys/<signer>.public.json` and `keys/<signer>.private.json`.

## 2) Register the signer (optional)

Update `config/security.json`:

```json
{
  "signers": [
    { "signer_id": "signer-...", "public_key": "..." }
  ]
}
```

## 3) Sign a blueprint

```bash
node scripts/sign-blueprint.js examples/blueprints/quest-contract.json keys/<signer>.private.json
```

Or:

```bash
npm run runner:sign -- examples/blueprints/quest-contract.json keys/<signer>.private.json
```

The script injects `auth` with a nonce and signature.

## 4) Apply via runner CLI

```bash
npm run runner:apply -- examples/blueprints/quest-contract.json
```

## Notes

- Do not commit private keys.
- Set `require_signature` or `require_license` in `config/security.json` to enforce production rules.
