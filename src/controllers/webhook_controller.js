import { handle_meeting_booked } from '../services/crm_service.js';
import { handle_stripe_event } from '../services/stripe_service.js';
import { add_to_buffer } from '../services/message_buffer_service.js';
import { handle_instagram_dm, handle_instagram_comment } from '../services/instagram_agent_service.js';
import { handle_whatsapp_inbound } from '../employees/recepcionista/channels/whatsapp_handler.js';
import Campaign from '../models/campaign_model.js';
import Knowledge from '../models/knowledge_model.js';
import Lead from '../models/lead_model.js';

// GET /api/webhooks/make/conversation?contact_id=X&platform=Y
const get_conversation = async (req, res, next) => {
  try {
    const { contact_id, platform } = req.query;

    if (!contact_id || !platform) {
      return res.status(400).json({ success: false, message: 'contact_id and platform are required' });
    }

    const lead = await Lead.findOneAndUpdate(
      { contact_id, platform },
      { $setOnInsert: { contact_id, platform, status: 'new' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const history = lead.chat_history.map((msg) => ({
      role:    msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts?.[0]?.text ?? '',
    }));

    res.json({
      success: true,
      data: {
        lead_id: lead._id,
        is_new:  lead.chat_history.length === 0,
        name:    lead.name ?? null,
        status:  lead.status,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/make/conversation
const save_conversation_turn = async (req, res, next) => {
  try {
    const { contact_id, platform, user_message, ai_response, sender_name } = req.body;

    if (!contact_id || !platform || !user_message || !ai_response) {
      return res.status(400).json({ success: false, message: 'contact_id, platform, user_message and ai_response are required' });
    }

    const newTurns = [
      { role: 'user',  parts: [{ text: user_message }] },
      { role: 'model', parts: [{ text: ai_response }] },
    ];

    const bookingLink    = process.env.CAL_BOOKING_LINK;
    const mentionsBooking = bookingLink && ai_response.includes(bookingLink);

    const update = { $push: { chat_history: { $each: newTurns } } };

    const lead = await Lead.findOne({ contact_id, platform });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (sender_name && !lead.name) {
      update.$set = { name: sender_name };
    }

    if (mentionsBooking) {
      update.$set = { ...update.$set, status: 'qualified' };
    } else if (lead.status === 'new') {
      update.$set = { ...update.$set, status: 'in_conversation' };
    }

    const updated = await Lead.findByIdAndUpdate(lead._id, update, { new: true });

    res.json({ success: true, data: { lead_id: updated._id, status: updated.status } });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/make/inbound
const handle_make_inbound = async (req, res, next) => {
  try {
    const { contact_id, platform, message, sender_name } = req.body;

    if (!contact_id || !platform || !message) {
      return res.status(400).json({ success: false, message: 'contact_id, platform and message are required' });
    }

    const result = await process_message({ contact_id, platform, message, sender_name });

    res.json({ success: true, reply: result.response });
  } catch (err) {
    next(err);
  }
};

// ── Meta direct webhooks ──────────────────────────────────────────────────────

// GET /api/webhooks/meta/whatsapp  — Meta verification challenge
const verify_whatsapp = (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST /api/webhooks/meta/whatsapp  — Incoming WhatsApp messages
const handle_whatsapp = (req, res) => {
  res.sendStatus(200);

  // New path: AI-plan clients routed to Recepcionista by phone_number_id.
  // Short-circuits internally if no ClientConfig found for this number.
  handle_whatsapp_inbound(req.body);

  // Legacy path: non-AI clients forwarded to Make.com via buffer.
  // Messages for AI clients land here too but Make.com has no record of their
  // phone_number_id, so no duplicate reply is sent.
  const entry  = req.body?.entry?.[0];
  const change = entry?.changes?.[0]?.value;
  const msg    = change?.messages?.[0];
  if (!msg || msg.type !== 'text') return;

  add_to_buffer({
    contact_id:  msg.from,
    platform:    'whatsapp',
    message:     msg.text.body,
    sender_name: change.contacts?.[0]?.profile?.name ?? null,
  });
};

// GET /api/webhooks/meta/instagram  — Meta verification challenge
const verify_instagram = (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
};

// POST /api/webhooks/meta/instagram  — Incoming Instagram DMs and comments
const handle_instagram = (req, res) => {
  // Acknowledge immediately — Meta requires < 200ms response
  res.sendStatus(200);

  const entry = req.body?.entry?.[0];
  if (!entry) return;

  // ── DM ──────────────────────────────────────────────────────────────────
  const messaging = entry.messaging?.[0];
  if (messaging?.message?.text && !messaging.message.is_echo) {
    handle_instagram_dm({
      sender_id:   messaging.sender.id,
      sender_name: null,
      text:        messaging.message.text,
    }).catch(err => console.error('[instagram_agent DM]', err.message));
    return;
  }

  // ── Comment ──────────────────────────────────────────────────────────────
  const change = entry.changes?.[0];
  if (change?.field === 'comments' && change.value?.text) {
    const v = change.value;
    handle_instagram_comment({
      commenter_id:   v.from?.id,
      commenter_name: v.from?.name ?? null,
      comment_id:     v.id,
      text:           v.text,
      post_id:        v.media?.id ?? null,
    }).catch(err => console.error('[instagram_agent comment]', err.message));
  }
};

// ── Make reply ────────────────────────────────────────────────────────────────

// POST /api/webhooks/make/reply
const handle_make_reply = async (req, res, next) => {
  try {
    const { contact_id, platform, combined_message, ai_response, sender_name } = req.body;

    if (!contact_id || !platform || !ai_response) {
      return res.status(400).json({ success: false, message: 'contact_id, platform and ai_response are required' });
    }

    const newTurns = [
      { role: 'user',  parts: [{ text: combined_message ?? '(buffered message)' }] },
      { role: 'model', parts: [{ text: ai_response }] },
    ];

    const bookingLink    = process.env.CAL_BOOKING_LINK;
    const mentionsBooking = bookingLink && ai_response.includes(bookingLink);

    const lead = await Lead.findOne({ contact_id, platform });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const update = { $push: { chat_history: { $each: newTurns } } };

    if (sender_name && !lead.name) {
      update.$set = { name: sender_name };
    }

    if (mentionsBooking) {
      update.$set = { ...update.$set, status: 'qualified' };
    } else if (lead.status === 'new') {
      update.$set = { ...update.$set, status: 'in_conversation' };
    }

    await Lead.findByIdAndUpdate(lead._id, update);

    res.json({ success: true, contact_id, platform, reply: ai_response });
  } catch (err) {
    next(err);
  }
};

// GET /api/webhooks/make/knowledge
const get_knowledge = async (req, res, next) => {
  try {
    const doc = await Knowledge.findOne({ key: 'recepcionista' });
    res.json({ success: true, content: doc?.content ?? '' });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/make/content-ready
const handle_content_ready = async (req, res, next) => {
  try {
    const { campaign_id, proposal_url } = req.body;

    if (!campaign_id || !proposal_url) {
      return res.status(400).json({ success: false, message: 'campaign_id and proposal_url are required' });
    }

    const campaign = await Campaign.findByIdAndUpdate(
      campaign_id,
      { status: 'proposal_ready', proposal_url },
      { new: true }
    );

    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    res.json({ success: true, data: campaign });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/cal
const handle_cal = async (req, res, next) => {
  try {
    const { triggerEvent, payload } = req.body;

    if (triggerEvent === 'BOOKING_CREATED') {
      const { uid, attendees } = payload;
      const attendee = attendees?.[0];

      await handle_meeting_booked({
        booking_id:     uid,
        attendee_email: attendee?.email,
        attendee_name:  attendee?.name,
      });
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/stripe
const handle_stripe = async (req, res, next) => {
  try {
    await handle_stripe_event(req.stripe_event);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

export {
  get_conversation, save_conversation_turn, handle_make_inbound,
  verify_whatsapp, handle_whatsapp,
  verify_instagram, handle_instagram,
  handle_make_reply, get_knowledge,
  handle_content_ready, handle_cal, handle_stripe,
};
