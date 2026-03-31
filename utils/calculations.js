const mongoose = require('mongoose');
const EmployeeResponse = require('../models/EmployeeResponse');
const QuestionPaper = require('../models/QuestionPaper');

async function getPublishedQuestionPaper() {
  const paper = await QuestionPaper.getOrCreateDefault();
  if (paper.published && Array.isArray(paper.published.pillars) && paper.published.pillars.length > 0) {
    return paper.published;
  }
  return paper.draft || { pillars: [] };
}

function findQuestionById(questionPaper, questionId) {
  if (!questionPaper || !Array.isArray(questionPaper.pillars)) return {};

  for (const pillar of questionPaper.pillars) {
    if (!pillar.sections) continue;
    for (const section of pillar.sections) {
      if (!section.questions) continue;
      const question = section.questions.id
        ? section.questions.id(questionId)
        : section.questions.find(q => q._id && q._id.toString() === questionId.toString());
      if (question) {
        return { question, section, pillar };
      }
    }
  }

  return {};
}

function findSectionById(questionPaper, sectionId) {
  if (!questionPaper || !Array.isArray(questionPaper.pillars)) return {};

  for (const pillar of questionPaper.pillars) {
    if (!pillar.sections) continue;
    const section = pillar.sections.id
      ? pillar.sections.id(sectionId)
      : pillar.sections.find(s => s._id && s._id.toString() === sectionId.toString());
    if (section) {
      return { section, pillar };
    }
  }

  return {};
}

function getAllSections(questionPaper) {
  const result = [];
  if (!questionPaper || !Array.isArray(questionPaper.pillars)) return result;

  for (const pillar of questionPaper.pillars) {
    if (!pillar.sections) continue;
    for (const section of pillar.sections) {
      result.push({ section, pillar });
    }
  }

  result.sort((a, b) => {
    const ao = typeof a.section.order === 'number' ? a.section.order : 0;
    const bo = typeof b.section.order === 'number' ? b.section.order : 0;
    return ao - bo;
  });

  return result;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string|undefined} companyId
 * @param {{ department?: string, employeeEmail?: string }} filters
 */
function buildResponseMatch(companyId, filters = {}) {
  const q = {};
  if (companyId) {
    q.companyId = mongoose.Types.ObjectId.isValid(companyId)
      ? new mongoose.Types.ObjectId(companyId)
      : companyId;
  }
  if (filters.department && String(filters.department).trim()) {
    const d = String(filters.department).trim();
    q.department = new RegExp(`^${escapeRegex(d)}$`, 'i');
  }
  if (filters.employeeEmail && String(filters.employeeEmail).trim()) {
    q.employeeEmail = String(filters.employeeEmail).trim().toLowerCase();
  }
  return q;
}

async function questionIdsForSections(sectionIds) {
  if (!sectionIds || sectionIds.length === 0) return null;
  const qp = await getPublishedQuestionPaper();
  const set = new Set();
  for (const sid of sectionIds) {
    const { section } = findSectionById(qp, sid);
    if (section && Array.isArray(section.questions)) {
      for (const q of section.questions) {
        if (q._id) set.add(q._id.toString());
      }
    }
  }
  return set.size ? set : null;
}

function makeEmptyRatingCount() {
  return { A: 0, B: 0, C: 0, D: 0, E: 0 };
}
const VALID_RATINGS = new Set(['A', 'B', 'C', 'D', 'E']);

function getOriBenchmark(overallPercentage) {
  if (overallPercentage >= 90) {
    return {
      band: '90-100',
      healthStatus: 'Operationally Secure & Governance Mature',
      colorCode: 'Green',
      colorHex: '#10b981',
      minScore: 90,
    };
  }
  if (overallPercentage >= 80) {
    return {
      band: '80-89.9',
      healthStatus: 'Stable - Continuous Monitoring Required',
      colorCode: 'Blue',
      colorHex: '#3b82f6',
      minScore: 80,
    };
  }
  if (overallPercentage >= 70) {
    return {
      band: '70-79.9',
      healthStatus: 'Structural Stability Weakening - Corrective Action Required',
      colorCode: 'Yellow',
      colorHex: '#eab308',
      minScore: 70,
    };
  }
  if (overallPercentage >= 60) {
    return {
      band: '60-69.9',
      healthStatus: 'High Risk Operational Zone - War Room Activation Required',
      colorCode: 'Orange',
      colorHex: '#f97316',
      minScore: 60,
    };
  }
  return {
    band: 'Below 60',
    healthStatus: 'SOS - Critical Organizational Distress',
    colorCode: 'Red',
    colorHex: '#ef4444',
    minScore: 0,
  };
}

function toQuestionId(value) {
  if (!value) return '';
  return value.toString();
}

function collectQuestionAggregates(responses, allowedQ = null) {
  const byQuestion = new Map();
  let scopedResponseCount = 0;

  responses.forEach((response) => {
    const responseId = toQuestionId(response._id);
    const seenInResponse = new Set();
    let contributed = false;

    response.answers.forEach((answer) => {
      const qid = toQuestionId(answer.questionId);
      if (!qid) return;
      if (allowedQ && !allowedQ.has(qid)) return;
      if (!VALID_RATINGS.has(answer.rating)) return;
      if (seenInResponse.has(qid)) return;
      seenInResponse.add(qid);

      if (!byQuestion.has(qid)) {
        byQuestion.set(qid, {
          ratingCount: makeEmptyRatingCount(),
          responders: new Set(),
        });
      }

      const entry = byQuestion.get(qid);
      entry.ratingCount[answer.rating] += 1;
      entry.responders.add(responseId);
      contributed = true;
    });

    if (contributed) scopedResponseCount += 1;
  });

  return { byQuestion, scopedResponseCount };
}

function buildQuestionStatsFromAggregate(sectionQuestions, aggregateByQuestion) {
  const questionStats = [];

  sectionQuestions.forEach((question) => {
    const qid = toQuestionId(question._id);
    const entry = aggregateByQuestion.get(qid);
    const ratingCount = entry ? entry.ratingCount : makeEmptyRatingCount();
    const total = entry ? entry.responders.size : 0;
    const ratingPercentage = {
      A: total > 0 ? (ratingCount.A / total) * 100 : 0,
      B: total > 0 ? (ratingCount.B / total) * 100 : 0,
      C: total > 0 ? (ratingCount.C / total) * 100 : 0,
      D: total > 0 ? (ratingCount.D / total) * 100 : 0,
      E: total > 0 ? (ratingCount.E / total) * 100 : 0,
    };

    questionStats.push({
      questionId: qid,
      questionText: question && question.text ? question.text : '',
      ratingCount,
      ratingPercentage,
      totalResponses: total,
    });
  });

  return questionStats;
}

function computeSectionSummary(questionStats, sectionQuestions, aggregateByQuestion) {
  let totalScore = 0;
  let totalMaxScore = 0;
  const sectionResponders = new Set();

  questionStats.forEach((qStats) => {
    const qTotal = qStats.totalResponses;
    if (qTotal > 0) {
      const weightedScore =
        qStats.ratingCount.A * 5 +
        qStats.ratingCount.B * 4 +
        qStats.ratingCount.C * 3 +
        qStats.ratingCount.D * 2 +
        qStats.ratingCount.E * 1;
      totalScore += weightedScore;
      totalMaxScore += qTotal * 5;
    }
  });

  sectionQuestions.forEach((question) => {
    const qid = toQuestionId(question._id);
    const entry = aggregateByQuestion.get(qid);
    if (!entry) return;
    entry.responders.forEach((id) => sectionResponders.add(id));
  });

  return {
    sectionPercentage: totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0,
    totalResponses: sectionResponders.size,
  };
}

async function calculateQuestionStats(questionId, companyId, filters = {}) {
  const questionPaper = await getPublishedQuestionPaper();
  const { question } = findQuestionById(questionPaper, questionId);

  const query = {
    ...buildResponseMatch(companyId, filters),
    'answers.questionId': questionId,
  };
  const responses = await EmployeeResponse.find(query);
  const ratingCount = { A: 0, B: 0, C: 0, D: 0, E: 0 };

  responses.forEach(response => {
    const answer = response.answers.find(a => a.questionId.toString() === questionId.toString());
    if (answer && ratingCount.hasOwnProperty(answer.rating)) {
      ratingCount[answer.rating]++;
    }
  });

  const total = responses.length;
  const ratingPercentage = {
    A: total > 0 ? (ratingCount.A / total) * 100 : 0,
    B: total > 0 ? (ratingCount.B / total) * 100 : 0,
    C: total > 0 ? (ratingCount.C / total) * 100 : 0,
    D: total > 0 ? (ratingCount.D / total) * 100 : 0,
    E: total > 0 ? (ratingCount.E / total) * 100 : 0,
  };

  return {
    questionId: questionId.toString(),
    questionText: question ? question.text : '',
    ratingCount,
    ratingPercentage,
    totalResponses: total,
  };
}

async function calculateSectionStats(sectionId, companyId, filters = {}) {
  const questionPaper = await getPublishedQuestionPaper();
  const { section } = findSectionById(questionPaper, sectionId);

  if (!section || !Array.isArray(section.questions)) {
    return {
      sectionId: sectionId.toString(),
      sectionName: section && section.name ? section.name : '',
      questionStats: [],
      sectionPercentage: 0,
      totalResponses: 0,
    };
  }

  const responses = await EmployeeResponse.find(buildResponseMatch(companyId, filters));
  const questions = [...section.questions].sort((a, b) => {
    const ao = typeof a.order === 'number' ? a.order : 0;
    const bo = typeof b.order === 'number' ? b.order : 0;
    return ao - bo;
  });
  const allowedQ = new Set(questions.map((q) => toQuestionId(q._id)));
  const { byQuestion } = collectQuestionAggregates(responses, allowedQ);
  const questionStats = buildQuestionStatsFromAggregate(questions, byQuestion);
  const { sectionPercentage, totalResponses } = computeSectionSummary(
    questionStats,
    questions,
    byQuestion
  );
  const sectionName = section && section.name ? section.name : '';

  return {
    sectionId: sectionId.toString(),
    sectionName,
    questionStats,
    sectionPercentage,
    totalResponses,
  };
}

/**
 * @param {string|undefined} companyId
 * @param {{ department?: string, employeeEmail?: string }} filters
 * @param {string[]|null} restrictedSectionIds — if set, only answers in these sections count
 */
/**
 * When the question paper has no pillar/section structure (or it is out of sync),
 * still build one aggregate section from distinct question IDs present in stored responses
 * so admin charts and exports are not empty for small or legacy datasets.
 *
 * @param {string|undefined} companyId
 * @param {{ department?: string, employeeEmail?: string }} filters
 * @param {string[]|null} restrictedSectionIds
 * @returns {Promise<Array<{ sectionId: string, sectionName: string, questionStats: any[], sectionPercentage: number, totalResponses: number }>>}
 */
async function buildFallbackSectionStats(companyId, filters = {}, restrictedSectionIds = null) {
  const match = buildResponseMatch(companyId, filters);
  const responses = await EmployeeResponse.find(match);
  const allowedQ = await questionIdsForSections(restrictedSectionIds);

  const idSet = new Set();
  responses.forEach((response) => {
    response.answers.forEach((answer) => {
      if (allowedQ && !allowedQ.has(answer.questionId.toString())) return;
      idSet.add(answer.questionId.toString());
    });
  });

  if (idSet.size === 0) return [];

  const questionStats = [];
  for (const qid of idSet) {
    questionStats.push(await calculateQuestionStats(qid, companyId, filters));
  }
  questionStats.sort((a, b) => {
    const ao = a.questionText || '';
    const bo = b.questionText || '';
    return ao.localeCompare(bo);
  });

  let totalScore = 0;
  let totalMaxScore = 0;
  questionStats.forEach((qStats) => {
    const qTotal = qStats.totalResponses;
    if (qTotal > 0) {
      const weightedScore =
        qStats.ratingCount.A * 5 +
        qStats.ratingCount.B * 4 +
        qStats.ratingCount.C * 3 +
        qStats.ratingCount.D * 2 +
        qStats.ratingCount.E * 1;
      totalScore += weightedScore;
      totalMaxScore += qTotal * 5;
    }
  });

  const sectionPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

  let totalResponses = 0;
  responses.forEach((r) => {
    const contributed = r.answers.some((a) => {
      if (allowedQ && !allowedQ.has(a.questionId.toString())) return false;
      return idSet.has(a.questionId.toString());
    });
    if (contributed) totalResponses += 1;
  });

  return [
    {
      sectionId: 'aggregated-responses',
      sectionName: 'Survey responses',
      questionStats,
      sectionPercentage,
      totalResponses,
    },
  ];
}

async function calculateOverallStats(companyId, filters = {}, restrictedSectionIds = null) {
  const match = buildResponseMatch(companyId, filters);
  const responses = await EmployeeResponse.find(match);
  const questionPaper = await getPublishedQuestionPaper();
  const sectionsWithPillars = getAllSections(questionPaper);

  const allowedQ = await questionIdsForSections(restrictedSectionIds);
  const { byQuestion, scopedResponseCount } = collectQuestionAggregates(responses, allowedQ);
  const ratingCount = makeEmptyRatingCount();
  byQuestion.forEach((entry) => {
    ratingCount.A += entry.ratingCount.A;
    ratingCount.B += entry.ratingCount.B;
    ratingCount.C += entry.ratingCount.C;
    ratingCount.D += entry.ratingCount.D;
    ratingCount.E += entry.ratingCount.E;
  });

  const totalRatings = Object.values(ratingCount).reduce((a, b) => a + b, 0);
  const ratingDistributionPercentage = {
    A: totalRatings > 0 ? (ratingCount.A / totalRatings) * 100 : 0,
    B: totalRatings > 0 ? (ratingCount.B / totalRatings) * 100 : 0,
    C: totalRatings > 0 ? (ratingCount.C / totalRatings) * 100 : 0,
    D: totalRatings > 0 ? (ratingCount.D / totalRatings) * 100 : 0,
    E: totalRatings > 0 ? (ratingCount.E / totalRatings) * 100 : 0,
  };

  let totalScore = 0;
  let totalMaxScore = 0;

  byQuestion.forEach((entry) => {
    totalScore +=
      entry.ratingCount.A * 5 +
      entry.ratingCount.B * 4 +
      entry.ratingCount.C * 3 +
      entry.ratingCount.D * 2 +
      entry.ratingCount.E * 1;
    totalMaxScore +=
      (entry.ratingCount.A +
        entry.ratingCount.B +
        entry.ratingCount.C +
        entry.ratingCount.D +
        entry.ratingCount.E) *
      5;
  });

  const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

  const sectionsToScore = restrictedSectionIds && restrictedSectionIds.length
    ? sectionsWithPillars.filter(({ section }) =>
        restrictedSectionIds.includes(section._id.toString())
      )
    : sectionsWithPillars;

  let bestSection = null;
  let bestPercentage = 0;

  for (const { section } of sectionsToScore) {
    const sectionQuestions = Array.isArray(section.questions)
      ? [...section.questions].sort((a, b) => {
          const ao = typeof a.order === 'number' ? a.order : 0;
          const bo = typeof b.order === 'number' ? b.order : 0;
          return ao - bo;
        })
      : [];
    const questionStats = buildQuestionStatsFromAggregate(sectionQuestions, byQuestion);
    const { sectionPercentage } = computeSectionSummary(
      questionStats,
      sectionQuestions,
      byQuestion
    );
    if (sectionPercentage > bestPercentage) {
      bestPercentage = sectionPercentage;
      bestSection = {
        sectionId: section._id.toString(),
        sectionName: section.name,
        percentage: sectionPercentage,
      };
    }
  }

  const summaryInsights = [];
  const benchmark = getOriBenchmark(overallPercentage);
  summaryInsights.push(`ORI Benchmark: ${benchmark.healthStatus} (${benchmark.colorCode})`);

  const uniqueCompanies = companyId
    ? 1
    : new Set(responses.map(r => r.companyId.toString())).size;

  return {
    overallPercentage,
    ratingDistribution: ratingCount,
    ratingDistributionPercentage,
    bestSection,
    totalResponses: scopedResponseCount,
    totalCompanies: uniqueCompanies,
    summaryInsights,
    benchmark,
  };
}

/**
 * Like `calculateOverallStats`, but also derives per-section stats from the same
 * loaded `responses` dataset (no repeated EmployeeResponse.find calls).
 *
 * @param {string|undefined} companyId
 * @param {{ department?: string, employeeEmail?: string }} filters
 * @param {string[]|null} restrictedSectionIds
 * @returns {Promise<{ overallStats: any, sectionStats: any[] }>}
 */
async function calculateOverallStatsWithSectionStats(companyId, filters = {}, restrictedSectionIds = null) {
  const match = buildResponseMatch(companyId, filters);

  // Pull only what we need and use lean objects for speed/memory.
  const responses = await EmployeeResponse.find(match)
    .select('_id companyId answers')
    .lean();

  const questionPaper = await getPublishedQuestionPaper();
  const sectionsWithPillars = getAllSections(questionPaper);

  // Per-section stats scope (what the UI expects for the current filters).
  const sectionsToScore =
    restrictedSectionIds && restrictedSectionIds.length
      ? sectionsWithPillars.filter(({ section }) => restrictedSectionIds.includes(section._id.toString()))
      : sectionsWithPillars;

  const allowedSectionIdSet = new Set(sectionsToScore.map(({ section }) => section._id.toString()));

  // Unique section IDs (used for fast per-response "touched" tracking without Set allocations).
  const sectionIds = [];
  const sectionIdToIndex = new Map();
  for (const { section } of sectionsToScore) {
    if (!section || !section._id) continue;
    const sid = section._id.toString();
    if (!sectionIdToIndex.has(sid)) {
      sectionIdToIndex.set(sid, sectionIds.length);
      sectionIds.push(sid);
    }
  }
  const touchedSectionFlags = new Int32Array(sectionIds.length);
  let visitToken = 1;
  const touchedSectionIndices = [];

  // Build allowed question IDs from the provided restricted sections (if any).
  // If question IDs can't be resolved from question paper, we fall back to "no restriction".
  // This keeps the behavior aligned with the old code's fallbacks.
  let allowedQ = null;
  if (restrictedSectionIds && restrictedSectionIds.length) {
    const idSet = new Set();
    for (const { section } of sectionsToScore) {
      if (!section || !Array.isArray(section.questions)) continue;
      for (const q of section.questions) {
        if (q && q._id) idSet.add(q._id.toString());
      }
    }
    allowedQ = idSet.size ? idSet : null;
  }

  // Map questionId -> sectionId only for the sections we will score.
  // This is used to compute per-section response counts without storing responder IDs.
  const questionIdToSectionId = new Map();
  for (const { section } of sectionsToScore) {
    if (!section || !Array.isArray(section.questions)) continue;
    const sid = section._id.toString();
    if (!allowedSectionIdSet.has(sid)) continue;
    for (const q of section.questions) {
      if (!q || !q._id) continue;
      const qid = toQuestionId(q._id);
      if (!qid) continue;
      if (!questionIdToSectionId.has(qid)) questionIdToSectionId.set(qid, sid);
    }
  }

  // qid -> { ratingCount: {A..E}, totalResponses: number }
  const byQuestion = new Map();
  // sectionId -> unique response count that contributed at least one answer in that section
  const sectionRespondedCounts = new Map();

  let scopedResponseCount = 0; // number of responses that contributed at least one allowed question

  for (const response of responses) {
    let contributedAny = false;

    for (const answer of response.answers || []) {
      const qid = toQuestionId(answer.questionId);
      if (!qid) continue;
      if (allowedQ && !allowedQ.has(qid)) continue;
      if (!VALID_RATINGS.has(answer.rating)) continue;
      contributedAny = true;

      const entry = byQuestion.get(qid) || {
        ratingCount: makeEmptyRatingCount(),
        totalResponses: 0,
      };

      entry.ratingCount[answer.rating] += 1;
      entry.totalResponses += 1;
      byQuestion.set(qid, entry);

      const sid = questionIdToSectionId.get(qid);
      if (sid) {
        const idx = sectionIdToIndex.get(sid);
        if (idx !== undefined) {
          // Mark that this response touched the section (unique per response).
          if (touchedSectionFlags[idx] !== visitToken) {
            touchedSectionFlags[idx] = visitToken;
            touchedSectionIndices.push(idx);
          }
        }
      }
    }

    if (contributedAny) scopedResponseCount += 1;
    for (const idx of touchedSectionIndices) {
      const sid = sectionIds[idx];
      sectionRespondedCounts.set(sid, (sectionRespondedCounts.get(sid) || 0) + 1);
    }

    touchedSectionIndices.length = 0;
    visitToken += 1;
    if (visitToken === 2147483647) {
      // Prevent Int32 overflow; reset flags.
      touchedSectionFlags.fill(0);
      visitToken = 1;
    }
  }

  // Overall rating distribution
  const ratingCount = makeEmptyRatingCount();
  byQuestion.forEach((entry) => {
    ratingCount.A += entry.ratingCount.A;
    ratingCount.B += entry.ratingCount.B;
    ratingCount.C += entry.ratingCount.C;
    ratingCount.D += entry.ratingCount.D;
    ratingCount.E += entry.ratingCount.E;
  });

  const totalRatings = Object.values(ratingCount).reduce((a, b) => a + b, 0);
  const ratingDistributionPercentage = {
    A: totalRatings > 0 ? (ratingCount.A / totalRatings) * 100 : 0,
    B: totalRatings > 0 ? (ratingCount.B / totalRatings) * 100 : 0,
    C: totalRatings > 0 ? (ratingCount.C / totalRatings) * 100 : 0,
    D: totalRatings > 0 ? (ratingCount.D / totalRatings) * 100 : 0,
    E: totalRatings > 0 ? (ratingCount.E / totalRatings) * 100 : 0,
  };

  // Overall percentage (weighted score)
  let totalScore = 0;
  let totalMaxScore = 0;
  byQuestion.forEach((entry) => {
    totalScore +=
      entry.ratingCount.A * 5 +
      entry.ratingCount.B * 4 +
      entry.ratingCount.C * 3 +
      entry.ratingCount.D * 2 +
      entry.ratingCount.E * 1;
    totalMaxScore +=
      (entry.ratingCount.A + entry.ratingCount.B + entry.ratingCount.C + entry.ratingCount.D + entry.ratingCount.E) * 5;
  });

  const overallPercentage = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;

  const benchmark = getOriBenchmark(overallPercentage);
  const summaryInsights = [];
  summaryInsights.push(`ORI Benchmark: ${benchmark.healthStatus} (${benchmark.colorCode})`);

  const uniqueCompanies = companyId ? 1 : new Set(responses.map((r) => r.companyId?.toString?.() || String(r.companyId))).size;

  const overallStats = {
    overallPercentage,
    ratingDistribution: ratingCount,
    ratingDistributionPercentage,
    bestSection: null,
    totalResponses: scopedResponseCount,
    totalCompanies: uniqueCompanies,
    summaryInsights,
    benchmark,
  };

  // Build section stats (and best section) fully in-memory.
  let bestSection = null;
  let bestPercentage = 0;
  const sectionStats = [];

  for (const { section } of sectionsToScore) {
    if (!section || !Array.isArray(section.questions)) {
      sectionStats.push({
        sectionId: section && section._id ? section._id.toString() : '',
        sectionName: section && section.name ? section.name : '',
        questionStats: [],
        sectionPercentage: 0,
        totalResponses: 0,
      });
      continue;
    }

    const questions = [...section.questions].sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 0;
      const bo = typeof b.order === 'number' ? b.order : 0;
      return ao - bo;
    });

    let weightedScore = 0;
    let totalMaxScore = 0;

    const questionStats = [];

    for (const question of questions) {
      const qid = toQuestionId(question._id);
      const entry = byQuestion.get(qid);

      const qTotal = entry ? entry.totalResponses : 0;
      const rc = entry ? entry.ratingCount : makeEmptyRatingCount();

      if (qTotal > 0) {
        weightedScore += rc.A * 5 + rc.B * 4 + rc.C * 3 + rc.D * 2 + rc.E * 1;
        totalMaxScore += qTotal * 5;
      }

      const ratingPercentage = {
        A: qTotal > 0 ? (rc.A / qTotal) * 100 : 0,
        B: qTotal > 0 ? (rc.B / qTotal) * 100 : 0,
        C: qTotal > 0 ? (rc.C / qTotal) * 100 : 0,
        D: qTotal > 0 ? (rc.D / qTotal) * 100 : 0,
        E: qTotal > 0 ? (rc.E / qTotal) * 100 : 0,
      };

      questionStats.push({
        questionId: qid,
        questionText: question && question.text ? question.text : '',
        ratingCount: { ...rc },
        ratingPercentage,
        totalResponses: qTotal,
      });
    }

    const sectionPercentage = totalMaxScore > 0 ? (weightedScore / totalMaxScore) * 100 : 0;
    const totalResponses = sectionRespondedCounts.get(section._id.toString()) || 0;

    const secStat = {
      sectionId: section._id.toString(),
      sectionName: section && section.name ? section.name : '',
      questionStats,
      sectionPercentage,
      totalResponses,
    };

    sectionStats.push(secStat);

    if (sectionPercentage > bestPercentage) {
      bestPercentage = sectionPercentage;
      bestSection = {
        sectionId: secStat.sectionId,
        sectionName: secStat.sectionName,
        percentage: sectionPercentage,
      };
    }
  }

  overallStats.bestSection = bestSection;

  return { overallStats, sectionStats };
}

module.exports = {
  calculateQuestionStats,
  calculateSectionStats,
  calculateOverallStats,
  calculateOverallStatsWithSectionStats,
  buildFallbackSectionStats,
  buildResponseMatch,
  getAllSections,
  findSectionById,
  getPublishedQuestionPaper,
};
