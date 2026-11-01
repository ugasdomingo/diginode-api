import mongoose from 'mongoose';
import { MEETING_STATUSES } from '../agency/constants.js';

const meeting_schema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
    title: { type: String, trim: true, maxlength: 160 },
    starts_at: { type: Date },
    ends_at: { type: Date },
    location: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, maxlength: 2000 },
    status: { type: String, enum: MEETING_STATUSES, default: 'programada' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Meeting = mongoose.model('Meeting', meeting_schema);

export default Meeting;
