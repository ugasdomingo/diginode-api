import { process_message } from '../services/recepcionista_service.js';
import {
  handle_successful_payment,
  handle_subscription_deleted,
  handle_invoice_paid,
  handle_meeting_booked,
} from '../services/crm_service.js';
import Campaign from '../models/campaign_model.js';
import Lead from '../models/lead_model.js';

// GET /api/webhooks/make/conversation?contact_id=X&platform=Y
// Make.com fetches history for a contact before calling the AI
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

    // Convert Gemini format → simple {role, content} for Make
    const history = lead.chat_history.map(msg => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts?.[0]?.text ?? '',
    }));

    res.json({
      success: true,
      data: {
        lead_id: lead._id,
        is_new: lead.chat_history.length === 0,
        name: lead.name ?? null,
        status: lead.status,
        history,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/make/conversation
// Make.com saves a full conversation turn (user message + AI response) after calling the AI
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

    const bookingLink = process.env.CAL_BOOKING_LINK;
    const mentionsBooking = bookingLink && ai_response.includes(bookingLink);

    const update = {
      $push: { chat_history: { $each: newTurns } },
    };

    // Set name on first message if provided and not already stored
    const lead = await Lead.findOne({ contact_id, platform });
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    if (sender_name && !lead.name) {
      update.$set = { name: sender_name };
    }

    // Advance status
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
// Make.com forwards incoming DMs from WhatsApp, IG, LinkedIn
const handle_make_inbound = async (req, res, next) => {
  try {
    const { contact_id, platform, message, sender_name } = req.body;

    if (!contact_id || !platform || !message) {
      return res.status(400).json({ success: false, message: 'contact_id, platform and message are required' });
    }

    const result = await process_message({ contact_id, platform, message, sender_name });

    // Make.com reads the 'reply' field and sends it back to the user
    res.json({ success: true, reply: result.response });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/make/content-ready
// Make.com calls this when a content campaign proposal is ready
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

// POST /api/webhooks/stripe
// Stripe sends payment lifecycle events
const handle_stripe = async (req, res, next) => {
  try {
    const event = req.stripe_event; // set by verify_stripe_middleware

    switch (event.type) {
      case 'checkout.session.completed':
        await handle_successful_payment(event);
        break;
      case 'invoice.paid':
        await handle_invoice_paid(event);
        break;
      case 'customer.subscription.deleted':
        await handle_subscription_deleted(event);
        break;
      default:
        // Acknowledge unhandled events without throwing
        break;
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/webhooks/cal
// Cal.com notifies when a meeting is booked
const handle_cal = async (req, res, next) => {
  try {
    const { triggerEvent, payload } = req.body;

    if (triggerEvent === 'BOOKING_CREATED') {
      const { uid, attendees } = payload;
      const attendee = attendees?.[0];

      await handle_meeting_booked({
        booking_id: uid,
        attendee_email: attendee?.email,
        attendee_name: attendee?.name,
      });
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
};

export { get_conversation, save_conversation_turn, handle_make_inbound, handle_content_ready, handle_stripe, handle_cal };
