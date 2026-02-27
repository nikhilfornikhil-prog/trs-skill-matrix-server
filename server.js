
console.log("Connected database URL:", process.env.DATABASE_URL);
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors());
app.use(express.json());

/* ---------------- DATABASE ---------------- */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

/* ---------------- AUTH MIDDLEWARE ---------------- */

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/* ---------------- ADMIN LOGIN ---------------- */

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const admin = result.rows[0];

    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- RESET PASSWORD ---------------- */

app.post('/admin/reset-password', async (req, res) => {
  try {
    const { username, newPassword, confirmPassword, secret } = req.body;

    if (!username || !newPassword || !confirmPassword || !secret) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (secret !== process.env.ADMIN_RESET_SECRET) {
      return res.status(403).json({ message: 'Invalid secret key' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters'
      });
    }

    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.query(
      'UPDATE admins SET password = $1 WHERE username = $2',
      [hashedPassword, username]
    );

    res.json({ message: 'Password reset successful' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- EMPLOYEES (PUBLIC) ---------------- */

app.get('/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, robot_count
      FROM employees
      ORDER BY name
    `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- PROTECTED EXAMPLE ---------------- */

app.post('/employees', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    await pool.query(
      'INSERT INTO employees (name) VALUES ($1)',
      [name]
    );

    res.json({ message: 'Employee added' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- START SERVER ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});