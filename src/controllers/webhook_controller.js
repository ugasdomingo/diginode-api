import { process_message } from '../services/recepcionista_service.js';
import {
  handle_successful_payment,
  handle_subscription_deleted,
  handle_invoice_paid,
  handle_meeting_booked,
} from '../services/crm_service.js';

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

export { handle_make_inbound, handle_stripe, handle_cal };
