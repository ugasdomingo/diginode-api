import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import OtpChallenge from '../models/otp_challenge_model.js';
import User from '../models/user_model.js';
import { send_otp_email } from './agency_mailer.js';

const pepper = () => process.env.OTP_PEPPER || process.env.JWT_SECRET || '';

export const hash_otp = (challenge_id, code) =>
  createHash('sha256').update(`${pepper()}:${challenge_id}:${code}`).digest('hex');

const hashes_equal = (stored, presented) => {
  const left = Buffer.from(String(stored || ''));
  const right = Buffer.from(String(presented || ''));
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

const new_code = () => randomInt(0, 1_000_000).toString().padStart(6, '0');

const MAX_ATTEMPTS = 5;
const TTL_MS = 10 * 60 * 1000;

export const issue_client_otp = async (user) => {
  await OtpChallenge.updateMany(
    { user_id: user._id, consumed_at: null },
    { $set: { consumed_at: new Date() } }
  );

  const challenge_id = randomBytes(32).toString('base64url');
  const code = new_code();
  await OtpChallenge.create({
    challenge_id,
    user_id: user._id,
    code_hash: hash_otp(challenge_id, code),
    expires_at: new Date(Date.now() + TTL_MS),
  });

  try {
    await send_otp_email(user.email, code);
  } catch (err) {
    await OtpChallenge.deleteOne({ challenge_id });
    throw err;
  }

  return { challenge_id };
};

export const verify_client_otp = async ({ challenge_id, code }) => {
  // Always hash, so a missing challenge does not return faster in an obvious way.
  const presented = hash_otp(challenge_id || '', code || '');

  const challenge = await OtpChallenge.findOneAndUpdate(
    {
      challenge_id,
      consumed_at: null,
      expires_at: { $gt: new Date() },
      attempts: { $lt: MAX_ATTEMPTS },
    },
    { $inc: { attempts: 1 } },
    { new: true }
  ).select('+code_hash');

  if (!challenge || !hashes_equal(challenge.code_hash, presented)) return null;

  const consumed = await OtpChallenge.findOneAndUpdate(
    { _id: challenge._id, consumed_at: null },
    { $set: { consumed_at: new Date() } },
    { new: true }
  );
  if (!consumed) return null;
  return challenge.user_id;
};

export const resend_client_otp = async (challenge_id) => {
  const existing = await OtpChallenge.findOne({ challenge_id });
  if (!existing || existing.consumed_at) return null;
  const user = await User.findById(existing.user_id);
  if (!user || !user.is_active || user.role !== 'client') return null;
  await OtpChallenge.updateOne({ _id: existing._id }, { $set: { consumed_at: new Date() } });
  return issue_client_otp(user);
};
