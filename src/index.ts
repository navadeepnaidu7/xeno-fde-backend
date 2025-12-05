import express, { Express, Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import tenantRoutes from './routes/tenants';
import webhookRoutes from './routes/webhook';
import syncRoutes from './routes/sync';
import analyticsRoutes from './routes/analytics';
import { startScheduler } from './jobs/scheduler';

dotenv.config();

// Extend Express Request to include rawBody
declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

const app: Express = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// JSON parser with raw body capture for HMAC verification
app.use(express.json({
  verify: (req: Request, res: Response, buf: Buffer) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

// API v1 Routes
app.use('/api/v1/webhook', webhookRoutes);
app.use('/api/v1/tenants', tenantRoutes);
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Health check (keep at root for simple uptime monitoring)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ 
    message: 'Xeno FDE Backend API',
    version: 'v1',
    docs: '/api/v1',
    health: '/health'
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Start the scheduler for periodic sync
  startScheduler();
});

export default app;
