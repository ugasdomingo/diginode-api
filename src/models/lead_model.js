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

const Lead = mongoose.model('Lead', lead_schema);

export default Lead;
