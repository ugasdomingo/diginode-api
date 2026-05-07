import mongoose from 'mongoose';

// A patient belongs to one professional (client_id).
// Identified primarily by WhatsApp phone number; can also arrive via Instagram or Telegram.
const patient_schema = new mongoose.Schema(
  {
    client_id: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Client',
      required: true,
      index:    true,
    },
    name: { type: String, trim: true },
    phone: {
      type:  String,
      trim:  true,
      index: true,
    },
    instagram_id: { type: String, index: true },
    telegram_id:  { type: String, index: true },

    // Which channel the patient prefers for communication
    preferred_channel: {
      type:    String,
      enum:    ['whatsapp', 'instagram', 'telegram'],
      default: 'whatsapp',
    },

    // True if the patient is open to having their appointment moved earlier
    flexible_schedule: { type: Boolean, default: false },

    // Professional's private notes about this patient (not shared with patient)
    notes: { type: String },

    // Appointment counters (synced from calendar events)
    total_appointments: { type: Number, default: 0 },
    cancelled_count:    { type: Number, default: 0 },
    last_appointment:   { type: Date },
    next_appointment:   { type: Date },

    // Conversation history per channel — last 40 turns each to keep context manageable
    whatsapp_history: [
      {
        role:      { type: String, enum: ['user', 'assistant'] },
        content:   { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    instagram_history: [
      {
        role:      { type: String, enum: ['user', 'assistant'] },
        content:   { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    telegram_history: [
      {
        role:      { type: String, enum: ['user', 'assistant'] },
        content:   { type: String },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Google Calendar event IDs for upcoming appointments (for gap-fill tracking)
    upcoming_event_ids: [{ type: String }],
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Compound index: one patient per phone per client
patient_schema.index({ client_id: 1, phone: 1 }, { unique: true, sparse: true });
patient_schema.index({ client_id: 1, instagram_id: 1 }, { sparse: true });

// Trim history to last 40 turns before saving to prevent unbounded growth
patient_schema.pre('save', function () {
  const MAX = 40;
  if (this.whatsapp_history.length  > MAX) this.whatsapp_history  = this.whatsapp_history.slice(-MAX);
  if (this.instagram_history.length > MAX) this.instagram_history = this.instagram_history.slice(-MAX);
  if (this.telegram_history.length  > MAX) this.telegram_history  = this.telegram_history.slice(-MAX);
});

const Patient = mongoose.model('Patient', patient_schema);

export default Patient;
