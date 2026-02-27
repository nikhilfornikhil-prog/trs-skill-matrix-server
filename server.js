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

/* ---------------- VERIFY TOKEN ---------------- */

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Access denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = verified;
    next();
  } catch {
    res.status(400).json({ message: 'Invalid token' });
  }
}

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

/* ---------------- GET EMPLOYEES ---------------- */

app.get('/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id,
        e.name,
        COUNT(DISTINCT es.robot_id) AS robot_count
      FROM employees e
      LEFT JOIN employee_skills es
      ON e.id = es.employee_id
      GROUP BY e.id
      ORDER BY e.name
    `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- GET EMPLOYEE DETAILS ---------------- */

app.get('/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT 
        r.name AS robot,
        a.name AS application,
        es.rating
      FROM employee_skills es
      JOIN robots r ON es.robot_id = r.id
      JOIN applications a ON es.application_id = a.id
      WHERE es.employee_id = $1
      ORDER BY r.name
    `, [id]);

    const grouped = {};

    result.rows.forEach(row => {
      if (!grouped[row.robot]) {
        grouped[row.robot] = [];
      }

      grouped[row.robot].push({
        application: row.application,
        rating: row.rating
      });
    });

    res.json(grouped);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- ADD EMPLOYEE ---------------- */

app.post('/employees', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    const result = await pool.query(
      'INSERT INTO employees (name) VALUES ($1) RETURNING *',
      [name]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- MASTER ROBOTS ---------------- */

app.get('/robots', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM robots ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/robots', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    await pool.query(
      'INSERT INTO robots (name) VALUES ($1)',
      [name]
    );

    res.json({ message: 'Robot added' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- MASTER APPLICATIONS ---------------- */

app.get('/applications', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM applications ORDER BY name'
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

app.post('/applications', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;

    await pool.query(
      'INSERT INTO applications (name) VALUES ($1)',
      [name]
    );

    res.json({ message: 'Application added' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- ADD EMPLOYEE SKILL ---------------- */

app.post('/employee-skills', verifyToken, async (req, res) => {
  try {
    const { employee_id, robot_id, application_id, rating } = req.body;

    await pool.query(`
      INSERT INTO employee_skills
      (employee_id, robot_id, application_id, rating)
      VALUES ($1, $2, $3, $4)
    `, [employee_id, robot_id, application_id, rating]);

    res.json({ message: 'Skill added' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- START SERVER ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});