import { Rating } from '@/models/EmployeeResponse';
import EmployeeResponse, { IAnswer } from '@/models/EmployeeResponse';
import Question from '@/models/Question';
import Section from '@/models/Section';
import mongoose from 'mongoose';

export interface RatingCount {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
}

export interface QuestionStats {
  questionId: string;
  questionText: string;
  ratingCount: RatingCount;
  ratingPercentage: RatingCount;
  totalResponses: number;
}

export interface SectionStats {
  sectionId: string;
  sectionName: string;
  questionStats: QuestionStats[];
  sectionPercentage: number;
  totalResponses: number;
}

export interface OverallStats {
  overallPercentage: number;
  ratingDistribution: RatingCount;
  ratingDistributionPercentage: RatingCount;
  bestSection: {
    sectionId: string;
    sectionName: string;
    percentage: number;
  } | null;
  totalResponses: number;
  totalCompanies: number;
  summaryInsights: string[];
}

// Convert rating to numeric value for calculations
const ratingToNumber = (rating: Rating): number => {
  const map: Record<Rating, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
  return map[rating];
};

// Calculate percentage from rating
const calculatePercentage = (rating: Rating): number => {
  return (ratingToNumber(rating) / 5) * 100;
};

// Calculate average percentage from ratings array
const calculateAveragePercentage = (ratings: Rating[]): number => {
  if (ratings.length === 0) return 0;
  const sum = ratings.reduce((acc, rating) => acc + calculatePercentage(rating), 0);
  return sum / ratings.length;
};

export async function calculateQuestionStats(
  questionId: string,
  companyId?: string
): Promise<QuestionStats> {
  const question = await Question.findById(questionId);
  if (!question) {
    throw new Error('Question not found');
  }

  const matchQuery: any = { 'answers.questionId': new mongoose.Types.ObjectId(questionId) };
  if (companyId) {
    matchQuery.companyId = new mongoose.Types.ObjectId(companyId);
  }

  const responses = await EmployeeResponse.find(matchQuery);
  
  const ratingCount: RatingCount = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  
  responses.forEach((response) => {
    const answer = response.answers.find(
      (a) => a.questionId.toString() === questionId
    );
    if (answer) {
      ratingCount[answer.rating]++;
    }
  });

  const totalResponses = responses.length;
  const ratingPercentage: RatingCount = {
    A: totalResponses > 0 ? (ratingCount.A / totalResponses) * 100 : 0,
    B: totalResponses > 0 ? (ratingCount.B / totalResponses) * 100 : 0,
    C: totalResponses > 0 ? (ratingCount.C / totalResponses) * 100 : 0,
    D: totalResponses > 0 ? (ratingCount.D / totalResponses) * 100 : 0,
    E: totalResponses > 0 ? (ratingCount.E / totalResponses) * 100 : 0,
  };

  return {
    questionId: question._id.toString(),
    questionText: question.text,
    ratingCount,
    ratingPercentage,
    totalResponses,
  };
}

export async function calculateSectionStats(
  sectionId: string,
  companyId?: string
): Promise<SectionStats> {
  const section = await Section.findById(sectionId);
  if (!section) {
    throw new Error('Section not found');
  }

  const questions = await Question.find({ sectionId }).sort({ order: 1 });
  const questionStats: QuestionStats[] = [];

  for (const question of questions) {
    const stats = await calculateQuestionStats(question._id.toString(), companyId);
    questionStats.push(stats);
  }

  // Calculate section percentage (average of all questions in section)
  const allRatings: Rating[] = [];
  const matchQuery: any = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};
  const questionIds = questions.map((q) => q._id);
  matchQuery['answers.questionId'] = { $in: questionIds };
  
  const responses = await EmployeeResponse.find(matchQuery);

  responses.forEach((response) => {
    questions.forEach((question) => {
      const answer = response.answers.find(
        (a) => a.questionId.toString() === question._id.toString()
      );
      if (answer) {
        allRatings.push(answer.rating);
      }
    });
  });

  const sectionPercentage = calculateAveragePercentage(allRatings);

  return {
    sectionId: section._id.toString(),
    sectionName: section.name,
    questionStats,
    sectionPercentage,
    totalResponses: responses.length,
  };
}

export async function calculateOverallStats(companyId?: string): Promise<OverallStats> {
  const sections = await Section.find().sort({ order: 1 });
  const sectionStats: SectionStats[] = [];

  for (const section of sections) {
    const stats = await calculateSectionStats(section._id.toString(), companyId);
    sectionStats.push(stats);
  }

  // Calculate overall percentage
  const allRatings: Rating[] = [];
  const matchQuery: any = companyId ? { companyId: new mongoose.Types.ObjectId(companyId) } : {};
  const responses = await EmployeeResponse.find(matchQuery);

  responses.forEach((response) => {
    response.answers.forEach((answer) => {
      allRatings.push(answer.rating);
    });
  });

  const overallPercentage = calculateAveragePercentage(allRatings);

  // Calculate rating distribution
  const ratingDistribution: RatingCount = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  allRatings.forEach((rating) => {
    ratingDistribution[rating]++;
  });

  const totalRatings = allRatings.length;
  const ratingDistributionPercentage: RatingCount = {
    A: totalRatings > 0 ? (ratingDistribution.A / totalRatings) * 100 : 0,
    B: totalRatings > 0 ? (ratingDistribution.B / totalRatings) * 100 : 0,
    C: totalRatings > 0 ? (ratingDistribution.C / totalRatings) * 100 : 0,
    D: totalRatings > 0 ? (ratingDistribution.D / totalRatings) * 100 : 0,
    E: totalRatings > 0 ? (ratingDistribution.E / totalRatings) * 100 : 0,
  };

  // Find best section
  let bestSection: { sectionId: string; sectionName: string; percentage: number } | null = null;
  if (sectionStats.length > 0) {
    const sorted = [...sectionStats].sort((a, b) => b.sectionPercentage - a.sectionPercentage);
    bestSection = {
      sectionId: sorted[0].sectionId,
      sectionName: sorted[0].sectionName,
      percentage: sorted[0].sectionPercentage,
    };
  }

  // Generate summary insights
  const summaryInsights: string[] = [];
  if (overallPercentage >= 80) {
    summaryInsights.push('Excellent overall health score. Organization is performing well.');
  } else if (overallPercentage >= 60) {
    summaryInsights.push('Good overall health score. Some areas may need attention.');
  } else if (overallPercentage >= 40) {
    summaryInsights.push('Moderate overall health score. Several areas require improvement.');
  } else {
    summaryInsights.push('Low overall health score. Significant improvements needed across multiple areas.');
  }

  if (bestSection) {
    summaryInsights.push(`Best performing section: ${bestSection.sectionName} (${bestSection.percentage.toFixed(2)}%)`);
  }

  const worstSection = sectionStats.length > 0
    ? [...sectionStats].sort((a, b) => a.sectionPercentage - b.sectionPercentage)[0]
    : null;
  if (worstSection) {
    summaryInsights.push(`Area needing attention: ${worstSection.sectionName} (${worstSection.sectionPercentage.toFixed(2)}%)`);
  }

  // Get unique companies count
  const uniqueCompanies = companyId ? 1 : await EmployeeResponse.distinct('companyId').then(ids => ids.length);

  return {
    overallPercentage,
    ratingDistribution,
    ratingDistributionPercentage,
    bestSection,
    totalResponses: responses.length,
    totalCompanies: uniqueCompanies,
    summaryInsights,
  };
}

