// routes/logbookRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Logbook = require("../models/logbook");

// Middleware otentikasi token
const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token diperlukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check for either email or id in the token
    let user;
    if (decoded.email) {
      user = await User.findOne({ email: decoded.email });
    } else if (decoded.id) {
      user = await User.findById(decoded.id);
    }

    if (!user) {
      return res.status(401).json({ message: "User tidak ditemukan" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Token verification failed:", err);
    return res.status(401).json({ message: "Token tidak valid" });
  }
};

// Konfigurasi multer untuk PDF
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = path.join(__dirname, "../uploads/logbooks");
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    cb(null, folder);
  },
  filename: (req, file, cb) => {
    const filename = `${Date.now()}-${file.originalname}`;
    cb(null, filename);
  },
});
const upload = multer({ storage });

// 📥 Create logbook
router.post("/", authenticate, upload.single("report"), async (req, res) => {
  try {
    const newLogbook = new Logbook({
      title: req.body.title,
      content: req.body.content,
      user: req.user._id,
      report: req.file ? `/uploads/logbooks/${req.file.filename}` : "",
    });

    await newLogbook.save();
    res.status(201).json({ message: "Logbook berhasil disimpan" });
  } catch (err) {
    console.error("Gagal menyimpan logbook:", err);
    res.status(500).json({ message: "Gagal menyimpan logbook" });
  }
});

// 📤 Get logbooks milik user
router.get("/", authenticate, async (req, res) => {
  try {
    const logs = await Logbook.find({ user: req.user._id }).populate(
      "user",
      "name"
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil logbook" });
  }
});

// 🗑 Delete logbook
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const log = await Logbook.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!log)
      return res.status(404).json({ message: "Logbook tidak ditemukan" });

    // Hapus file PDF jika ada
    if (log.report) {
      const filePath = path.join(__dirname, "../", log.report);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Logbook.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Logbook berhasil dihapus" });
  } catch (err) {
    console.error("Gagal menghapus logbook:", err);
    res.status(500).json({ message: "Gagal menghapus logbook" });
  }
});

module.exports = router;
