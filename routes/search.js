const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /search?q=term
 * PRIORITY:
 * 1. Application / Robot search (grouped results)
 * 2. Employee name search
 */
router.get('/', async (req, res) => {
  const q = req.query.q;

  if (!q) {
    return res.json({ type: 'empty', results: [] });
  }

  try {
    // 1️⃣ APPLICATION / ROBOT SEARCH (FIRST PRIORITY)
    const appResult = await pool.query(`
      SELECT
        r.name AS robot,
        a.name AS application,
        e.id AS employee_id,
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

    if (appResult.rows.length > 0) {
      return res.json({
        type: 'application',
        results: appResult.rows
      });
    }

    // 2️⃣ EMPLOYEE NAME SEARCH (ONLY IF NO APP MATCH)
    const employeeResult = await pool.query(`
      SELECT id, name
      FROM employees
      WHERE name ILIKE $1
      ORDER BY name
    `, [`%${q}%`]);

    if (employeeResult.rows.length > 0) {
      return res.json({
        type: 'employee',
        results: employeeResult.rows
      });
    }

    // 3️⃣ NOTHING FOUND
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
