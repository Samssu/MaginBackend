const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      required: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email address"], // Validasi email
    },
    password: {
      type: String,
      required: true,
    },
    otp: {
      type: Number,
      required: false, // Jadikan tidak wajib
    },
    otpExpires: {
      type: Date,
      required: false, // Hanya diperlukan jika OTP ada
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ["user", "admin", "pembimbing"], // Menambahkan pembimbing sebagai role
      default: "user",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
