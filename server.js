const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db');

// Route imports
const employeeRoutes = require('./routes/employees');

const app = express();

/**
 * MIDDLEWARE
 */
app.use(cors());
app.use(express.json());

/**
 * HEALTH CHECK
 * Used by Render and for quick testing
 */
app.get('/', (req, res) => {
  res.json({ status: 'TRS Skill Matrix backend running' });
});

/**
 * EMPLOYEE ROUTES (VIEWER)
 */
app.use('/employees', employeeRoutes);

/**
 * GLOBAL ERROR HANDLER (SAFETY NET)
 */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

/**
 * SERVER START
 * IMPORTANT: use process.env.PORT for Render
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Optional DB connectivity check (logs only)
  try {
    await pool.query('SELECT 1');
    console.log('Connected to PostgreSQL');
  } catch (err) {
    console.error('Database connection failed:', err.message);
  }
});
