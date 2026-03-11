import mongoose from 'mongoose';

const blog_post_schema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    excerpt: {
      type: String,
      trim: true,
      default: '',
    },
    thumbnail_url: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['draft', 'published'],
      default: 'draft',
    },
    published_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const BlogPost = mongoose.model('BlogPost', blog_post_schema);

export default BlogPost;
