// models/Logbook.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const logbookSchema = new Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    report: { type: String },
    comment: { type: String, default: "" }, // komentar pembimbing
  },
  { timestamps: true }
);

module.exports = mongoose.model("Logbook", logbookSchema);
