import User from '../models/user_model.js';
import { sign_token } from '../utils/jwt_utils.js';

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

    const expires_in = user.role === 'admin' ? '8h' : '7d';
    const token = sign_token({ user_id: user._id, role: user.role }, expires_in);

    res.json({
      success: true,
      token,
      user: {
        id:                       user._id,
        email:                    user.email,
        role:                     user.role,
        client_id:                user.client_id,
        password_change_required: user.password_change_required ?? false,
      },
    });
  } catch (err) {
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

export { login, change_password };
