import mongoose from 'mongoose';
import { APPROVAL_STATUSES } from '../agency/constants.js';

const audit_schema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actor_type: { type: String, enum: ['admin', 'client', 'bot'], required: true },
    actor_id: { type: String, maxlength: 80 },
    actor_label: { type: String, maxlength: 160 },
    action: { type: String, required: true, maxlength: 40 },
    comment: { type: String, maxlength: 1000 },
  },
  { _id: false }
);

const approval_schema = new mongoose.Schema(
  {
    piece_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Piece',
      required: true,
      unique: true,
    },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    // dos_fases: Domingo y después el cliente. solo_domingo: pieza de prospección.
    mode: { type: String, enum: ['dos_fases', 'solo_domingo'], required: true },
    status: { type: String, enum: APPROVAL_STATUSES, required: true },
    round: { type: Number, default: 1 },
    author_bot: { type: String, maxlength: 80 },
    audit: { type: [audit_schema], default: [] },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Approval = mongoose.model('Approval', approval_schema);

export default Approval;
