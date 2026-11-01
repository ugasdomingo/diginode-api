import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const hash_api_key = (token) => createHash('sha256').update(token).digest('hex');

export const hashes_equal = (stored, presented) => {
  const left = Buffer.from(String(stored || ''));
  const right = Buffer.from(String(presented || ''));
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export const generate_api_key = () => {
  const key = `dnk_${randomBytes(32).toString('base64url')}`;
  return { key, key_hash: hash_api_key(key), prefix: key.slice(0, 12) };
};
