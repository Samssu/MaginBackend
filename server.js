require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("./models/User");
const ResetToken = require("./models/ResetToken");
const Pendaftaran = require("./models/Pendaftaran");

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

// Konfigurasi multer untuk file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

let temporaryUsers = {}; // Penyimpanan sementara user OTP

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

// 📩 API REGISTER (OTP)
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

// 📩 VERIFIKASI OTP
app.post("/api/verify-otp", async (req, res) => {
  const { otp, token } = req.body;

  if (!otp || !token) return res.status(400).send();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, otp: storedOtp } = decoded;

    if (parseInt(otp) !== storedOtp) return res.status(400).send();
    if (!temporaryUsers[email]) return res.status(404).send();

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

// 🔐 LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email dan password diperlukan" });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Email atau password salah" });

    if (!user.isVerified)
      return res.status(400).json({
        message: "Email belum diverifikasi. Silakan verifikasi email Anda.",
      });

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

// 🔁 LUPA PASSWORD
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Email tidak ditemukan" });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await ResetToken.create({ userId: user._id, token: resetToken, expiresAt });

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

// 🔁 RESET PASSWORD
app.post("/api/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const resetTokenDoc = await ResetToken.findOne({
      token,
      userId: decoded.id,
    });

    if (!resetTokenDoc)
      return res.status(400).json({ message: "Token tidak ditemukan" });

    if (resetTokenDoc.used)
      return res.status(400).json({ message: "Token sudah digunakan" });

    if (resetTokenDoc.expiresAt < new Date())
      return res.status(400).json({ message: "Token kedaluwarsa" });

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
    res.status(400).json({ message: "Token tidak valid atau kedaluwarsa" });
  }
});

// ✅ BUAT ADMIN LANGSUNG (tanpa OTP)
app.post("/api/create-admin", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingAdmin = await User.findOne({ email });
    if (existingAdmin)
      return res.status(400).json({ message: "Email sudah digunakan" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new User({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
    });

    await admin.save();
    res.status(201).json({ message: "Akun admin berhasil dibuat" });
  } catch (error) {
    console.error("Error membuat admin:", error);
    res.status(500).json({ message: "Gagal membuat akun admin" });
  }
});

app.listen(5000, () => {
  console.log("✅ Backend server running on http://localhost:5000");
});

//Pendaftaran
app.post(
  "/api/pendaftaran",
  upload.fields([
    { name: "suratPengantar" },
    { name: "cv" },
    { name: "foto" },
    { name: "ktm" },
    { name: "transkrip" },
    { name: "rekomendasi" },
  ]),
  async (req, res) => {
    try {
      const email = req.body.email;

      // Cek apakah sudah pernah mendaftar
      const existing = await Pendaftaran.findOne({ email });
      if (existing) {
        return res
          .status(409)
          .json({ message: "Email sudah digunakan untuk mendaftar." });
      }

      const newPendaftaran = new Pendaftaran({
        ...req.body,
        suratPengantar: req.files?.suratPengantar?.[0]?.filename || "",
        cv: req.files?.cv?.[0]?.filename || "",
        foto: req.files?.foto?.[0]?.filename || "",
        ktpAtauKtm: req.files?.ktm?.[0]?.filename || "",
        transkrip: req.files?.transkrip?.[0]?.filename || "",
        rekomendasi: req.files?.rekomendasi?.[0]?.filename || "",
      });

      await newPendaftaran.save();

      return res.status(201).json({ message: "Pendaftaran berhasil disimpan" });
    } catch (err) {
      console.error("❌ Gagal menyimpan pendaftaran:", err);
      if (err.code === 11000 && err.keyPattern.email) {
        return res
          .status(409)
          .json({ message: "Email sudah digunakan untuk mendaftar." });
      }
      return res.status(500).json({ message: "Gagal menyimpan pendaftaran" });
    }
  }
);

// Get all pendaftar
app.get("/api/pendaftaran", async (req, res) => {
  try {
    const data = await Pendaftaran.find();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Gagal mengambil data pendaftaran" });
  }
});

// Update data pendaftar (edit atau setujui/tolak)
app.put("/api/pendaftaran/:id", async (req, res) => {
  try {
    const updated = await Pendaftaran.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Gagal memperbarui data" });
  }
});

// Statistik
app.get("/api/pendaftaran/stats", async (req, res) => {
  const total = await Pendaftaran.countDocuments();
  const newCount = await Pendaftaran.countDocuments({ status: "pending" });
  const approved = await Pendaftaran.countDocuments({ status: "disetujui" });
  const rejected = await Pendaftaran.countDocuments({ status: "ditolak" });

  const last7 = await Pendaftaran.aggregate([
    { $match: {} },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: 7 },
  ]);

  res.json({
    total,
    new: newCount,
    approved,
    rejected,
    daily: last7.map((doc) => ({ date: doc._id, count: doc.count })),
  });
});

// Recent Activity
app.get("/api/pendaftaran/recent", async (req, res) => {
  const recent = await Pendaftaran.find().sort({ createdAt: -1 }).limit(10);
  res.json(recent);
});

// routes/pembimbing.js
router.get("/", async (req, res) => {
  try {
    const data = await Pembimbing.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data pembimbing" });
  }
});

// PUT /api/pendaftaran/:id
router.put("/:id", async (req, res) => {
  const data = req.body;
  try {
    const updated = await Pendaftaran.findByIdAndUpdate(req.params.id, data, {
      new: true,
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Gagal mengupdate data" });
  }
});
