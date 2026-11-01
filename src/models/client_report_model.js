import mongoose from 'mongoose';
import { REPORT_STATUSES } from '../agency/constants.js';

const client_report_schema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    title: { type: String, trim: true, maxlength: 160 },
    drive_url: { type: String, maxlength: 500 },
    status: { type: String, enum: REPORT_STATUSES, default: 'borrador' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

client_report_schema.index({ client_id: 1, period: 1 }, { unique: true });

const ClientReport = mongoose.model('ClientReport', client_report_schema);

export default ClientReport;
