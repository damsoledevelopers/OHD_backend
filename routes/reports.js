const express = require('express');
const router = express.Router();
const { getCompanyReport, getSectionReport, getOverallReport } = require('../controllers/reportController');
const { requireAdmin } = require('../middleware/auth');

router.get('/companies/:companyId', requireAdmin, getCompanyReport);
router.get('/sections/:sectionId', requireAdmin, getSectionReport);
router.get('/overall', requireAdmin, getOverallReport);

module.exports = router;

