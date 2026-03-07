import mongoose from 'mongoose';

const support_ticket_schema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'pending_review', 'resolved'],
      default: 'open',
    },
    // Auto-generated response from El Ingeniero
    ai_response: {
      type: String,
    },
    // Set to true when El Ingeniero cannot resolve it and escalates to CEO
    requires_ceo: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const SupportTicket = mongoose.model('SupportTicket', support_ticket_schema);

export default SupportTicket;
