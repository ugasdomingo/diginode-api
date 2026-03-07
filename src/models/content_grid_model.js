import mongoose from 'mongoose';

const content_grid_schema = new mongoose.Schema(
  {
    // The theme or topic used to generate this batch
    theme: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ['instagram', 'linkedin', 'tiktok', 'twitter'],
      required: true,
    },
    scheduled_for: {
      type: Date,
    },
    // Post body text
    copy: {
      type: String,
    },
    // Prompt sent to the image generation model
    image_prompt: {
      type: String,
    },
    // URL where the generated image is stored
    image_url: {
      type: String,
    },
    status: {
      type: String,
      enum: ['draft', 'approved', 'rejected', 'published'],
      default: 'draft',
    },
    // Start date of the week this post belongs to (for grouping)
    week_start: {
      type: Date,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const ContentGrid = mongoose.model('ContentGrid', content_grid_schema);

export default ContentGrid;
