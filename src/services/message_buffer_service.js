import Lead from '../models/lead_model.js';

// In-memory buffer: contact_id → { messages[], platform, sender_name, timer }
const buffers = new Map();

const BUFFER_DELAY_MS = 10_000;

export function add_to_buffer({ contact_id, platform, message, sender_name }) {
  const existing = buffers.get(contact_id);

  if (existing) {
    clearTimeout(existing.timer);
    existing.messages.push(message);
  } else {
    buffers.set(contact_id, { messages: [message], platform, sender_name });
  }

  const entry = buffers.get(contact_id);
  entry.timer = setTimeout(() => flush_buffer(contact_id), BUFFER_DELAY_MS);
}

async function flush_buffer(contact_id) {
  const entry = buffers.get(contact_id);
  if (!entry) return;
  buffers.delete(contact_id);

  const { messages, platform, sender_name } = entry;
  const combined_message = messages.join('\n');

  // Upsert lead and store name on first contact
  const lead = await Lead.findOneAndUpdate(
    { contact_id, platform },
    { $setOnInsert: { contact_id, platform, status: 'new' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (sender_name && !lead.name) {
    await Lead.findByIdAndUpdate(lead._id, { name: sender_name });
  }

  // Convert stored Gemini format → Make/Claude compatible { role, inputType, content }
  const history = lead.chat_history.map((msg) => ({
    role: msg.role === 'model' ? 'assistant' : 'user',
    inputType: 'single',
    content: msg.parts?.[0]?.text ?? '',
  }));

  // Append the new user message to form the complete messages array for Claude
  const full_messages = [
    ...history,
    { role: 'user', inputType: 'single', content: combined_message },
  ];

  // Fire Make scenario webhook (fire-and-forget)
  fetch(process.env.MAKE_RECEPCIONISTA_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contact_id,
      platform,
      sender_name: sender_name ?? '',
      combined_message,
      messages: full_messages,
    }),
  }).catch((err) => console.error('[Buffer flush error]', err.message));
}
