import mongoose from 'mongoose';

// Stores completed Stripe payments (one-time purchases and subscription renewals)
const payment_schema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    // Stripe Checkout Session ID — used as idempotency key
    stripe_session_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    stripe_payment_intent_id: {
      type: String,
      sparse: true,
    },
    payer_email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    payer_name: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'EUR',
    },
    // Human-readable fallback (kept for legacy records)
    description: {
      type: String,
    },

    // ── Structured fields (new) ──────────────────────────────────────────────
    // What kind of purchase this is
    type: {
      type: String,
      enum: ['course', 'bolsa', 'subscription', 'manual'],
    },
    // Slug of the related entity (course slug, 'bolsa', package slug, or custom label)
    reference_slug: {
      type: String,
      trim: true,
    },
    // Display name shown in the portal ("Máster en IA Clínica", "Sofía + Marcos", …)
    reference_label: {
      type: String,
      trim: true,
    },
    // Stripe hosted receipt URL — set when the PaymentIntent charge is available
    receipt_url: {
      type: String,
    },
    // For split payments: which installment this is and how many total (null = single payment)
    installment_number: {
      type: Number,
      default: null,
    },
    installment_total: {
      type: Number,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Payment = mongoose.model('Payment', payment_schema);

export default Payment;
