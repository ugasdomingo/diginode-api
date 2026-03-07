import jwt from 'jsonwebtoken';

const sign_token = (payload, expires_in = '8h') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: expires_in });
};

const verify_token = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

export { sign_token, verify_token };
