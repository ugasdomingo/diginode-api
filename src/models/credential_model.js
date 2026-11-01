import mongoose from 'mongoose';
import { CREDENTIAL_PROVIDERS } from '../agency/constants.js';

const credential_schema = new mongoose.Schema(
  {
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    provider: { type: String, enum: CREDENTIAL_PROVIDERS, default: 'otro' },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    ciphertext: { type: String, required: true, select: false },
    iv: { type: String, required: true, select: false },
    auth_tag: { type: String, required: true, select: false },
    created_by: { type: String, maxlength: 160 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

credential_schema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.ciphertext;
    delete ret.iv;
    delete ret.auth_tag;
    return ret;
  },
});

const Credential = mongoose.model('Credential', credential_schema);

export default Credential;
