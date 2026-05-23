import mongoose from 'mongoose';

// Employees available across all plans
const VALID_EMPLOYEES = ['recepcionista', 'asistente', 'gestor-relaciones', 'content-manager'];

// Which employees are included by default in each AI plan
const PLAN_EMPLOYEES = {
  individual:       [],   // populated at checkout based on client's choice
  estudio:          ['recepcionista', 'asistente'],
  clinica:          ['recepcionista', 'asistente', 'gestor-relaciones', 'content-manager'],
};

const client_schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    // Legacy plans kept for backwards compatibility; new AI plans below
    plan: {
      type: String,
      enum: ['latam', 'spain', 'despacho-digital', 'course', 'bolsa', 'individual', 'estudio', 'clinica'],
      required: true,
    },
    setup_fee_paid: {
      type: Boolean,
      default: false,
    },
    // Legacy service list (old model)
    services: {
      type: [String],
      default: [],
    },
    // AI employee plans — which employees are active for this client
    active_employees: {
      type: [{ type: String, enum: VALID_EMPLOYEES }],
      default: [],
    },
    // Tracks where the client is in the onboarding process
    onboarding_status: {
      type: String,
      enum: ['pending_form', 'configuring', 'testing', 'live'],
      default: 'pending_form',
    },
    office_url: {
      type: String,
      trim: true,
    },
    office_status: {
      type: String,
      enum: ['not_requested', 'requested', 'provisioning', 'training', 'review', 'live', 'paused', 'error'],
      default: 'not_requested',
    },
    office_plan: {
      type: String,
      enum: ['individual', 'operativo', 'full'],
    },
    office_instance_id: {
      type: String,
      trim: true,
      index: true,
    },
    office_deployed_at: {
      type: Date,
    },
    // Admin Bearer token of the deployed office instance — used by the
    // ops dashboard to pull health snapshots. Treat as secret.
    office_admin_token: {
      type: String,
      trim: true,
      select: false,
    },
    // Telegram chat IDs for direct client ↔ employee communication
    // Key: employee slug, Value: Telegram chat_id
    telegram_chat_ids: {
      type: Map,
      of: String,
      default: {},
    },
    // Captured from the client during /portal/onboarding. The owner uses this
    // to provision the diginode-office instance for the client.
    onboarding_form: {
      business_name:        { type: String, trim: true },
      sector:               { type: String, trim: true },
      timezone:             { type: String, trim: true, default: 'Europe/Madrid' },
      locale:               { type: String, trim: true, default: 'es-ES' },
      slack_workspace:      { type: String, trim: true },
      slack_bot_token:      { type: String, trim: true },
      slack_signing_secret: { type: String, trim: true },
      slack_default_channel:{ type: String, trim: true },
      materials_link:       { type: String, trim: true },
      additional_notes:     { type: String, trim: true },
      submitted_at:         { type: Date },
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended', 'cancelled'],
      default: 'pending',
    },
    // Reference to the original lead that converted to this client
    lead_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Client = mongoose.model('Client', client_schema);

export { VALID_EMPLOYEES, PLAN_EMPLOYEES };
export default Client;
