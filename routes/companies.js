const express = require('express');
const router = express.Router();
const {
  getCompanies,
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  publicCreateCompany,
  getCompanyEmails,
  getPublicCompanyById,
  getCompaniesWithSurvey,
} = require('../controllers/companyController');
const { sendCompanyFormLink } = require('../controllers/mailController');
const { requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Public endpoints must be registered BEFORE parameterized admin routes
// so that `/public/:id` does not get captured by `/:id`.
router.post('/public', upload.single('excelFile'), publicCreateCompany);
// Public read-only endpoint used by the survey page so that
// employees do not need admin authentication just to see the
// company name on the survey screen.
router.get('/public/:id', getPublicCompanyById);

// Admin-protected endpoints
router.get('/', requireAdmin, getCompanies);
router.get('/with-survey', requireAdmin, getCompaniesWithSurvey);
router.post('/', requireAdmin, upload.single('excelFile'), createCompany);
// Admin emails the public company registration URL to an external contact (same handler as POST /api/mail/company-form).
router.post('/share-registration-link', requireAdmin, sendCompanyFormLink);
router.get('/:id', requireAdmin, getCompanyById);
router.get('/:id/emails', requireAdmin, getCompanyEmails);
router.put('/:id', requireAdmin, upload.single('excelFile'), updateCompany);
router.delete('/:id', requireAdmin, deleteCompany);

module.exports = router;

