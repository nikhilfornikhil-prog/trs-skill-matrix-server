const express = require('express');
const pool = require('../db');
const authAdmin = require('../middleware/authAdmin');

const router = express.Router();

/* Public */
router.get('/', async (req, res) => {
  const { application_id } = req.query;

  let query = `
    SELECT e.*, a.name AS application_name
    FROM employees e
    JOIN applications a ON e.application_id = a.id
  `;
  let params = [];

  if (application_id) {
    query += ' WHERE application_id = $1';
    params.push(application_id);
  }

  const result = await pool.query(query, params);
  res.json(result.rows);
});

/* Admin only */
router.post('/', authAdmin, async (req, res) => {
  const { name, employee_code, application_id, skill_level } = req.body;

  const result = await pool.query(
    `INSERT INTO employees
     (name, employee_code, application_id, skill_level)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [name, employee_code, application_id, skill_level]
  );

  res.json(result.rows[0]);
});

router.put('/:id', authAdmin, async (req, res) => {
  const { skill_level } = req.body;

  const result = await pool.query(
    'UPDATE employees SET skill_level=$1 WHERE id=$2 RETURNING *',
    [skill_level, req.params.id]
  );

  res.json(result.rows[0]);
});

module.exports = router;
