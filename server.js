require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

/* ===== NEW: OPENAI ===== */

const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const app = express();

app.use(cors());
app.use(express.json());

/* ================= DATABASE ================= */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ================= ROOT ================= */

app.get('/', (req, res) => {
  res.send('TRS Skill Matrix API Running');
});

/* ================= ADMIN LOGIN ================= */

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
      ORDER BY e.id
    `);

    const robotsResult = await pool.query(`
      SELECT COUNT(*) FROM robots
    `);

    res.json({
      employees: employeesResult.rows,
      totalRobots: Number(robotsResult.rows[0].count)
    });

  } catch (error) {

    console.error(error);

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
    `, [req.params.id]);

    const formatted = {};

    result.rows.forEach(row => {

      if (!formatted[row.robot]) {
        formatted[row.robot] = [];
      }

      formatted[row.robot].push({
        id: row.id,
        application: row.application,
        rating: row.rating
      });

    });

    res.json(formatted);

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= GET FILTERS ================= */

app.get('/filters', async (req, res) => {
  try {

    const robots = await pool.query(`
      SELECT * FROM robots ORDER BY name
    `);

    const applications = await pool.query(`
      SELECT * FROM applications ORDER BY name
    `);

    res.json({
      robots: robots.rows,
      applications: applications.rows
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= ADD EMPLOYEE ================= */

app.post('/admin/employee', async (req, res) => {
  try {

    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Employee name required' });
    }

    const result = await pool.query(`
      INSERT INTO employees (name)
      VALUES ($1)
      RETURNING id
    `, [name.trim()]);

    res.json({ id: result.rows[0].id });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= ADD SKILL ================= */

app.post('/employee-skills', async (req, res) => {
  try {

    const { employee_id, robot_id, application_id, rating } = req.body;

    if (!employee_id || !robot_id || !application_id) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    await pool.query(`
      INSERT INTO employee_skills
      (employee_id, robot_id, application_id, rating)
      VALUES ($1, $2, $3, $4)
    `, [employee_id, robot_id, application_id, rating || 0]);

    res.json({ message: 'Skill added successfully' });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= UPDATE SKILL ================= */

app.put('/employee-skills/:id', async (req, res) => {
  try {

    const { rating } = req.body;

    await pool.query(`
      UPDATE employee_skills
      SET rating = $1
      WHERE id = $2
    `, [rating, req.params.id]);

    res.json({ message: 'Skill updated successfully' });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= DELETE SKILL ================= */

app.delete('/employee-skills/:id', async (req, res) => {
  try {

    await pool.query(`
      DELETE FROM employee_skills
      WHERE id = $1
    `, [req.params.id]);

    res.json({ message: 'Skill deleted successfully' });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= DELETE EMPLOYEE ================= */

app.delete('/employees/:id', async (req, res) => {
  try {

    await pool.query(
      'DELETE FROM employee_skills WHERE employee_id = $1',
      [req.params.id]
    );

    await pool.query(
      'DELETE FROM employees WHERE id = $1',
      [req.params.id]
    );

    res.json({ message: 'Employee deleted successfully' });

  } catch (error) {

    console.error(error);

    res.status(500).json({ message: 'Server error' });

  }
});

/* ================= AI ROBOT ASSISTANT ================= */

/* ----- AI CHAT ----- */

/* ================= AI CHAT ================= */

app.post("/ai-chat", async (req, res) => {

 try {

  const { question } = req.body;

  const aiIntent = await openai.chat.completions.create({

   model: "gpt-4o-mini",
   response_format: { type: "json_object" },

   messages: [
    {
     role: "system",
     content: `
You are a skill matrix assistant.

Return JSON only.

Possible query types:

employee_robots
robot_employees
employee_robot_applications
general

Examples:

Which robots are known by Nikhil
{ "type":"employee_robots","employee":"Nikhil" }

Who knows ABB robots
{ "type":"robot_employees","robot":"ABB" }

Which application does Nikhil know in Kawasaki robot
{ "type":"employee_robot_applications","employee":"Nikhil","robot":"Kawasaki" }

If unrelated:
{ "type":"general" }
`
    },
    {
     role: "user",
     content: question
    }
   ]

  });

  const intent = JSON.parse(aiIntent.choices[0].message.content);

  /* employee → robots */

  if (intent.type === "employee_robots") {

   const result = await pool.query(`
    SELECT r.name
    FROM employee_skills es
    JOIN robots r ON es.robot_id = r.id
    JOIN employees e ON es.employee_id = e.id
    WHERE LOWER(e.name) = LOWER($1)
   `,[intent.employee]);

   const robots = result.rows.map(r => r.name).join(", ");

   return res.json({
    reply: `${intent.employee} knows the following robots: ${robots}`
   });

  }

  /* robot → employees */

  if (intent.type === "robot_employees") {

   const result = await pool.query(`
    SELECT e.name
    FROM employee_skills es
    JOIN robots r ON es.robot_id = r.id
    JOIN employees e ON es.employee_id = e.id
    WHERE LOWER(r.name) = LOWER($1)
   `,[intent.robot]);

   const employees = result.rows.map(e => e.name).join(", ");

   return res.json({
    reply: `Employees who know ${intent.robot}: ${employees}`
   });

  }

  /* employee + robot → applications */

  if (intent.type === "employee_robot_applications") {

   const result = await pool.query(`
    SELECT a.name
    FROM employee_skills es
    JOIN robots r ON es.robot_id = r.id
    JOIN applications a ON es.application_id = a.id
    JOIN employees e ON es.employee_id = e.id
    WHERE LOWER(e.name) = LOWER($1)
    AND LOWER(r.name) = LOWER($2)
   `,[intent.employee, intent.robot]);

   const apps = result.rows.map(a => a.name).join(", ");

   return res.json({
    reply: `${intent.employee} knows these ${intent.robot} applications: ${apps}`
   });

  }

  /* fallback AI */

  const response = await openai.chat.completions.create({

   model: "gpt-4o-mini",

   messages: [
    {
     role: "system",
     content:
      "You are a helpful AI assistant. You can answer general questions on any topic. However, if the question is related to industrial robots, provide accurate and detailed answers specifically for FANUC, ABB, Kawasaki, and Yaskawa robots. Always identify the robot brand mentioned and use the correct terminology for that brand."
    },
    {
     role: "user",
     content: question
    }
   ]

  });

  res.json({
   reply: response.choices[0].message.content
  });

 } catch (error) {

  console.error(error);

  res.status(500).json({
   message: "AI server error"
  });

 }

});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});