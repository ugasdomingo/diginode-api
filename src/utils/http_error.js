const http_error = (status_code, message) => {
  const err = new Error(message);
  err.status_code = status_code;
  return err;
};

export default http_error;
