const express = require('express');

const router = express.Router();

function trimBaseUrl(value) {
  const s = String(value || '').trim().replace(/\/$/, '');
  return s || null;
}

/**
 * Public config (no auth).
 * - publicAppBaseUrl: where participants open the Next app (/companies, /survey/start).
 * - questionPaperBaseUrl: public or shareable question-paper page URL (PUBLIC_SURVEY_BASE_URL).
 * surveyBaseUrl is a deprecated alias of publicAppBaseUrl for older frontends.
 */
router.get('/config', (req, res) => {
  const publicAppBaseUrl = trimBaseUrl(process.env.PUBLIC_APP_BASE_URL);
  const questionPaperBaseUrl = trimBaseUrl(process.env.PUBLIC_SURVEY_BASE_URL);
  res.json({
    publicAppBaseUrl,
    questionPaperBaseUrl,
    surveyBaseUrl: publicAppBaseUrl,
  });
});

module.exports = router;
