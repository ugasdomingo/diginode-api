import mongoose from 'mongoose';

// Defines a purchasable package (e.g. "Despacho Digital").
// stripe_price_id must be set (via admin or directly in DB) before checkout works.
const package_schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    // Monthly price during the minimum commitment period (e.g. 300)
    price_monthly: {
      type: Number,
      required: true,
    },
    // Monthly price after the minimum period ends (e.g. 200)
    price_monthly_renewal: {
      type: Number,
    },
    // Minimum commitment in months before cancellation is allowed
    minimum_months: {
      type: Number,
      default: 6,
    },
    currency: {
      type: String,
      default: 'eur',
      lowercase: true,
    },
    // Stripe Price ID for the initial recurring charge (set after creating in Stripe dashboard)
    stripe_price_id: {
      type: String,
      sparse: true,
    },
    // Stripe Price ID for the renewal rate after minimum_months (optional)
    stripe_price_id_renewal: {
      type: String,
      sparse: true,
    },
    features: {
      type: [String],
      default: [],
    },
    active: {
      type: Boolean,
      default: false, // Stays false until stripe_price_id is configured
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Package = mongoose.model('Package', package_schema);

export default Package;
