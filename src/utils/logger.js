import pino from 'pino';

// Structured logger with levels + timestamps. Redacts common secret-bearing
// fields so tokens/passwords never reach the logs (F6-8).
const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  redact: {
    paths: [
      'password', 'password_hash', 'token', 'authorization',
      'req.headers.authorization', '*.password', '*.token', 'office_admin_token',
    ],
    censor: '[redacted]',
  },
});

export default logger;
