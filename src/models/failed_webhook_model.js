import mongoose from 'mongoose';

// Dead-letter for outgoing webhooks that exhausted their retries (F6-5), so a
// transient Make.com outage doesn't silently drop events. Reprocessed manually.
const failed_webhook_schema = new mongoose.Schema(
  {
    url:      { type: String, required: true },
    payload:  { type: mongoose.Schema.Types.Mixed },
    label:    { type: String },          // e.g. 'make_content', 'make_recepcionista'
    error:    { type: String },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const FailedWebhook = mongoose.model('FailedWebhook', failed_webhook_schema);

export default FailedWebhook;
