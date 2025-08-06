const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email address"],
    },
    password: {
      type: String,
      required: true,
    },
    otp: {
      type: Number,
      required: false,
    },
    otpExpires: {
      type: Date,
      required: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "pembimbing"],
      default: "user",
    },
    refreshToken: { type: String, default: "" }, // Menyimpan refresh token

    name: { type: String },
    asalKampus: { type: String },
    semester: { type: String },
    jurusan: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
