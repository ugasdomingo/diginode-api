// Validates a request section against a Zod schema. Usage:
//   router.post('/login', validate(login_schema), login);
//   router.post('/:slug/waitlist', validate(waitlist_schema, 'body'), join_waitlist);
// On failure responds 400 with the first validation message; on success replaces
// req[source] with the parsed (and coerced/trimmed) value.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? `${first.path.join('.')}: ` : '';
    return res.status(400).json({ success: false, message: `${path}${first.message}` });
  }
  req[source] = result.data;
  next();
};

export default validate;
