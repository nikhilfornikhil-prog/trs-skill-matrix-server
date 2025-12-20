const express = require('express');
const router = express.Router();
const pool = require('../db');

/**
 * GET /filters
 * Returns robots, applications, ratings
 * Used to populate filter dropdowns
 */
router.get('/', async (req, res) => {
  try {
    const robots = await pool.query(
      'SELECT id, name FROM robots ORDER BY name'
    );

    const applications = await pool.query(`
      SELECT a.id, a.name, r.name AS robot
      FROM applications a
      JOIN robots r ON r.id = a.robot_id
      ORDER BY r.name, a.name
    `);

    res.json({
      robots: robots.rows,
      applications: applications.rows,
      ratings: [0, 1, 2, 3, 4]
    });
  } catch (err) {
    console.error('Error fetching filters:', err);
    res.status(500).json({ error: 'Failed to fetch filters' });
  }
});

/**
 * GET /filter
 * Exact-match filtering:
 * robot + application + rating
 */
router.get('/search', async (req, res) => {
  const { robot, application, rating } = req.query;

  try {
    const result = await pool.query(`
      SELECT DISTINCT
        e.id,
        e.name
      FROM employee_skills es
      JOIN employees e ON e.id = es.employee_id
      JOIN robots r ON r.id = es.robot_id
      JOIN applications a ON a.id = es.application_id
      WHERE
        ($1::text IS NULL OR r.name = $1)
        AND ($2::text IS NULL OR a.name = $2)
        AND ($3::int IS NULL OR es.rating = $3)
      ORDER BY e.name
    `, [
      robot || null,
      application || null,
      rating !== undefined ? Number(rating) : null
    ]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error filtering employees:', err);
    res.status(500).json({ error: 'Filter failed' });
  }
});

module.exports = router;
