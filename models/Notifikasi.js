const mongoose = require("mongoose");

const NotifikasiSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: String,
    message: String,
    type: {
      type: String,
      enum: ["info", "warning", "success"],
      default: "info",
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notifikasi", NotifikasiSchema);
