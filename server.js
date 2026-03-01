require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ================= AUTH MIDDLEWARE ================= */

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader)
    return res.status(401).json({ message: 'Access denied' });

  const token = authHeader.split(' ')[1];

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch {
    res.status(400).json({ message: 'Invalid token' });
  }
};

/* ================= ADMIN LOGIN ================= */

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM admins WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ message: 'Invalid credentials' });

    const admin = result.rows[0];

    const valid = await bcrypt.compare(password, admin.password);

    if (!valid)
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: admin.id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= GET EMPLOYEES ================= */

app.get('/employees', async (req, res) => {
  try {

    const employeesResult = await pool.query(`
      SELECT 
        e.id,
        e.name,
        COUNT(DISTINCT es.robot_id) AS robot_count
      FROM employees e
      LEFT JOIN employee_skills es ON e.id = es.employee_id
      GROUP BY e.id
      ORDER BY e.name
    `);

    const totalRobotsResult = await pool.query(`
      SELECT COUNT(DISTINCT robot_id) AS total
      FROM employee_skills
    `);

    res.json({
      employees: employeesResult.rows,
      totalRobots: parseInt(totalRobotsResult.rows[0].total || 0)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= GET EMPLOYEE DETAILS ================= */

app.get('/employees/:id', async (req, res) => {
  try {

    const result = await pool.query(`
      SELECT 
        es.id,
        r.name AS robot,
        a.name AS application,
        es.rating
      FROM employee_skills es
      JOIN robots r ON es.robot_id = r.id
      JOIN applications a ON es.application_id = a.id
      WHERE es.employee_id = $1
      ORDER BY r.name
    `, [req.params.id]);

    const grouped = {};

    result.rows.forEach(row => {
      if (!grouped[row.robot]) grouped[row.robot] = [];

      grouped[row.robot].push({
        id: row.id,
        application: row.application,
        rating: row.rating
      });
    });

    res.json(grouped);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= ADD EMPLOYEE ================= */

app.post('/admin/employee', verifyToken, async (req, res) => {
  try {
    const { name, employee_code, robot, application, rating } = req.body;

    if (!name || !employee_code || !robot || !application)
      return res.status(400).json({ message: 'All fields required' });

    // Insert employee if not exists
    const empResult = await pool.query(
      `INSERT INTO employees (name, employee_code)
       VALUES ($1, $2)
       ON CONFLICT (employee_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [name, employee_code]
    );

    const employeeId = empResult.rows[0].id;

    // Get robot id
    const robotResult = await pool.query(
      `SELECT id FROM robots WHERE name = $1`,
      [robot]
    );

    if (robotResult.rows.length === 0)
      return res.status(400).json({ message: 'Invalid robot' });

    const robotId = robotResult.rows[0].id;

    // Get application id
    const appResult = await pool.query(
      `SELECT id FROM applications WHERE name = $1`,
      [application]
    );

    if (appResult.rows.length === 0)
      return res.status(400).json({ message: 'Invalid application' });

    const applicationId = appResult.rows[0].id;

    // Prevent duplicate skill
    const check = await pool.query(
      `SELECT id FROM employee_skills
       WHERE employee_id = $1
       AND robot_id = $2
       AND application_id = $3`,
      [employeeId, robotId, applicationId]
    );

    if (check.rows.length > 0)
      return res.status(400).json({ message: 'Skill already exists' });

    await pool.query(
      `INSERT INTO employee_skills
       (employee_id, robot_id, application_id, rating)
       VALUES ($1, $2, $3, $4)`,
      [employeeId, robotId, applicationId, rating]
    );

    res.json({ message: 'Employee saved' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= DELETE EMPLOYEE ================= */

app.delete('/employees/:id', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM employees WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Employee deleted' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= DELETE SKILL ================= */

app.delete('/employee-skills/:id', verifyToken, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM employee_skills WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Skill deleted' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});