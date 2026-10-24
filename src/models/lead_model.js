import mongoose from 'mongoose';

// Each message in the conversation history — matches Gemini's expected format
const chat_message_schema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'model'],
      required: true,
    },
    parts: [{ text: String }],
  },
  { _id: false }
);

const lead_schema = new mongoose.Schema(
  {
    booking_review_ids: { type: [String], default: undefined },
    company: String,
    website: String,
    service_interest: { type: String, enum: ['brand_management', 'web_project', 'digital_clinic', 'undecided'] },
    requested_scale: { type: String, enum: ['micro', 'sme', 'pending'] },
    goal: String,
    budget_range: String,
    landing_path: String,
    attribution: { channel: String, campaign: String },
    request_id: String,
    request_hash: String,
    request_received_at: Date,
    demo_started_at: Date,
    privacy_version: String,
    privacy_shown_at: Date,
    privacy_acknowledged: Boolean,
    notification_status: { type: String, enum: ['pending', 'sent'] },
    notification_attempts: { type: Number, default: 0 },
    notification_lock_until: Date,
    internal_notes: { type: String, maxlength: 4000 },
    marketing_authorized_at: Date,
    marketing_offer: String,
    demo_turns: Number,
    demo_lock_until: Date,
    demo_lock_token: String,
    // Unique identifier from the platform (e.g. WhatsApp phone number, IG user ID)
    contact_id: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      enum: ['whatsapp', 'instagram', 'linkedin', 'website'],
      required: true,
    },
    name: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    country: {
      type: String,
      trim: true,
    },
    business_type: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['new', 'in_conversation', 'qualified', 'meeting_booked', 'won', 'lost'],
      default: 'new',
    },
    // Where this lead originated — used by the funnel dashboard (F3-3).
    source: {
      type: String,
      enum: ['organic', 'ads', 'demo_whatsapp', 'web_form', 'other'],
      default: 'other',
    },
    // Funnel position, tracked independently from the sales `status` above.
    funnel_stage: {
      type: String,
      enum: ['request_received', 'demo_started', 'identified', 'followup', 'qualified', 'meeting_booked', 'proposal', 'won', 'lost'],
      default: 'demo_started',
    },
    // Follow-up sequence progress (F3-5): 0 = none sent, up to 4.
    followup_step: {
      type: Number,
      default: 0,
    },
    last_followup_at: {
      type: Date,
    },
    // How many emails Nora has sent this contact from the public demo (cap 2).
    demo_emails_sent: {
      type: Number,
      default: 0,
    },
    // Full conversation history sent to Gemini for context
    chat_history: [chat_message_schema],
    // Booking ID from Cal.com once a meeting is scheduled
    cal_booking_id: {
      type: String,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Ensure one lead per contact per platform
lead_schema.index({ contact_id: 1, platform: 1 }, { unique: true });

lead_schema.index({ request_id: 1 }, { unique: true, partialFilterExpression: { request_id: { $type: 'string' } } });
lead_schema.index({ service_interest: 1, source: 1, status: 1, created_at: -1 });
lead_schema.index({ notification_status: 1 });

const Lead = mongoose.model('Lead', lead_schema);

export default Lead;
