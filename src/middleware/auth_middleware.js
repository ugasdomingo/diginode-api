import { verify_token } from '../utils/jwt_utils.js';
import User from '../models/user_model.js';

// Verifies JWT and attaches the user to req.user
const authenticate = async (req, res, next) => {
  const auth_header = req.headers.authorization;

  if (!auth_header || !auth_header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = auth_header.split(' ')[1];

  try {
    const payload = verify_token(token);
    const user = await User.findById(payload.user_id).select('-password_hash');

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive account' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

// Restricts a route to users with a specific role
const require_role = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

export { authenticate, require_role };
