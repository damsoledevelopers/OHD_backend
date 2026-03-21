const express = require('express');
const router = express.Router();
const {
  submitResponse,
  getCompanyResponses,
  getCompanyResponseSummary,
} = require('../controllers/responseController');
const { requireAdmin } = require('../middleware/auth');

router.post('/', submitResponse);
router.get('/companies/:companyId', requireAdmin, getCompanyResponses);
router.get('/companies/:companyId/summary', requireAdmin, getCompanyResponseSummary);

module.exports = router;

