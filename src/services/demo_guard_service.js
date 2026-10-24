import { randomUUID } from 'node:crypto';
import Lead from '../models/lead_model.js';
import DemoQuota from '../models/demo_quota_model.js';
import { DEMO_MESSAGE_LIMIT } from './usage_service.js';

export const demo_error = (message, status_code = 429) =>
  Object.assign(new Error(message), { status_code });
export const daily_key = () => `demo:${new Date().toISOString().slice(0, 10)}`;

export async function reserve_quota(key, limit, expires_at) {
  try {
    await DemoQuota.updateOne(
      { _id: key },
      { $setOnInsert: { count: 0, expires_at } },
      { upsert: true }
    );
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  return DemoQuota.findOneAndUpdate(
    { _id: key, count: { $lt: limit } },
    { $inc: { count: 1 } },
    { new: true }
  );
}

export async function acquire_demo(lead) {
  // Count historical turns on first use, so existing visitors retain their limit.
  await Lead.updateOne(
    { _id: lead._id, demo_turns: { $exists: false } },
    { $set: { demo_turns: lead.chat_history.filter((m) => m.role === 'user').length } }
  );
  const token = randomUUID();
  const locked = await Lead.findOneAndUpdate(
    {
      _id: lead._id,
      demo_turns: { $lt: DEMO_MESSAGE_LIMIT },
      $or: [{ demo_lock_until: null }, { demo_lock_until: { $lte: new Date() } }],
    },
    {
      $set: { demo_lock_token: token, demo_lock_until: new Date(Date.now() + 120000) },
      $inc: { demo_turns: 1 },
    },
    { new: true }
  );
  if (!locked) {
    const current = await Lead.findById(lead._id);
    if ((current?.demo_turns ?? 0) >= DEMO_MESSAGE_LIMIT) return null;
    throw demo_error('Nora está respondiendo a tu mensaje anterior. Espera un momento.', 409);
  }
  const limit = Number(process.env.DEMO_DAILY_LIMIT || 300);
  const budget = await reserve_quota(daily_key(), limit, new Date(Date.now() + 8 * 86400000));
  if (!budget) {
    await release_demo(lead._id, token);
    throw demo_error(
      'La demo ha alcanzado su límite diario. Puedes enviarnos una solicitud desde el formulario.'
    );
  }
  return token;
}

export async function release_demo(id, token) {
  await Lead.updateOne(
    { _id: id, demo_lock_token: token },
    { $unset: { demo_lock_token: 1, demo_lock_until: 1 } }
  );
}

export async function record_demo_usage({ input_tokens, output_tokens }) {
  await DemoQuota.updateOne({ _id: daily_key() }, { $inc: { input_tokens, output_tokens } });
}
