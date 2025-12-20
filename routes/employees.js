const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /employees
 * COLLAPSED VIEW
 * Returns list of employees with robot count
 */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.id,
        e.name,
        COUNT(DISTINCT es.robot_id) AS robot_count
      FROM employees e
      LEFT JOIN employee_skills es
        ON es.employee_id = e.id
      GROUP BY e.id
      ORDER BY e.name;
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/**
 * GET /employees/:id
 * EXPANDED VIEW
 * Returns robots -> applications -> ratings for one employee
 */
router.get('/:id', async (req, res) => {
  const employeeId = req.params.id;

  try {
    const result = await pool.query(`
      SELECT
        r.name AS robot,
        a.name AS application,
        es.rating
      FROM employee_skills es
      JOIN robots r
        ON r.id = es.robot_id
      JOIN applications a
        ON a.id = es.application_id
      WHERE es.employee_id = $1
      ORDER BY r.name, a.name;
    `, [employeeId]);

    // Convert flat rows into grouped structure
    const groupedData = {};

    result.rows.forEach(row => {
      if (!groupedData[row.robot]) {
        groupedData[row.robot] = [];
      }

      groupedData[row.robot].push({
        application: row.application,
        rating: row.rating
      });
    });

    res.json(groupedData);
  } catch (err) {
    console.error('Error fetching employee details:', err);
    res.status(500).json({ error: 'Failed to fetch employee details' });
  }
});

module.exports = router;
