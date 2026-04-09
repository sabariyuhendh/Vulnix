import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from './config/env.js';
import { connectDatabase } from './config/database.js';
import authRoutes from './routes/auth.routes.js';
import scanRoutes from './routes/scan.routes.js';
import monitoringRoutes from './routes/monitoring.routes.js';
import websiteScanRoutes from './routes/websiteScan.routes.js';
import sandboxScanRoutes from './routes/sandboxScan.routes.js';
import historyRoutes from './routes/history.routes.js';
import { MonitoringWorker } from './workers/monitoring.worker.js';

const app = express();

// CORS configuration - normalize frontend URL to remove trailing slash
const frontendUrl = config.frontendUrl.replace(/\/$/, '');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Normalize the origin by removing trailing slash
    const normalizedOrigin = origin.replace(/\/$/, '');
    
    // Check if normalized origin matches normalized frontend URL
    if (normalizedOrigin === frontendUrl) {
      callback(null, true);
    } else {
      console.log(`CORS blocked: ${origin} (normalized: ${normalizedOrigin}) !== ${frontendUrl}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/scan', scanRoutes);
app.use('/api/monitoring', monitoringRoutes);
app.use('/api/website-scan', websiteScanRoutes);
app.use('/api/sandbox', sandboxScanRoutes);
app.use('/api/history', historyRoutes);

// Health check
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: config.nodeEnv
  });
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Connect to MongoDB and start server
const startServer = async () => {
  try {
    // Try to connect to database, but don't fail if it's not available
    try {
      await connectDatabase();
    } catch (dbError) {
      console.error('⚠️  Database connection failed, but server will continue...');
    }
    
    const port = Number(config.port) || 10000;
    // Bind to 0.0.0.0 in production or if RENDER environment variable is set
    const isProduction = config.nodeEnv === 'production' || process.env.RENDER === 'true';
    const host = isProduction ? '0.0.0.0' : 'localhost';
    
    console.log(`🔧 Binding to ${host}:${port} (${isProduction ? 'production' : 'development'} mode)`);
    
    app.listen(port, host, () => {
      console.log(`🚀 Backend server running on http://${host}:${port}`);
      console.log(`📱 Frontend URL: ${config.frontendUrl}`);
      console.log(`🔐 GitHub OAuth configured: ${!!config.github.clientId}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`💾 MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
      
      // Start monitoring worker only if DB is connected
      if (mongoose.connection.readyState === 1) {
        MonitoringWorker.start();
      } else {
        console.log('⚠️  Monitoring worker not started (no database connection)');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  MonitoringWorker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  MonitoringWorker.stop();
  process.exit(0);
});

startServer();
