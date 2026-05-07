// Meta WhatsApp Business API — direct integration (no Twilio)
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/messages

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

/**
 * Sends a text message to a WhatsApp number.
 * @param {string} phone_number_id  - Client's WhatsApp Business phone number ID
 * @param {string} access_token     - Client's Meta system user access token
 * @param {string} to               - Recipient's phone number (international format, no +)
 * @param {string} text             - Message body
 */
const send_text = async (phone_number_id, access_token, to, text) => {
  const res = await fetch(`${GRAPH_BASE}/${phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text, preview_url: false },
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`WhatsApp send failed: ${err?.error?.message ?? res.status}`);
  }

  return res.json();
};

/**
 * Sends a "typing…" indicator (read receipt + typing status).
 * Call this before starting to process a message so the patient sees activity.
 */
const send_typing = async (phone_number_id, access_token, to, message_id) => {
  await fetch(`${GRAPH_BASE}/${phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status:            'read',
      message_id,
    }),
  }).catch(() => {}); // non-critical, don't throw
};

/**
 * Marks an incoming message as read.
 */
const mark_read = async (phone_number_id, access_token, message_id) => {
  await fetch(`${GRAPH_BASE}/${phone_number_id}/messages`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status:            'read',
      message_id,
    }),
  }).catch(() => {});
};

/**
 * Extracts the relevant fields from a raw Meta webhook payload.
 * Returns null if the payload doesn't contain a processable message.
 */
const parse_inbound = (body) => {
  const entry  = body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const msg    = change?.messages?.[0];

  if (!msg || msg.type !== 'text') return null;

  return {
    phone_number_id: change.metadata?.phone_number_id ?? null,
    from:            msg.from,
    message_id:      msg.id,
    text:            msg.text?.body ?? '',
    sender_name:     change.contacts?.[0]?.profile?.name ?? null,
    timestamp:       parseInt(msg.timestamp ?? '0', 10),
  };
};

export { send_text, send_typing, mark_read, parse_inbound };
