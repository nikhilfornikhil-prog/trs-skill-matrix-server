require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors());
app.use(express.json());

/* ---------------- DATABASE ---------------- */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
});

pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('DB connection error', err));

/* ---------------- AUTH MIDDLEWARE ---------------- */

const authenticateAdmin = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ message: 'Missing token' });

  const token = auth.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'ADMIN') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/* ---------------- HEALTH ---------------- */

app.get('/', (req, res) => {
  res.json({ status: 'TRS Skill Matrix backend running' });
});

/* ---------------- ADMIN LOGIN ---------------- */

app.post('/admin/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND role = $2',
      [username, 'ADMIN']
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ---------------- EMPLOYEES ---------------- */

app.get('/employees', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.name, COUNT(DISTINCT r.id) AS robot_count
      FROM employees e
      LEFT JOIN employee_skills es ON es.employee_id = e.id
      LEFT JOIN robots r ON r.id = es.robot_id
      GROUP BY e.id
      ORDER BY e.name
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error loading employees' });
  }
});

app.get('/employees/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(`
      SELECT r.name AS robot, a.name AS application, es.rating
      FROM employee_skills es
      JOIN robots r ON r.id = es.robot_id
      JOIN applications a ON a.id = es.application_id
      WHERE es.employee_id = $1
      ORDER BY r.name, a.name
    `, [id]);

    const grouped = {};
    result.rows.forEach(row => {
      if (!grouped[row.robot]) grouped[row.robot] = [];
      grouped[row.robot].push({
        application: row.application,
        rating: row.rating,
      });
    });

    res.json(grouped);
  } catch (err) {
    res.status(500).json({ message: 'Error loading employee details' });
  }
});

/* ---------------- FILTERS ---------------- */

app.get('/filters', async (req, res) => {
  try {
    const robots = await pool.query('SELECT id, name FROM robots ORDER BY name');
    const applications = await pool.query(`
      SELECT a.id, a.name, r.name AS robot
      FROM applications a
      JOIN robots r ON r.id = a.robot_id
      ORDER BY r.name, a.name
    `);

    res.json({
      robots: robots.rows,
      applications: applications.rows,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading filters' });
  }
});

app.get('/filters/search', async (req, res) => {
  const { robot, application, rating } = req.query;

  try {
    const result = await pool.query(`
      SELECT DISTINCT e.id, e.name
      FROM employees e
      JOIN employee_skills es ON es.employee_id = e.id
      JOIN robots r ON r.id = es.robot_id
      JOIN applications a ON a.id = es.application_id
      WHERE ($1::text IS NULL OR r.name = $1)
        AND ($2::text IS NULL OR a.name = $2)
        AND ($3::int IS NULL OR es.rating = $3)
      ORDER BY e.name
    `, [robot || null, application || null, rating ? Number(rating) : null]);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Filter search failed' });
  }
});

/* ---------------- SEARCH ---------------- */

app.get('/search', async (req, res) => {
  const q = `%${req.query.q.toLowerCase()}%`;

  try {
    const appSearch = await pool.query(`
      SELECT e.name AS employee, r.name AS robot, a.name AS application, es.rating
      FROM employee_skills es
      JOIN employees e ON e.id = es.employee_id
      JOIN robots r ON r.id = es.robot_id
      JOIN applications a ON a.id = es.application_id
      WHERE LOWER(a.name) LIKE $1
         OR LOWER(r.name) LIKE $1
      ORDER BY a.name, e.name
    `, [q]);

    if (appSearch.rows.length > 0) {
      return res.json({
        type: 'application',
        results: appSearch.rows,
      });
    }

    const empSearch = await pool.query(`
      SELECT id, name FROM employees
      WHERE LOWER(name) LIKE $1
      ORDER BY name
    `, [q]);

    res.json({
      type: 'employee',
      results: empSearch.rows,
    });
  } catch (err) {
    res.status(500).json({ message: 'Search failed' });
  }
});

/* ---------------- ADMIN ADD EMPLOYEE ---------------- */

app.post('/admin/employee', authenticateAdmin, async (req, res) => {
  const { name, employee_code, robot, application, rating } = req.body;

  try {
    const emp = await pool.query(
      'INSERT INTO employees (name, employee_code) VALUES ($1, $2) RETURNING id',
      [name, employee_code]
    );

    const robotRes = await pool.query(
      'SELECT id FROM robots WHERE name = $1',
      [robot]
    );

    const appRes = await pool.query(
      'SELECT id FROM applications WHERE name = $1',
      [application]
    );

    await pool.query(`
      INSERT INTO employee_skills (employee_id, robot_id, application_id, rating)
      VALUES ($1, $2, $3, $4)
    `, [
      emp.rows[0].id,
      robotRes.rows[0].id,
      appRes.rows[0].id,
      rating,
    ]);

    res.json({ message: 'Employee added successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Add employee failed' });
  }
});

/* ---------------- START SERVER ---------------- */

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
