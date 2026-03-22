import mongoose from 'mongoose';

const client_schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    plan: {
      type: String,
      enum: ['latam', 'spain'],
      required: true,
    },
    paypal_subscription_id: {
      type: String,
      unique: true,
      sparse: true,
    },
    setup_fee_paid: {
      type: Boolean,
      default: false,
    },
    // List of contracted service names (e.g. 'recepcionista', 'content_manager')
    services: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'cancelled'],
      default: 'pending',
    },
    // Reference to the original lead that converted to this client
    lead_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Client = mongoose.model('Client', client_schema);

export default Client;
