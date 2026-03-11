import mongoose from 'mongoose';

const campaign_schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    context: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'proposal_ready', 'approved', 'in_production'],
      default: 'pending',
    },
    proposal_url: {
      type: String,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Campaign = mongoose.model('Campaign', campaign_schema);

export default Campaign;
