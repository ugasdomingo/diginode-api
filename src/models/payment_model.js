import mongoose from 'mongoose';

// Stores completed PayPal payments (one-time and subscription renewals)
const payment_schema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    paypal_order_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    paypal_capture_id: {
      type: String,
    },
    paypal_subscription_id: {
      type: String,
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
