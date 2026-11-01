import mongoose from 'mongoose';

// Auditoría mínima de exportaciones y borrados RGPD. Quién y cuándo, y sobre
// qué ficha o cookie. No se copia el recorrido, el correo ni el cuerpo exportado.
const privacy_audit_schema = new mongoose.Schema(
  {
    action: { type: String, required: true, enum: ['export', 'erase'] },
    subject_type: { type: String, required: true, enum: ['lead', 'client', 'visitor'] },
    subject_id: { type: String, required: true, maxlength: 64 },
    actor_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    at: { type: Date, required: true },
  },
  { versionKey: false }
);

privacy_audit_schema.index({ at: -1 });

const PrivacyAudit = mongoose.model('PrivacyAudit', privacy_audit_schema);

export default PrivacyAudit;
