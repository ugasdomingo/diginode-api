import mongoose from 'mongoose';

const waitlist_schema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Prevent duplicate signups per course
waitlist_schema.index({ course: 1, email: 1 }, { unique: true });

const CourseWaitlist = mongoose.model('CourseWaitlist', waitlist_schema);

export default CourseWaitlist;
