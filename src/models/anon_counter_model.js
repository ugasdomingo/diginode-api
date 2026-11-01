import mongoose from 'mongoose';

// Contador diario agregado. No es un evento de una persona: no hay IP, cookie,
// user-agent, sesión ni marca de tiempo exacta. La dimensión temporal es el día
// civil en España (Europe/Madrid), guardado como YYYY-MM-DD.
const anon_counter_schema = new mongoose.Schema(
  {
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    path: { type: String, required: true, maxlength: 200 },
    referrer_domain: { type: String, default: '', maxlength: 253 },
    utm_source: { type: String, default: '', maxlength: 80 },
    utm_medium: { type: String, default: '', maxlength: 80 },
    utm_campaign: { type: String, default: '', maxlength: 80 },
    device: { type: String, required: true, enum: ['mobile', 'tablet', 'desktop'] },
    lang: { type: String, required: true, maxlength: 16 },
    // ISO-3166-1 alfa-2, o vacío si el proxy no envió país. Nunca una IP.
    country: { type: String, default: '', maxlength: 2 },
    city: { type: String, default: '', maxlength: 60 },
    type: { type: String, required: true, enum: ['pageview', 'contact_click'] },
    contact_type: { type: String, default: '', enum: ['', 'call', 'whatsapp', 'form'] },
    location: {
      type: String,
      default: '',
      enum: ['', 'header', 'fab', 'contact_section', 'footer', 'nora'],
    },
    count: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false }
);

anon_counter_schema.index(
  {
    day: 1,
    type: 1,
    path: 1,
    referrer_domain: 1,
    utm_source: 1,
    utm_medium: 1,
    utm_campaign: 1,
    device: 1,
    lang: 1,
    country: 1,
    city: 1,
    contact_type: 1,
    location: 1,
  },
  { unique: true, name: 'anon_counter_bucket' }
);

const AnonCounter = mongoose.model('AnonCounter', anon_counter_schema);

export default AnonCounter;
