import mongoose from 'mongoose';

// Fragmento compartido por el lead y el cliente. El recorrido sólo se rellena
// cuando la persona ha aceptado el consentimiento del viaje.

const timeline_event_schema = () =>
  new mongoose.Schema(
    {
      type: { type: String, required: true, maxlength: 40 },
      path: { type: String, required: true, maxlength: 200 },
      at: { type: Date, required: true },
      contact_type: { type: String, maxlength: 20 },
      location: { type: String, maxlength: 40 },
      origin: { type: String, enum: ['journey', 'visit'] },
    },
    { _id: false }
  );

const journey_consent_schema = () =>
  new mongoose.Schema(
    {
      accepted: { type: Boolean },
      text_version: { type: String, maxlength: 40 },
      // Texto mostrado, si el formulario lo envía. Recortado a 500 caracteres.
      text: { type: String, maxlength: 500 },
      at: { type: Date },
    },
    { _id: false }
  );

const journey_entry_schema = () =>
  new mongoose.Schema(
    {
      referrer_domain: { type: String, maxlength: 253 },
      utm_source: { type: String, maxlength: 80 },
      utm_medium: { type: String, maxlength: 80 },
      utm_campaign: { type: String, maxlength: 80 },
    },
    { _id: false }
  );

// Una instancia nueva por modelo: Mongoose no permite reutilizar el mismo
// subesquema en el lead y en el cliente.
const journey_paths = () => ({
  // Cookie propia dn_vid. Sólo se guarda con consentimiento del recorrido.
  visitor_id: {
    type: String,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  },
  journey_consent: { type: journey_consent_schema() },
  journey_entry: { type: journey_entry_schema() },
  timeline: { type: [timeline_event_schema()], default: undefined },
});

export { journey_paths };
