import mongoose from 'mongoose';

const course_schema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: '' },
    content: { type: String, default: '' },
    price: { type: Number, required: true },
    start_date: { type: Date, default: null },
    active: { type: Boolean, default: false },
    thumbnail_url: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const Course = mongoose.model('Course', course_schema);

export default Course;
