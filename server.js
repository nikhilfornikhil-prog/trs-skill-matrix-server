require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');
const adminAuth = require('./middleware/authAdmin');

const app = express();
app.use(cors());
app.use(express.json());

/* =====================
   AUTH (ADMIN LOGIN)
===================== */
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword || user.role !== 'ADMIN') {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* =====================
   PUBLIC APIs (VIEWER)
===================== */
app.get('/applications', async (req, res) => {
  const result = await pool.query('SELECT * FROM applications ORDER BY name');
  res.json(result.rows);
});

app.get('/employees', async (req, res) => {
  const { applicationId } = req.query;

  let query = 'SELECT * FROM employees';
  let params = [];

  if (applicationId) {
    query += ' WHERE application_id = $1';
    params.push(applicationId);
  }

  const result = await pool.query(query, params);
  res.json(result.rows);
});

/* =====================
   START SERVER
===================== */
const PORT = process.env.PORT || 3000;
/* =====================
   ADMIN APIs (PROTECTED)
===================== */

// Add new application
app.post('/admin/applications', adminAuth, async (req, res) => {
  const { name } = req.body;

  const result = await pool.query(
    'INSERT INTO applications (name) VALUES ($1) RETURNING *',
    [name]
  );

  res.json(result.rows[0]);
});

// Add employee
app.post('/admin/employees', adminAuth, async (req, res) => {
  const { name, employee_code, application_id, skill_level } = req.body;

  const result = await pool.query(
    `INSERT INTO employees (name, employee_code, application_id, skill_level)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, employee_code, application_id, skill_level]
  );

  res.json(result.rows[0]);
});

// Update employee
app.put('/admin/employees/:id', adminAuth, async (req, res) => {
  const { name, employee_code, application_id, skill_level } = req.body;
  const { id } = req.params;

  const result = await pool.query(
    `UPDATE employees
     SET name=$1, employee_code=$2, application_id=$3, skill_level=$4
     WHERE id=$5
     RETURNING *`,
    [name, employee_code, application_id, skill_level, id]
  );

  res.json(result.rows[0]);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
