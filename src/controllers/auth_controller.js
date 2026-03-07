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
        id: user._id,
        email: user.email,
        role: user.role,
        client_id: user.client_id,
      },
    });
  } catch (err) {
    next(err);
  }
};

export { login };
