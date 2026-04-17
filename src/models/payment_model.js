import mongoose from 'mongoose';

// Stores completed Stripe payments (one-time courses and subscription renewals)
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
    description: {
      type: String,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Payment = mongoose.model('Payment', payment_schema);

export default Payment;
