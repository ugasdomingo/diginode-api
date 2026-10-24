import mongoose from 'mongoose';
const schema = new mongoose.Schema({
  _id: String,
  count: { type: Number, default: 0 },
  input_tokens: { type: Number, default: 0 },
  output_tokens: { type: Number, default: 0 },
  expires_at: Date,
});
schema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('DemoQuota', schema);
