const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { sendBulk, sendCompanyFormLink, getLogs } = require('../controllers/mailController');

router.post('/bulk', requireAdmin, sendBulk);
router.post('/company-form', requireAdmin, sendCompanyFormLink);
router.get('/logs', requireAdmin, getLogs);

module.exports = router;

