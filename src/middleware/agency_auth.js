import { verify_token } from '../utils/jwt_utils.js';
import User from '../models/user_model.js';
import ApiKey from '../models/api_key_model.js';
import { hash_api_key, hashes_equal } from '../services/api_key_service.js';

const unauthorized = (res) => res.status(401).json({ success: false, message: 'No autorizado' });

// Accepts a user JWT (admin or client) or a bot key `dnk_...` via Authorization
// or X-Api-Key. Existing /api/admin and /api/portal routes do not use this.
export const authenticate_agency = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = String(
    req.headers['x-api-key'] || (header.startsWith('Bearer ') ? header.slice(7) : '')
  ).trim();
  if (!token) return unauthorized(res);

  try {
    if (token.startsWith('dnk_')) {
      const key_hash = hash_api_key(token);
      const key = await ApiKey.findOne({ key_hash }).select('+key_hash');
      if (!key || key.revoked_at || !hashes_equal(key.key_hash, key_hash)) return unauthorized(res);
      req.actor = {
        type: 'bot',
        id: key._id.toString(),
        name: key.name,
        label: key.name,
        scopes: key.scopes || [],
        client_ids: (key.client_ids || []).map(String),
      };
      ApiKey.updateOne({ _id: key._id }, { $set: { last_used_at: new Date() } }).catch(() => {});
      return next();
    }

    const payload = verify_token(token);
    const user = await User.findById(payload.user_id).select('-password_hash');
    if (!user || !user.is_active) return unauthorized(res);
    if ((payload.token_version ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ success: false, message: 'Sesión caducada' });
    }
    req.user = user;
    req.actor = {
      type: 'user',
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      label: user.email,
      client_id: user.client_id ? user.client_id.toString() : null,
      scopes: [],
    };
    return next();
  } catch {
    return unauthorized(res);
  }
};

// Users pass by role. Bots pass when they have at least one of the scopes.
export const allow =
  ({ roles = [], scopes = [] } = {}) =>
  (req, res, next) => {
    const actor = req.actor;
    if (!actor) return unauthorized(res);
    if (actor.type === 'user' && roles.includes(actor.role)) return next();
    if (actor.type === 'bot' && scopes.some((scope) => actor.scopes.includes(scope))) return next();
    return res.status(403).json({ success: false, message: 'Acceso denegado' });
  };
