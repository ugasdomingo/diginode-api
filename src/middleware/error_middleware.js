const error_middleware = (err, _req, res, _next) => {
  const status_code = err.status_code || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(status_code).json({
    success: false,
    message,
  });
};

export default error_middleware;
