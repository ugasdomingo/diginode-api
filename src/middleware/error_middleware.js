import logger from '../utils/logger.js';

const error_middleware = (err, req, res, _next) => {
  const status_code = err.status_code || err.status || 500;
  const message = err.message || 'Internal server error';

  // Log server-side faults with context; client (4xx) errors stay quiet.
  if (status_code >= 500) {
    if (req.path.startsWith('/api/leads') || req.path.startsWith('/api/demo')) logger.error({ code: err.code, method: req.method, path: req.path }, 'Public request failed');
    else logger.error({ err, method: req.method, path: req.originalUrl }, message);
  }

  // Never expose internal error details (SDK messages, stack traces, etc.) to the client.
  const client_message = status_code >= 500
    ? 'Hay un problema temporal con el servicio. Por favor, inténtalo de nuevo en unos momentos.'
    : message;

  res.status(status_code).json({
    success: false,
    message: client_message,
  });
};

export default error_middleware;
