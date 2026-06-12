import FailedWebhook from '../models/failed_webhook_model.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// POSTs JSON to an outgoing webhook with retries + exponential backoff. On final
// failure, persists to the failed_webhooks dead-letter (F6-5). Fire-and-forget
// safe: never throws. Backoff: 1s, 5s, 25s (3 attempts by default).
export const post_webhook = async (url, payload, { label = 'webhook', retries = 3 } = {}) => {
  if (!url) return;

  let last_error = 'unknown';
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return;
      last_error = `HTTP ${res.status}`;
    } catch (err) {
      last_error = err.message ?? 'fetch failed';
    }
    if (attempt < retries) await sleep(1000 * 5 ** (attempt - 1)); // 1s, 5s, 25s
  }

  console.error(`[webhook:${label}] gave up after ${retries} attempts: ${last_error}`);
  try {
    await FailedWebhook.create({ url, payload, label, error: last_error, attempts: retries });
  } catch (err) {
    console.error(`[webhook:${label}] could not persist dead-letter: ${err.message}`);
  }
};
