/**
 * Instagram Agent — orchestrates the full inbound message cycle:
 *
 * 1. Find or create the Airtable conversation record
 * 2. Find or create the MongoDB lead
 * 3. If Tomado_por_humano → save message only, no AI reply
 * 4. Call OpenAI with history + new message
 * 5. Reply via Instagram Graph API
 * 6. Persist both turns in Airtable
 */

import Lead from '../models/lead_model.js';
import {
  find_conversation,
  create_conversation,
  append_message,
} from './airtable_service.js';
import { get_agent_reply } from './openai_service.js';
import { send_dm, reply_to_comment, get_user_profile } from './instagram_service.js';

// ── DM handler ──────────────────────────────────────────────────────────────

/**
 * Called when an Instagram DM arrives.
 * payload = { sender_id, sender_name, text }
 */
const handle_instagram_dm = async ({ sender_id, sender_name, text }) => {
  // 1. Find or create conversation in Airtable
  let conv = await find_conversation(sender_id, 'instagram_dm');

  if (!conv) {
    // Enrich with Instagram profile if name is missing
    let nombre   = sender_name ?? null;
    let username = null;
    if (!nombre) {
      const profile = await get_user_profile(sender_id).catch(() => ({}));
      nombre   = profile.name ?? sender_id;
      username = profile.username ?? '';
    }

    // Create MongoDB lead
    const lead = await Lead.findOneAndUpdate(
      { contact_id: sender_id, platform: 'instagram' },
      {
        $setOnInsert: {
          contact_id: sender_id,
          platform:   'instagram',
          name:       nombre,
          status:     'new',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    conv = await create_conversation({
      contact_id: sender_id,
      nombre,
      username,
      plataforma: 'instagram_dm',
      lead_id:    lead._id.toString(),
    });
  }

  // 2. Save incoming user message
  await append_message(conv.id, { role: 'user', content: text }, { estado: 'activo' });

  // 3. If human has taken over — stop here
  if (conv.tomado_por_humano) {
    console.log(`[instagram_agent] DM from ${sender_id} — human mode, skipping AI reply`);
    return;
  }

  // 4. Generate AI reply
  const reply = await get_agent_reply(conv.mensajes, text);
  if (!reply) return;

  // 5. Send reply via Instagram
  await send_dm(sender_id, reply);

  // 6. Persist agent reply
  await append_message(conv.id, { role: 'agent', content: reply });
};

// ── Comment handler ─────────────────────────────────────────────────────────

/**
 * Called when a new Instagram comment arrives.
 * payload = { commenter_id, commenter_name, comment_id, text, post_id }
 */
const handle_instagram_comment = async ({ commenter_id, commenter_name, comment_id, text }) => {
  // Comments get their own conversation thread keyed by commenter_id + platform
  let conv = await find_conversation(commenter_id, 'instagram_comment');

  if (!conv) {
    let nombre   = commenter_name ?? commenter_id;
    let username = null;
    const profile = await get_user_profile(commenter_id).catch(() => ({}));
    if (profile.name)     nombre   = profile.name;
    if (profile.username) username = profile.username;

    const lead = await Lead.findOneAndUpdate(
      { contact_id: commenter_id, platform: 'instagram' },
      {
        $setOnInsert: {
          contact_id: commenter_id,
          platform:   'instagram',
          name:       nombre,
          status:     'new',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    conv = await create_conversation({
      contact_id: commenter_id,
      nombre,
      username,
      plataforma: 'instagram_comment',
      lead_id:    lead._id.toString(),
    });
  }

  // Save incoming comment as user message
  await append_message(conv.id, { role: 'user', content: text }, { estado: 'activo' });

  if (conv.tomado_por_humano) {
    console.log(`[instagram_agent] Comment from ${commenter_id} — human mode, skipping AI reply`);
    return;
  }

  // Generate a short public reply (comments should be concise)
  const reply = await get_agent_reply(conv.mensajes, text);
  if (!reply) return;

  // Reply publicly to the comment
  await reply_to_comment(comment_id, reply);

  // Persist agent reply
  await append_message(conv.id, { role: 'agent', content: reply });
};

export { handle_instagram_dm, handle_instagram_comment };
