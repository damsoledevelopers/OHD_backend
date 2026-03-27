const mongoose = require('mongoose');

const MailLogSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    subject: { type: String, required: true },
    recipients: [{ type: String, required: true }],
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['sent', 'partial', 'failed'],
      default: 'sent',
    },
    providerMessageId: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model('MailLog', MailLogSchema);

