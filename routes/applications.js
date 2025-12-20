const express = require('express');
const pool = require('../db');
const authAdmin = require('../middleware/authAdmin');

const router = express.Router();

/* Public */
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM applications ORDER BY name');
  res.json(result.rows);
});

/* Admin only */
router.post('/', authAdmin, async (req, res) => {
  const { name } = req.body;
  const result = await pool.query(
    'INSERT INTO applications (name) VALUES ($1) RETURNING *',
    [name]
  );
  res.json(result.rows[0]);
});

module.exports = router;
