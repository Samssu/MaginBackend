const express = require("express");
const bcrypt = require("bcrypt");
const ResetToken = require("../models/ResetToken");
const User = require("../models/User");
const { register, verifyOtp, login } = require("../controllers/authController");

const router = express.Router();

// 🔐 Auth routes
router.post("/register", register); // Registrasi pengguna
router.post("/verify-otp", verifyOtp); // Verifikasi OTP
router.post("/login", login); // Login pengguna

// 🔁 Reset Password route
router.post("/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const reset = await ResetToken.findOne({ token });

    if (!reset) return res.status(400).json({ message: "Token tidak valid." });
    if (reset.used)
      return res.status(400).json({ message: "Token sudah digunakan." });
    if (reset.expiresAt < new Date())
      return res.status(400).json({ message: "Token telah kedaluwarsa." });

    const user = await User.findById(reset.userId);
    if (!user)
      return res.status(404).json({ message: "Pengguna tidak ditemukan." });

    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    await user.save();

    reset.used = true;
    await reset.save();

    return res.json({ message: "Password berhasil diubah." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
});

module.exports = router;
