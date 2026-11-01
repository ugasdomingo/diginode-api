import User from '../models/user_model.js';
import { sign_token } from '../utils/jwt_utils.js';
import { issue_client_otp, resend_client_otp, verify_client_otp } from '../services/otp_service.js';

const public_user = (user) => ({
  id: user._id,
  email: user.email,
  role: user.role,
  client_id: user.client_id,
  password_change_required: user.password_change_required ?? false,
});

const session_for = (user) => {
  const expires_in = user.role === 'admin' ? '8h' : '24h';
  return sign_token(
    { user_id: user._id, role: user.role, token_version: user.token_version ?? 0 },
    expires_in
  );
};

const otp_unavailable = (res) =>
  res.status(503).json({
    success: false,
    message: 'No se pudo enviar el código de acceso. Inténtalo más tarde.',
  });

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user || !user.is_active || !(await user.check_password(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Clients need a second factor. Admins (Domingo) keep the single password step.
    // Set CLIENT_2FA_REQUIRED=false only as a temporary rollback.
    if (user.role === 'client' && process.env.CLIENT_2FA_REQUIRED !== 'false') {
      try {
        const challenge = await issue_client_otp(user);
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, requires_otp: true, challenge_id: challenge.challenge_id });
      } catch (err) {
        if (err.status_code === 503) return otp_unavailable(res);
        throw err;
      }
    }

    res.json({ success: true, token: session_for(user), user: public_user(user) });
  } catch (err) {
    next(err);
  }
};

const verify_otp = async (req, res, next) => {
  try {
    const user_id = await verify_client_otp(req.body);
    if (!user_id) {
      return res.status(401).json({ success: false, message: 'Código no válido o caducado' });
    }
    const user = await User.findById(user_id);
    if (!user || !user.is_active || user.role !== 'client') {
      return res.status(401).json({ success: false, message: 'Código no válido o caducado' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, token: session_for(user), user: public_user(user) });
  } catch (err) {
    next(err);
  }
};

const resend_otp = async (req, res, next) => {
  try {
    const challenge = await resend_client_otp(req.body.challenge_id);
    if (!challenge) {
      return res.status(401).json({ success: false, message: 'Código no válido o caducado' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, requires_otp: true, challenge_id: challenge.challenge_id });
  } catch (err) {
    if (err.status_code === 503) return otp_unavailable(res);
    next(err);
  }
};

const change_password = async (req, res, next) => {
  try {
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const password_hash = await User.hash_password(new_password);

    await User.findByIdAndUpdate(req.user._id, {
      password_hash,
      password_change_required: false,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout-all — invalidates every existing token for this user
const logout_all = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { token_version: 1 } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

export { login, verify_otp, resend_otp, change_password, logout_all };
