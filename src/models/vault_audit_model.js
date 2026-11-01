import mongoose from 'mongoose';

const vault_audit_schema = new mongoose.Schema(
  {
    credential_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Credential' },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    actor_type: { type: String, enum: ['admin', 'client', 'bot'], required: true },
    actor_id: { type: String, maxlength: 80 },
    actor_label: { type: String, maxlength: 160 },
    action: {
      type: String,
      enum: ['create', 'read', 'read_failed', 'delete'],
      required: true,
    },
    at: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

vault_audit_schema.index({ credential_id: 1, at: -1 });

const VaultAudit = mongoose.model('VaultAudit', vault_audit_schema);

export default VaultAudit;
