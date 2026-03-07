/**
 * Creates the initial admin user.
 * Run once with: node scripts/seed_admin.js
 *
 * Requires MONGO_URI and JWT_SECRET to be set in .env
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/user_model.js';

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: node scripts/seed_admin.js <email> <password>');
  process.exit(1);
}

if (password.length < 8) {
  console.error('Password must be at least 8 characters');
  process.exit(1);
}

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ role: 'admin' });
  if (existing) {
    console.log(`Admin already exists: ${existing.email}`);
    process.exit(0);
  }

  const password_hash = await User.hash_password(password);
  await User.create({ email, password_hash, role: 'admin' });

  console.log(`Admin created: ${email}`);
  process.exit(0);
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
