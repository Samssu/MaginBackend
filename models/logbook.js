const mongoose = require("mongoose");

const logbookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    report: String, // Path to uploaded file
    comment: String, // Comment from supervisor
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    pendaftaran: { type: mongoose.Schema.Types.ObjectId, ref: "Pendaftaran" }, // Tambahkan ini
    report: String,
    comment: String,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Logbook", logbookSchema);
