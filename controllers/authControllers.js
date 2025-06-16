const User = require("../models/User");
const Otp = require("../models/Otp");
const sendOTP = require("../utils/sendMail");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); // Pastikan kamu sudah import bcrypt juga

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

exports.register = async (req, res) => {
  const { email, password, role } = req.body;

  try {
    let user = await User.findOne({ email });

    if (user && user.isVerified) {
      return res
        .status(400)
        .json({ message: "Email sudah terdaftar dan terverifikasi." });
    }

    if (!user) {
      // Pastikan role selalu di-set, default "user"
      user = await User.create({
        email,
        password,
        role: role || "user",
      });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

    await Otp.findOneAndUpdate(
      { email },
      { code: otpCode, expiresAt },
      { upsert: true, new: true }
    );

    await sendOTP(email, otpCode);

    res.json({ message: "Kode OTP telah dikirim ke email." });
  } catch (err) {
    res.status(500).json({ message: "Terjadi kesalahan", error: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  const { email, code } = req.body;

  try {
    const otpRecord = await Otp.findOne({ email });

    if (!otpRecord || otpRecord.code !== code) {
      return res
        .status(400)
        .json({ message: "OTP salah atau tidak ditemukan." });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ message: "OTP telah kedaluwarsa." });
    }

    await User.updateOne({ email }, { isVerified: true });
    await Otp.deleteOne({ email });

    res.json({ message: "Email berhasil diverifikasi." });
  } catch (err) {
    res.status(500).json({ message: "Verifikasi gagal", error: err.message });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    // Pastikan role ada di user dan masuk ke payload token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role || "user", // fallback jika role kosong
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Server error during login" });
  }
};
