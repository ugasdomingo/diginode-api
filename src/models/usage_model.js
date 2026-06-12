import mongoose from 'mongoose';

// AI consumption per client per calendar month. One document per (client, month),
// incremented atomically as employees respond. Drives per-plan limits (F1-3).
const usage_schema = new mongoose.Schema(
  {
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
      required: true,
    },
    month: {
      type: String, // 'YYYY-MM'
      required: true,
    },
    input_tokens:  { type: Number, default: 0 },
    output_tokens: { type: Number, default: 0 },
    message_count: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

usage_schema.index({ client_id: 1, month: 1 }, { unique: true });

const Usage = mongoose.model('Usage', usage_schema);

export default Usage;
