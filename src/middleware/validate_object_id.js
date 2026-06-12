import { isValidObjectId } from 'mongoose';

// Rejects a malformed :id param with 400 instead of letting a CastError bubble
// up as a 500. Usage: router.get('/clients/:client_id', validate_object_id('client_id'), ...)
const validate_object_id = (param = 'id') => (req, res, next) => {
  if (!isValidObjectId(req.params[param])) {
    return res.status(400).json({ success: false, message: `${param} no válido` });
  }
  next();
};

export default validate_object_id;
