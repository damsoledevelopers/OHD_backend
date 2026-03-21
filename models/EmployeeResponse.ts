import mongoose, { Schema, Document, Model } from 'mongoose';

export type Rating = 'A' | 'B' | 'C' | 'D' | 'E';

export interface IAnswer {
  questionId: mongoose.Types.ObjectId;
  rating: Rating;
}

export interface IEmployeeResponse extends Document {
  companyId: mongoose.Types.ObjectId;
  service?: string;
  employeeEmail?: string;
  employeeName?: string;
  answers: IAnswer[];
  startedAt?: Date;
  submittedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const AnswerSchema: Schema = new Schema(
  {
    questionId: {
      type: Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    rating: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'E'],
      required: true,
    },
  },
  { _id: false }
);

const EmployeeResponseSchema: Schema = new Schema(
  {
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
    },
    service: {
      type: String,
    },
    employeeEmail: {
      type: String,
      required: false,
      lowercase: true,
      trim: true,
    },
    employeeName: {
      type: String,
      trim: true,
    },
    answers: {
      type: [AnswerSchema],
      required: true,
    },
    startedAt: {
      type: Date,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Previously ensured one response per employee per company using email.
// Email is now optional to support fully anonymous surveys.

const EmployeeResponse: Model<IEmployeeResponse> =
  mongoose.models.EmployeeResponse || mongoose.model<IEmployeeResponse>('EmployeeResponse', EmployeeResponseSchema);

export default EmployeeResponse;

