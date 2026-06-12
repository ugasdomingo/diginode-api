// Clamps pagination query params to safe bounds so a client can't request an
// unbounded page size (memory-exhaustion DoS). Returns normalized page/limit/skip.
export const clamp_pagination = (query = {}, { default_limit = 20, max_limit = 100 } = {}) => {
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || default_limit, 1), max_limit);
  return { page, limit, skip: (page - 1) * limit };
};
