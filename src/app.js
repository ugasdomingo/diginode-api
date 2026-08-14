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
import plans_routes from './routes/plans_routes.js';
import clinica_routes from './routes/clinica_routes.js';
import demo_routes from './routes/demo_routes.js';
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

// Stripe webhooks need the raw body for signature validation — must come BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes — cap body size to blunt memory-exhaustion payloads
app.use(express.json({ limit: '1mb' }));

// Rate limiting — generous global ceiling for normal navigation; tighter limiters
// live on sensitive routes (login, public forms). Webhooks are excluded: they are
// already authenticated by signature and Stripe may retry in bursts.
const global_limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/webhooks'),
});
app.use(global_limiter);

// Routes
app.use('/api/auth', auth_routes);
app.use('/api/webhooks', webhook_routes);
app.use('/api/admin', admin_routes);
app.use('/api/portal', portal_routes);
app.use('/api/blog', blog_routes);
app.use('/api/plans', plans_routes);
app.use('/api/clinica', clinica_routes);
app.use('/api/demo', demo_routes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Global error handler (must be last)
app.use(error_middleware);

export default app;
