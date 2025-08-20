// models/Logbook.js
const mongoose = require("mongoose");

const logbookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    report: { type: String }, // Path to uploaded file
    comment: { type: String }, // Comment from supervisor
    commentedAt: { type: Date }, // Timestamp for comment
    commentedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pembimbing",
    }, // Who commented
    status: {
      type: String,
      enum: ["menunggu", "dikomentari", "disetujui"],
      default: "menunggu",
    }, // Status logbook
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pendaftaran: { type: mongoose.Schema.Types.ObjectId, ref: "Pendaftaran" },
    tanggal: { type: Date, default: Date.now }, // Activity date
  },
  { timestamps: true }
);

module.exports = mongoose.model("Logbook", logbookSchema);
