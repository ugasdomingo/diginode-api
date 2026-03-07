import 'dotenv/config';
import validate_env from './config/env.js';
import connect_db from './config/db.js';
import app from './app.js';

validate_env();

const PORT = process.env.PORT || 3000;

const start = async () => {
  await connect_db();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
};

start();
