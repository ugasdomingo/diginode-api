import mongoose from 'mongoose';

// One paid seat in a live training (taller). Kept separate from Payment because
// this is what defines capacity: seats are counted from here, and the unique
// index on stripe_session_id is what makes fulfillment idempotent when the
// webhook and the success-page claim race each other.
const training_enrollment_schema = new mongoose.Schema(
  {
    training_slug: {
      type: String,
      required: true,
      trim: true,
    },
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
    },
    // Stripe Checkout Session ID — idempotency key shared with Payment.
    stripe_session_id: {
      type: String,
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'EUR',
    },
    status: {
      type: String,
      enum: ['paid', 'refunded', 'cancelled'],
      default: 'paid',
    },
    // Set the first time the success page exchanges the session for a JWT.
    // Non-null means the auto-login link has been spent (single use).
    claimed_at: {
      type: Date,
      default: null,
    },
    // True when the seat was granted past capacity (two buyers checking out at
    // the same time). Never reject a payment already taken — flag it for ops.
    overbooked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Seat counting per training, and "did this person already enrol?" lookups.
training_enrollment_schema.index({ training_slug: 1, status: 1 });
training_enrollment_schema.index({ training_slug: 1, email: 1 });

// Seats actually taken for a training. Lives on the model so both the checkout
// guard and the public landing count the same way without coupling services.
training_enrollment_schema.statics.count_seats = function (training_slug) {
  return this.countDocuments({ training_slug, status: 'paid' });
};

const TrainingEnrollment = mongoose.model('TrainingEnrollment', training_enrollment_schema);

export default TrainingEnrollment;
