// Forwards async rejections to the global error middleware.
const async_handler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default async_handler;
