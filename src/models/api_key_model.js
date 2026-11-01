import mongoose from 'mongoose';
import { API_SCOPES } from '../agency/constants.js';

const api_key_schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    prefix: { type: String, required: true },
    key_hash: { type: String, required: true, unique: true, select: false },
    scopes: { type: [{ type: String, enum: API_SCOPES }], required: true },
    // Empty means the bot may work across clients. A non-empty list pins it.
    client_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Client' }], default: [] },
    revoked_at: { type: Date },
    last_used_at: { type: Date },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

api_key_schema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.key_hash;
    return ret;
  },
});

const ApiKey = mongoose.model('ApiKey', api_key_schema);

export default ApiKey;
