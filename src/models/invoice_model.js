import mongoose from 'mongoose';
import { INVOICE_STATUSES } from '../agency/constants.js';

const invoice_schema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    concept: { type: String, required: true, trim: true, maxlength: 200 },
    amount_eur: { type: Number, required: true, min: 0.5, max: 1_000_000 },
    currency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },
    status: { type: String, enum: INVOICE_STATUSES, default: 'pendiente' },
    stripe_session_id: { type: String, unique: true, sparse: true },
    stripe_payment_intent_id: { type: String },
    payment_url: { type: String },
    paid_at: { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

invoice_schema.index({ client_id: 1, status: 1, created_at: -1 });

const Invoice = mongoose.model('Invoice', invoice_schema);

export default Invoice;
