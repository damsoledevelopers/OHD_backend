const express = require('express');
const router = express.Router();
const {
  startExam,
  submitResponse,
  getCompanyResponses,
  getCompanyResponseSummary,
  backfillMissingResponseEmails,
  getAllResponses,
} = require('../controllers/responseController');
const { requireAdmin } = require('../middleware/auth');

router.post('/start', startExam);
router.post('/', submitResponse);
router.get('/all', requireAdmin, getAllResponses);
router.get('/companies/:companyId', requireAdmin, getCompanyResponses);
router.get('/companies/:companyId/summary', requireAdmin, getCompanyResponseSummary);
router.post('/companies/:companyId/backfill-emails', requireAdmin, backfillMissingResponseEmails);

module.exports = router;

