const mongoose = require("mongoose");

const adminOTPSchema = new mongoose.Schema({
  email: String,
  otp: String,
  createdAt: { type: Date, default: Date.now, expires: 300 }, // OTP expired in 5 mins
});

module.exports = mongoose.model("AdminOTP", adminOTPSchema);
