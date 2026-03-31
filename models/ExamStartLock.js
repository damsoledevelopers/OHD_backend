const mongoose = require('mongoose');

const ExamStartLockSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    employeeEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    surveyDispatchedAt: {
      type: Date,
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    department: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

ExamStartLockSchema.index(
  { companyId: 1, employeeEmail: 1, surveyDispatchedAt: 1 },
  { unique: true }
);

module.exports = mongoose.models.ExamStartLock || mongoose.model('ExamStartLock', ExamStartLockSchema);

