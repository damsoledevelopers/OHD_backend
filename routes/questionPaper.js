const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const {
  getDraft,
  updateDraft,
  publish,
  getPublished,
} = require('../controllers/questionPaperController');

// Admin draft endpoints
// Support both `/api/question-paper` and `/api/question-paper/draft`
// so older frontend code continues to work.
router.get('/', requireAdmin, getDraft);
router.put('/', requireAdmin, updateDraft);
router.get('/draft', requireAdmin, getDraft);
router.put('/draft', requireAdmin, updateDraft);
router.post('/publish', requireAdmin, publish);

// Public endpoint for survey to fetch published structure
router.get('/published', getPublished);

module.exports = router;

