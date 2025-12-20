const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /search?q=term
 * Smart search:
 * - employee name
 * - robot name
 * - application name
 */
router.get('/', async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json({ type: 'empty', results: [] });
  }

  try {
    // 1️⃣ Search employees
    const employees = await pool.query(`
      SELECT id, name
      FROM employees
      WHERE name ILIKE $1
      ORDER BY name
    `, [`%${q}%`]);

    if (employees.rows.length > 0) {
      return res.json({
        type: 'employee',
        results: employees.rows
      });
    }

    // 2️⃣ Search applications / robots
    const apps = await pool.query(`
      SELECT
        r.name AS robot,
        a.name AS application,
        e.name AS employee,
        es.rating
      FROM employee_skills es
      JOIN employees e ON e.id = es.employee_id
      JOIN robots r ON r.id = es.robot_id
      JOIN applications a ON a.id = es.application_id
      WHERE
        a.name ILIKE $1
        OR r.name ILIKE $1
      ORDER BY r.name, a.name, e.name
    `, [`%${q}%`]);

    if (apps.rows.length > 0) {
      return res.json({
        type: 'application',
        results: apps.rows
      });
    }

    // 3️⃣ Nothing found
    res.json({
      type: 'none',
      results: []
    });

  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;
