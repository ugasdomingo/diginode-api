import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';

import auth_routes from './routes/auth_routes.js';
import webhook_routes from './routes/webhook_routes.js';
import admin_routes from './routes/admin_routes.js';
import portal_routes from './routes/portal_routes.js';
import blog_routes from './routes/blog_routes.js';
import course_routes from './routes/course_routes.js';
import error_middleware from './middleware/error_middleware.js';

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// HTTP logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// JSON parsing for all routes
app.use(express.json());

// Rate limiting — 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Routes
app.use('/api/auth', auth_routes);
app.use('/api/webhooks', webhook_routes);
app.use('/api/admin', admin_routes);
app.use('/api/portal', portal_routes);
app.use('/api/blog', blog_routes);
app.use('/api/courses', course_routes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler (must be last)
app.use(error_middleware);

export default app;
