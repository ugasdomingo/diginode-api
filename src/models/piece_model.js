import mongoose from 'mongoose';
import { PIECE_STATUSES, PIECE_TYPES } from '../agency/constants.js';

const version_schema = new mongoose.Schema(
  {
    version: { type: Number, required: true },
    drive_url: { type: String, maxlength: 500 },
    note: { type: String, maxlength: 300 },
    created_by: { type: String, maxlength: 120 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

const piece_schema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
    type: { type: String, enum: PIECE_TYPES, default: 'otro' },
    title: { type: String, trim: true, maxlength: 160 },
    drive_url: { type: String, maxlength: 500 },
    status: { type: String, enum: PIECE_STATUSES, default: 'borrador' },
    author_bot: { type: String, maxlength: 80 },
    version: { type: Number, default: 1 },
    versions: { type: [version_schema], default: [] },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

piece_schema.index({ client_id: 1, status: 1, updated_at: -1 });

const Piece = mongoose.model('Piece', piece_schema);

export default Piece;
