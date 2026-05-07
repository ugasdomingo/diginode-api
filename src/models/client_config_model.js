import mongoose from 'mongoose';

// Stores per-client credentials and configuration for their AI employees.
// All tokens/secrets should be encrypted at rest in production
// (add AES-256-GCM encryption layer before v1 launch).
const client_config_schema = new mongoose.Schema(
  {
    client_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Client',
      required: true,
      unique:   true,
    },

    // ── WhatsApp Business (Meta direct API) ──────────────────────────────────
    whatsapp_phone_number_id: { type: String, index: true },
    whatsapp_access_token:    { type: String },  // long-lived system user token
    whatsapp_verify_token:    { type: String },  // for webhook challenge

    // ── Telegram — Recepcionista bot (professional ↔ Recepcionista) ─────────────
    telegram_bot_token:    { type: String },
    telegram_bot_username: { type: String },
    telegram_secret:       { type: String },   // validates incoming Telegram webhooks

    // ── Telegram — Asistente bot (professional ↔ Asistente Ejecutivo) ────────
    asistente_telegram_bot_token:    { type: String },
    asistente_telegram_bot_username: { type: String },
    asistente_telegram_secret:       { type: String },

    // ── Google Calendar ───────────────────────────────────────────────────────
    google_oauth: {
      access_token:  { type: String },
      refresh_token: { type: String },
      expiry_date:   { type: Number },
    },
    google_calendar_id: { type: String, default: 'primary' },

    // ── Appointment defaults ─────────────────────────────────────────────────
    appointment_duration_min: { type: Number, default: 60 },
    // Working hours in 'HH:MM' format, used to compute availability
    working_hours_start: { type: String, default: '09:00' },
    working_hours_end:   { type: String, default: '19:00' },
    // Days off: 0 = Sunday, 6 = Saturday
    days_off: { type: [Number], default: [0, 6] },

    // ── Per-employee configuration ────────────────────────────────────────────
    // Each key maps to the employee's slug. Values are free-form objects
    // that each employee's build_system_prompt() uses.
    recepcionista: {
      employee_name: { type: String, default: 'Sofía' },
      tone:          { type: String, default: 'profesional y cercano' },
      services:      { type: String },  // free-text list of services + prices
      faqs:          { type: String },  // free-text FAQs
      schedule:      { type: String },  // human-readable schedule description
    },
    asistente: {
      employee_name:    { type: String, default: 'Alex' },
      writing_style:    { type: String, default: 'profesional y conciso' },
      methodology:      { type: String },
      // Persisted Telegram conversation history (professional ↔ Asistente)
      telegram_history: {
        type: [{
          role:      { type: String, enum: ['user', 'assistant'], required: true },
          content:   { type: String, required: true },
          timestamp: { type: Date,   default: Date.now },
        }],
        default: [],
      },
    },
    gestor_relaciones: {
      employee_name:        { type: String, default: 'Luna' },
      followup_tone:        { type: String, default: 'cálido y empático' },
      methodology:          { type: String },
      session_goals_template: { type: String },
    },
    content_manager: {
      employee_name:       { type: String, default: 'Marcos' },
      content_pillars:     { type: String },
      target_audience:     { type: String },
      brand_voice:         { type: String },
      heygen_avatar_id:    { type: String },
      elevenlabs_voice_id: { type: String },
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const ClientConfig = mongoose.model('ClientConfig', client_config_schema);

export default ClientConfig;
