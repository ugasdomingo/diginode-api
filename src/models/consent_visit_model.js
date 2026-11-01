import mongoose from 'mongoose';

// Visita o hito asociado a la cookie propia dn_vid, sólo cuando la persona ha
// aceptado cookies. No guarda IP, user-agent, hash de visitante ni session_id.
//
// Las visitas aún no vinculadas a un lead llevan `expires_at` a 13 meses. El
// índice TTL las borra al llegar esa fecha. Al vincularlas se quita `expires_at`
// y pasan a conservarse con la ficha, hasta que un borrado RGPD las elimine.
const consent_visit_schema = new mongoose.Schema(
  {
    visitor_id: {
      type: String,
      required: true,
      match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      index: true,
    },
    // pageview, contact_click, o el nombre del hito (checkout_click, etc.).
    type: { type: String, required: true, maxlength: 40 },
    event: { type: String, maxlength: 40 },
    path: { type: String, required: true, maxlength: 200 },
    contact_type: { type: String, default: '', maxlength: 20 },
    location: { type: String, default: '', maxlength: 40 },
    lead_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', index: true },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', index: true },
    linked_at: { type: Date },
    expires_at: { type: Date },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// expireAfterSeconds: 0 borra el documento cuando expires_at queda en el pasado.
// Sin ese campo (visita ya vinculada) MongoDB no la toca.
consent_visit_schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
consent_visit_schema.index({ visitor_id: 1, created_at: -1 });

const ConsentVisit = mongoose.model('ConsentVisit', consent_visit_schema);

export default ConsentVisit;
