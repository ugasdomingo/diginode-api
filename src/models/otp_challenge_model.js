import mongoose from 'mongoose';

const otp_challenge_schema = new mongoose.Schema(
  {
    challenge_id: { type: String, required: true, unique: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    code_hash: { type: String, required: true, select: false },
    expires_at: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumed_at: { type: Date },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

// Drop spent challenges a day after they expire. The code itself is only a hash.
otp_challenge_schema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

const OtpChallenge = mongoose.model('OtpChallenge', otp_challenge_schema);

export default OtpChallenge;
