import mongoose from 'mongoose';

// A priced proposal sent to a lead. Paying it is how the client accepts it.
// Each new version supersedes the previous one, whose link stops accepting payment.
const proposal_schema = new mongoose.Schema(
  {
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
    token: { type: String, required: true, unique: true },
    version: { type: Number, required: true },
    status: { type: String, enum: ['sent', 'superseded', 'paid'], default: 'sent' },
    service: { type: String, enum: ['brand_management', 'web_project'], required: true },
    billing: { type: String, enum: ['subscription', 'one_time'], required: true },
    currency: { type: String, enum: ['EUR', 'USD'], required: true },
    vat_rate: { type: Number, min: 0, max: 30, required: true },
    items: [{ _id: false, label: String, detail: String }],
    // Net amounts. Subscription: monthly + setup in the first payment.
    // One-time: due_now is what this link charges (full price or first instalment).
    monthly: Number,
    setup: Number,
    total: Number,
    due_now: Number,
    message: { type: String, maxlength: 2000 },
    valid_until: Date,
    company: String,
    contact_name: String,
    email: String,
    stripe_session_id: String,
    paid_at: Date,
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

proposal_schema.index({ lead_id: 1, version: -1 });

export default mongoose.model('Proposal', proposal_schema);
