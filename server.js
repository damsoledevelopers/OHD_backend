require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');

// Import routes
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/companies');
const responseRoutes = require('./routes/responses');
const questionPaperRoutes = require('./routes/questionPaper');
const reportRoutes = require('./routes/reports');
const exportRoutes = require('./routes/export');
const mailRoutes = require('./routes/mail');
const { sendCompanyFormLink } = require('./controllers/mailController');
const { requireAdmin } = require('./middleware/auth');
const publicRoutes = require('./routes/public');
const departmentRoutes = require('./routes/departments');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL, 'https://ohd-roan.vercel.app']
  : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'https://ohd-roan.vercel.app'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('JSON Syntax Error:', err.message);
    return res.status(400).send({ error: 'Malformed JSON' });
  }
  next();
});
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Logging middleware
app.use((req, res, next) => {
  console.log(`>> [API REQUEST] ${req.method} ${req.path}`, req.body);
  next();
});

// Connect to database
async function startServer() {
  try {
    await connectDB();
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
    // If the DB connection fails, keep the process alive so you can see logs,
    // but API endpoints will fail until MongoDB is available.
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(
      '[Mail] Company form share: POST /api/companies/share-registration-link (admin) | also POST /api/mail/company-form',
    );
  });
}

// Routes
app.use('/api/public', publicRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/question-paper', questionPaperRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/export', exportRoutes);
// Registered on the app first so POST /api/mail/company-form always resolves (avoids 404 if router file is stale).
app.post('/api/mail/company-form', requireAdmin, sendCompanyFormLink);
app.use('/api/mail', mailRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ 
    message: 'OHD Backend API Server',
    status: 'running',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

startServer();

module.exports = app;

