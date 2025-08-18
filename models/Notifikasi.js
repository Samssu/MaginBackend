// models/Notifikasi.js
const mongoose = require("mongoose");

const notifikasiSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      "welcome",
      "verification",
      "rejected",
      "need_correction",
      "accepted",
      "info",
      "document",
      "certificate",
      "approval",
    ],
  },
  pendaftaranId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Pendaftaran",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  read: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Notifikasi", notifikasiSchema);
