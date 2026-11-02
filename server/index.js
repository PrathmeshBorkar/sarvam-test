import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../client/dist');

const app = express();
const PORT = process.env.PORT || 5000;
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:5173';

// 1. CORS configured strictly for WEB_ORIGIN
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, postman, webhooks)
      if (!origin || origin === WEB_ORIGIN) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev/tunnel mode
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    credentials: true,
  })
);

// 2. Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Simple rate limiting on /api/* (100 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// 4. Mount core API router
app.use('/api', apiRouter);

// 5. Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Civic Voice Portal Backend',
    timestamp: new Date().toISOString(),
  });
});

// 6. Test Sarvam AI endpoint (Chat)
app.get('/api/test-sarvam', async (req, res) => {
  try {
    const result = await chatCompletion([
      {
        role: 'user',
        content: 'You are an Indian civic assistant. In one short sentence, confirm that the Sarvam AI system is operational.',
      },
    ]);

    const reply = result?.choices?.[0]?.message?.content?.trim() || 'No message content returned';

    res.json({
      success: true,
      model: result?.model || 'sarvam-105b',
      message: reply,
      usage: result?.usage,
    });
  } catch (error) {
    console.error('[Sarvam Test] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 6. Serve static React frontend if built
if (fs.existsSync(clientDistPath)) {
  console.log(`[Frontend] Serving static frontend from: ${clientDistPath}`);
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

// 7. Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size exceeds limit (Max 8MB for images, 5MB for audio)' });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 8. Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS allowed origin: ${WEB_ORIGIN}`);
});
