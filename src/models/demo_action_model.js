import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  contact_id: { type: String, required: true },
  recipient: { type: String, required: true },
  summary: { type: String, required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'failed'], default: 'pending' },
  expires_at: { type: Date, required: true },
  sent_at: Date,
});
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('DemoAction', schema);
