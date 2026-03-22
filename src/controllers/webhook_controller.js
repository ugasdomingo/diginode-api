import { process_message } from '../services/recepcionista_service.js';
import {
  handle_successful_payment,
  handle_subscription_deleted,
  handle_invoice_paid,
  handle_capture_completed,
  handle_meeting_booked,
} from '../services/crm_service.js';
import Campaign from '../models/campaign_model.js';
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

// POST /api/webhooks/paypal
// PayPal sends payment lifecycle events
const handle_paypal = async (req, res, next) => {
  try {
    const { event_type, resource } = req.body;

    switch (event_type) {
      // One-time payment captured (course purchase)
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handle_capture_completed(resource);
        break;

      // New subscription activated (AI agent client)
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        await handle_successful_payment(resource);
        break;

      // Subscription cancelled → suspend client
      case 'BILLING.SUBSCRIPTION.CANCELLED':
        await handle_subscription_deleted(resource);
        break;

      // Subscription renewal payment → store record + reactivate if suspended
      case 'PAYMENT.SALE.COMPLETED':
        await handle_invoice_paid(resource);
        break;

      default:
        // Acknowledge all other events without throwing
        break;
    }

    res.json({ received: true });
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

export { get_conversation, save_conversation_turn, handle_make_inbound, handle_content_ready, handle_paypal, handle_cal };
