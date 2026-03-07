import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const user_schema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'client'],
      required: true,
    },
    // Only populated for role === 'client'
    client_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Client',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Never expose the password hash in API responses
user_schema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password_hash;
    return ret;
  },
});

user_schema.methods.check_password = async function (plain_password) {
  return bcrypt.compare(plain_password, this.password_hash);
};

user_schema.statics.hash_password = async (plain_password) => {
  return bcrypt.hash(plain_password, 12);
};

const User = mongoose.model('User', user_schema);

export default User;
