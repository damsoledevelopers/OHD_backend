const connectDB = require('../config/database');
const {
  calculateOverallStats,
  calculateSectionStats,
  buildFallbackSectionStats,
  getPublishedQuestionPaper,
  getAllSections,
  calculateOverallStatsWithSectionStats,
} = require('../utils/calculations');

// Simple in-memory cache for expensive diagnostic computations.
// This is especially important because `/api/reports/overall` is called
// immediately when the report page opens.
const overallReportCache = new Map();
const OVERALL_REPORT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getOverallCacheKey(params) {
  const { companyId, department, employeeEmail, sectionId, pillarId } = params;
  return [
    'overall',
    companyId || '',
    department || '',
    employeeEmail || '',
    sectionId || '',
    pillarId || '',
  ].join('|');
}

function sectionIdsForPillar(questionPaper, pillarId) {
  if (!questionPaper || !pillarId || !Array.isArray(questionPaper.pillars)) return [];
  const pillar = questionPaper.pillars.find(
    (p) => p._id && p._id.toString() === String(pillarId)
  );
  if (!pillar || !Array.isArray(pillar.sections)) return [];
  return pillar.sections.map((s) => s._id.toString());
}

function sectionStatsHasAnyResponses(sectionStats) {
  if (!Array.isArray(sectionStats)) return false;
  return sectionStats.some((s) =>
    (s.questionStats || []).some((q) => (q.totalResponses || 0) > 0)
  );
}

async function getCompanyReport(req, res) {
  try {
    await connectDB();

    const { department, employeeEmail, sectionId, pillarId } = req.query;
    const companyId = req.params.companyId;
    const filters = {};
    if (department) filters.department = String(department).trim();
    if (employeeEmail) filters.employeeEmail = String(employeeEmail).trim().toLowerCase();

    const questionPaper = await getPublishedQuestionPaper();
    let restrictedSectionIds = null;

    if (sectionId) {
      restrictedSectionIds = [String(sectionId)];
    } else if (pillarId) {
      restrictedSectionIds = sectionIdsForPillar(questionPaper, pillarId);
      if (restrictedSectionIds.length === 0) {
        restrictedSectionIds = null;
      }
    }

    const sectionsWithPillars = getAllSections(questionPaper);

    let toIterate = sectionsWithPillars;
    if (restrictedSectionIds && restrictedSectionIds.length) {
      toIterate = sectionsWithPillars.filter(({ section }) =>
        restrictedSectionIds.includes(section._id.toString())
      );
    }

    const { overallStats, sectionStats: computedSectionStats } =
      await calculateOverallStatsWithSectionStats(companyId, filters, restrictedSectionIds);

    let sectionStats =
      toIterate.length === 0 ? await buildFallbackSectionStats(companyId, filters, restrictedSectionIds) : computedSectionStats;

    if (
      toIterate.length > 0 &&
      (overallStats.totalResponses || 0) > 0 &&
      !sectionStatsHasAnyResponses(sectionStats)
    ) {
      sectionStats = await buildFallbackSectionStats(companyId, filters, restrictedSectionIds);
    }

    return res.json({
      companyId,
      overallStats,
      sectionStats,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate company report' });
  }
}

async function getSectionReport(req, res) {
  try {
    await connectDB();

    const { companyId, department, employeeEmail } = req.query;
    const filters = {};
    if (department) filters.department = String(department).trim();
    if (employeeEmail) filters.employeeEmail = String(employeeEmail).trim().toLowerCase();

    const sectionStats = await calculateSectionStats(
      req.params.sectionId,
      companyId || undefined,
      filters
    );

    return res.json({
      sectionStats,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate section report' });
  }
}

async function getOverallReport(req, res) {
  try {
    const { companyId, department, employeeEmail, sectionId, pillarId } = req.query;
    const filters = {};
    if (department) filters.department = String(department).trim();
    if (employeeEmail) filters.employeeEmail = String(employeeEmail).trim().toLowerCase();

    const cacheKey = getOverallCacheKey({
      companyId: companyId ? String(companyId) : '',
      department: filters.department || '',
      employeeEmail: filters.employeeEmail || '',
      sectionId: sectionId ? String(sectionId) : '',
      pillarId: pillarId ? String(pillarId) : '',
    });

    const cached = overallReportCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json(cached.data);
    }

    await connectDB();

    const questionPaper = await getPublishedQuestionPaper();
    const sectionsWithPillars = getAllSections(questionPaper);

    let restrictedSectionIds = null;
    if (sectionId) {
      restrictedSectionIds = [String(sectionId)];
    } else if (pillarId) {
      restrictedSectionIds = sectionIdsForPillar(questionPaper, pillarId);
      if (restrictedSectionIds.length === 0) restrictedSectionIds = null;
    }

    const { overallStats, sectionStats: computedSectionStats } =
      await calculateOverallStatsWithSectionStats(companyId || undefined, filters, restrictedSectionIds);

    let toIterate = sectionsWithPillars;
    if (restrictedSectionIds && restrictedSectionIds.length) {
      toIterate = sectionsWithPillars.filter(({ section }) =>
        restrictedSectionIds.includes(section._id.toString())
      );
    }

    let sectionStats =
      toIterate.length === 0
        ? await buildFallbackSectionStats(companyId || undefined, filters, restrictedSectionIds)
        : computedSectionStats;

    if (
      toIterate.length > 0 &&
      (overallStats.totalResponses || 0) > 0 &&
      !sectionStatsHasAnyResponses(sectionStats)
    ) {
      sectionStats = await buildFallbackSectionStats(
        companyId || undefined,
        filters,
        restrictedSectionIds
      );
    }

    const payload = { overallStats, sectionStats };

    // Best-effort cache store (avoid growing unbounded).
    overallReportCache.set(cacheKey, { expiresAt: Date.now() + OVERALL_REPORT_CACHE_TTL_MS, data: payload });
    if (overallReportCache.size > 500) overallReportCache.clear();

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate overall report' });
  }
}

module.exports = {
  getCompanyReport,
  getSectionReport,
  getOverallReport,
};
