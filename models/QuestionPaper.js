const mongoose = require('mongoose');

const QuestionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    order: { type: Number, default: 0 },
  },
  { _id: true, timestamps: false },
);

const SectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    questions: [QuestionSchema],
  },
  { _id: true, timestamps: false },
);

const PillarSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    order: { type: Number, default: 0 },
    sections: [SectionSchema],
  },
  { _id: true, timestamps: false },
);

const QuestionPaperSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    draft: {
      pillars: [PillarSchema],
      updatedAt: { type: Date },
    },
    published: {
      pillars: [PillarSchema],
      publishedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  },
);

QuestionPaperSchema.statics.getOrCreateDefault = async function () {
  // Use an atomic upsert to avoid duplicate key errors when multiple
  // requests try to create the default document at the same time.
  const now = new Date();
  const doc = await this.findOneAndUpdate(
    { key: 'default' },
    {
      $setOnInsert: {
        key: 'default',
        draft: { pillars: [], updatedAt: now },
        published: { pillars: [], publishedAt: null },
      },
    },
    {
      new: true,
      upsert: true,
    },
  );
  return doc;
};

module.exports = mongoose.model('QuestionPaper', QuestionPaperSchema);

