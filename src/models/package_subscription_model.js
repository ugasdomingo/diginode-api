import mongoose from 'mongoose';

// Tracks an active Stripe subscription for a package purchase.
// One client can only have one active subscription per package slug.
const package_subscription_schema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    package_slug: {
      type: String,
      required: true,
    },
    stripe_subscription_id: {
      type: String,
      required: true,
      unique: true,
    },
    stripe_customer_id: {
      type: String,
      required: true,
    },
    stripe_checkout_session_id: {
      type: String,
      sparse: true,
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'canceled'],
      default: 'active',
    },
    // When the subscription billing started
    started_at: {
      type: Date,
    },
    // Earliest date the client may cancel without breach
    minimum_end_date: {
      type: Date,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const PackageSubscription = mongoose.model('PackageSubscription', package_subscription_schema);

export default PackageSubscription;
