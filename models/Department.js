const mongoose = require('mongoose');

const DepartmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    /** Lowercase, used for uniqueness (case-insensitive). */
    nameNormalized: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

DepartmentSchema.index({ nameNormalized: 1 }, { unique: true });

DepartmentSchema.pre('validate', function setNormalized(next) {
  if (typeof this.name === 'string') {
    this.name = this.name.trim();
    if (this.name) {
      this.nameNormalized = this.name.toLowerCase();
    }
  }
  next();
});

module.exports = mongoose.models.Department || mongoose.model('Department', DepartmentSchema);
