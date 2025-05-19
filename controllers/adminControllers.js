const Admin = require("../models/Admin");
const AdminOTP = require("../models/AdminOTP");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

// kirim OTP ke email admin
exports.sendOTP = async (req, res) => {
  const { email } = req.body;

  const admin = await Admin.findOne({ email });
  if (!admin) return res.status(404).json({ message: "Admin tidak ditemukan" });

  const otp = crypto.randomInt(100000, 999999).toString();

  await AdminOTP.deleteMany({ email }); // hapus OTP sebelumnya
  await AdminOTP.create({ email, otp });

  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: "your@gmail.com",
      pass: "your-password",
    },
  });

  await transporter.sendMail({
    from: "your@gmail.com",
    to: email,
    subject: "Kode OTP Login Admin",
    html: `<h3>OTP kamu: ${otp}</h3><p>Berlaku selama 5 menit</p>`,
  });

  res.json({ message: "OTP terkirim ke email admin" });
};

// verifikasi OTP
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  const record = await AdminOTP.findOne({ email, otp });
  if (!record)
    return res.status(400).json({ message: "OTP tidak valid atau expired" });

  await Admin.updateOne({ email }, { isVerified: true });
  await AdminOTP.deleteMany({ email });

  res.json({ message: "Verifikasi berhasil" });
};
