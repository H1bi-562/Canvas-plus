// utils/crypto.js
// AES-256-GCM encryption for secrets held at rest (Canvas OAuth tokens).
//
// GCM is authenticated encryption: tampering with stored ciphertext makes
// decrypt() throw rather than silently return wrong bytes. That matters here
// because the plaintext is a credential -- failing loudly is the safe outcome.
//
// Stored format: "<iv>:<authTag>:<ciphertext>", each part base64.
// The IV is random per call, so encrypting the same token twice yields
// different ciphertext and equal tokens are not detectable in the database.

const crypto = require('crypto');

const ALGORITHM  = 'aes-256-gcm';
const IV_LENGTH  = 12; // 96 bits, the size GCM is defined for
const KEY_LENGTH = 32; // 256 bits

/**
 * Read and validate ENCRYPTION_KEY. Resolved per call rather than at module
 * load so that requiring this file never throws at server boot -- the error
 * surfaces on the request that actually needs a token.
 */
function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  const key = Buffer.from(raw.trim(), 'hex');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_LENGTH} bytes as ${KEY_LENGTH * 2} hex characters ` +
      `(got ${key.length} bytes). Generate one with: ` +
      'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return key;
}

/** Encrypt a string. Passing null/undefined returns null so optional columns round-trip. */
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;

  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const data   = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

/** Reverse encrypt(). Throws if the payload was tampered with or the key changed. */
function decrypt(payload) {
  if (payload === null || payload === undefined) return null;

  const parts = String(payload).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload: expected "<iv>:<tag>:<ciphertext>"');
  }

  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** True when ENCRYPTION_KEY is present and the right length. Used by health checks. */
function isConfigured() {
  try { getKey(); return true; } catch { return false; }
}

module.exports = { encrypt, decrypt, isConfigured };
