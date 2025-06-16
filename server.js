require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const User = require("./models/User");

const app = express();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use(express.json());

let temporaryUsers = {}; // Temporary storage for unverified users

const sendMail = async (email, subject, message) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${email}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000);

    temporaryUsers[email] = {
      name,
      email,
      password: hashedPassword,
      otp,
      isVerified: false,
    };

    const token = jwt.sign({ email, otp }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await sendMail(
      email,
      "OTP Verification",
      `Your OTP is ${otp}. Please use this to complete your registration.`
    );

    res.status(200).json({ message: "OTP sent to your email", token });
  } catch (error) {
    console.error("Error saving user or sending OTP:", error);
    res.status(500).json({ message: "Error saving to database" });
  }
});

app.post("/api/verify-otp", async (req, res) => {
  const { otp, token } = req.body;

  if (!otp || !token) {
    return res.status(400).send();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, otp: storedOtp } = decoded;

    if (parseInt(otp) !== storedOtp) {
      return res.status(400).send();
    }

    if (!temporaryUsers[email]) {
      return res.status(404).send();
    }

    const userData = temporaryUsers[email];

    const user = new User({
      name: userData.name,
      email: userData.email,
      password: userData.password,
      isVerified: true,
      role: "user",
    });

    await user.save();
    delete temporaryUsers[email];

    res.status(200).send();
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).send();
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password diperlukan" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ message: "Email atau password salah" });
    }

    if (!user.isVerified) {
      return res.status(400).json({
        message: "Email belum diverifikasi. Silakan verifikasi email Anda.",
      });
    }

    const token = jwt.sign(
      { email: user.email, role: user.role, isVerified: user.isVerified },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    return res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
});

// 🔐 Forgot Password
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Email tidak ditemukan" });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 menit dari sekarang

    // Simpan token ke DB
    await ResetToken.create({
      userId: user._id,
      token: resetToken,
      expiresAt,
    });

    const resetLink = `http://localhost:3000/reset-password/${resetToken}`;

    await sendMail(
      email,
      "Reset Password",
      `Klik link berikut untuk reset password Anda: ${resetLink}`
    );

    res.status(200).json({ message: "Link reset berhasil dikirim ke email" });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "Gagal mengirim email reset password" });
  }
});

// 🔐 Reset Password (hanya bisa digunakan 1x)
app.post("/api/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const resetTokenDoc = await ResetToken.findOne({
      token,
      userId: decoded.id,
    });

    if (!resetTokenDoc) {
      return res.status(400).json({ message: "Token tidak ditemukan" });
    }

    if (resetTokenDoc.used) {
      return res.status(400).json({ message: "Token sudah digunakan" });
    }

    if (resetTokenDoc.expiresAt < new Date()) {
      return res.status(400).json({ message: "Token kedaluwarsa" });
    }

    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    resetTokenDoc.used = true;
    await resetTokenDoc.save();

    res.status(200).json({ message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Error in reset password:", error);
    res
      .status(400)
      .json({ message: "Token tidak valid atau sudah kedaluwarsa" });
  }
});

app.listen(5000, () => {
  console.log("Backend server is running on http://localhost:5000");
});
