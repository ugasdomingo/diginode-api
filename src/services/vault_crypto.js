import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import http_error from '../utils/http_error.js';

// 32-byte key from CREDENTIALS_VAULT_KEY (base64 or 64 hex chars). Never hardcoded.
export const vault_key = () => {
  const raw = process.env.CREDENTIALS_VAULT_KEY || '';
  if (!raw || raw.includes('change_this') || raw.includes('replace_me')) {
    throw http_error(503, 'La caja fuerte no está configurada');
  }
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw http_error(503, 'La caja fuerte no está configurada');
  return buf;
};

export const encrypt_secret = (plaintext) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', vault_key(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: cipher.getAuthTag().toString('base64'),
  };
};

export const decrypt_secret = ({ ciphertext, iv, auth_tag }) => {
  try {
    const decipher = createDecipheriv('aes-256-gcm', vault_key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(auth_tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw http_error(422, 'No se pudo descifrar');
  }
};
