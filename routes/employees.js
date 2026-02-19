const express = require('express');
const router = express.Router();

// TEMP DEBUG ROUTE - shows which DB is being used
router.get('/', async (req, res) => {
  try {
    return res.json({
      db_used: process.env.DATABASE_URL
    });
  } catch (err) {
    console.error('Debug route error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
