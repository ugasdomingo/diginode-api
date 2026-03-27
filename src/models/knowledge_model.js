import mongoose from 'mongoose';

// Single-document store for each AI agent's knowledge base.
// Use Knowledge.findOneAndUpdate({ key }, { content }, { upsert: true }) to set.
const knowledge_schema = new mongoose.Schema(
  {
    key:     { type: String, required: true, unique: true, trim: true },
    content: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Knowledge = mongoose.model('Knowledge', knowledge_schema);

export default Knowledge;
