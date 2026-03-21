const connectDB = require('../config/database');
const {
  calculateOverallStats,
  calculateSectionStats,
  buildFallbackSectionStats,
  getPublishedQuestionPaper,
  getAllSections,
} = require('../utils/calculations');

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

    const overallStats = await calculateOverallStats(companyId, filters, restrictedSectionIds);
    const sectionsWithPillars = getAllSections(questionPaper);

    let toIterate = sectionsWithPillars;
    if (restrictedSectionIds && restrictedSectionIds.length) {
      toIterate = sectionsWithPillars.filter(({ section }) =>
        restrictedSectionIds.includes(section._id.toString())
      );
    }

    let sectionStats =
      toIterate.length === 0
        ? await buildFallbackSectionStats(companyId, filters, restrictedSectionIds)
        : await Promise.all(
            toIterate.map(({ section }) =>
              calculateSectionStats(section._id.toString(), companyId, filters)
            )
          );

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
    await connectDB();

    const { companyId, department, employeeEmail, sectionId, pillarId } = req.query;
    const filters = {};
    if (department) filters.department = String(department).trim();
    if (employeeEmail) filters.employeeEmail = String(employeeEmail).trim().toLowerCase();

    const questionPaper = await getPublishedQuestionPaper();
    const sectionsWithPillars = getAllSections(questionPaper);

    let restrictedSectionIds = null;
    if (sectionId) {
      restrictedSectionIds = [String(sectionId)];
    } else if (pillarId) {
      restrictedSectionIds = sectionIdsForPillar(questionPaper, pillarId);
      if (restrictedSectionIds.length === 0) restrictedSectionIds = null;
    }

    const overallStats = await calculateOverallStats(
      companyId || undefined,
      filters,
      restrictedSectionIds
    );

    let toIterate = sectionsWithPillars;
    if (restrictedSectionIds && restrictedSectionIds.length) {
      toIterate = sectionsWithPillars.filter(({ section }) =>
        restrictedSectionIds.includes(section._id.toString())
      );
    }

    let sectionStats =
      toIterate.length === 0
        ? await buildFallbackSectionStats(companyId || undefined, filters, restrictedSectionIds)
        : await Promise.all(
            toIterate.map(({ section }) =>
              calculateSectionStats(section._id.toString(), companyId || undefined, filters)
            )
          );

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

    return res.json({
      overallStats,
      sectionStats,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate overall report' });
  }
}

module.exports = {
  getCompanyReport,
  getSectionReport,
  getOverallReport,
};
