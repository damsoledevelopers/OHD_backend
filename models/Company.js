const mongoose = require('mongoose');

const CompanySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    contactPerson: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    industry: {
      type: String,
      trim: true,
    },
    // Allowed departments for survey participants (stored as list of strings).
    // Example input from UI: "Engineering, Marketing, Sales"
    departments: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((d) => typeof d === 'string' && d.trim().length > 0),
        message: 'departments must be an array of non-empty strings',
      },
    },
    employeeCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      // Status shown in the admin "Companies" portal.
      // NOTE: `pending` is kept for backward compatibility with existing records.
      enum: ['active', 'inactive', 'new', 'pending', 'completed', 'session_ended'],
      default: 'new',
    },
    excelFileUrl: {
      type: String,
      trim: true,
    },
    // Survey lifecycle metadata
    surveyDispatchedAt: {
      type: Date,
    },
    surveyClosesAt: {
      type: Date,
    },
    surveyStatus: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Company || mongoose.model('Company', CompanySchema);

