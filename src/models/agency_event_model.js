import mongoose from 'mongoose';

const agency_event_schema = new mongoose.Schema(
  {
    event: { type: String, required: true, maxlength: 80 },
    status: { type: String, maxlength: 40 },
    title: { type: String, maxlength: 80 },
    url: { type: String, maxlength: 500 },
    approval_id: { type: mongoose.Schema.Types.ObjectId },
    piece_id: { type: mongoose.Schema.Types.ObjectId },
    client_id: { type: mongoose.Schema.Types.ObjectId, index: true },
    resource_id: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: false } }
);

agency_event_schema.index({ created_at: -1 });

const AgencyEvent = mongoose.model('AgencyEvent', agency_event_schema);

export default AgencyEvent;
