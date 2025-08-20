// routes/logbookRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Pendaftaran = require("../models/Pendaftaran");
const Logbook = require("../models/logbook");
const Pembimbing = require("../models/pembimbing");

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

// Middleware untuk pembimbing
const authenticatePembimbing = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token diperlukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user is pembimbing
    if (decoded.role !== "pembimbing") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const pembimbing = await Pembimbing.findById(decoded.id);
    if (!pembimbing) {
      return res.status(401).json({ message: "Pembimbing tidak ditemukan" });
    }

    req.pembimbing = pembimbing;
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
    // Cari data pendaftaran user
    const pendaftaran = await Pendaftaran.findOne({ email: req.user.email });

    const newLogbook = new Logbook({
      title: req.body.title,
      content: req.body.content,
      user: req.user._id,
      pendaftaran: pendaftaran ? pendaftaran._id : null,
      report: req.file ? `/uploads/logbooks/${req.file.filename}` : "",
      tanggal: req.body.tanggal || new Date(),
    });

    await newLogbook.save();

    // Populate data untuk response
    await newLogbook.populate("user", "name email");

    res.status(201).json({
      message: "Logbook berhasil disimpan",
      logbook: newLogbook,
    });
  } catch (err) {
    console.error("Gagal menyimpan logbook:", err);
    res.status(500).json({ message: "Gagal menyimpan logbook" });
  }
});

// 📤 Get logbooks milik user
router.get("/", authenticate, async (req, res) => {
  try {
    const logs = await Logbook.find({ user: req.user._id })
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil logbook" });
  }
});

// 📋 Get logbooks by mahasiswa ID (for pembimbing)
router.get(
  "/mahasiswa/:mahasiswaId",
  authenticatePembimbing,
  async (req, res) => {
    try {
      const { mahasiswaId } = req.params;

      // Verifikasi bahwa mahasiswa ini adalah bimbingan pembimbing
      const pendaftaran = await Pendaftaran.findById(mahasiswaId).populate(
        "pembimbing"
      );

      if (
        !pendaftaran ||
        pendaftaran.pembimbing._id.toString() !== req.pembimbing._id.toString()
      ) {
        return res.status(403).json({ message: "Akses ditolak" });
      }

      const logbooks = await Logbook.find({ pendaftaran: mahasiswaId })
        .populate("user", "name email")
        .sort({ tanggal: -1, createdAt: -1 });

      res.status(200).json(logbooks);
    } catch (error) {
      console.error("Error fetching mahasiswa logbooks:", error);
      res.status(500).json({ message: "Gagal memuat logbook mahasiswa" });
    }
  }
);

// 💬 Add comment to logbook
router.patch("/:id/comment", authenticatePembimbing, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    const logbook = await Logbook.findById(id)
      .populate("pendaftaran")
      .populate("user", "name email");

    if (!logbook) {
      return res.status(404).json({ message: "Logbook tidak ditemukan" });
    }

    // Verifikasi bahwa mahasiswa ini adalah bimbingan pembimbing
    if (
      logbook.pendaftaran.pembimbing.toString() !==
      req.pembimbing._id.toString()
    ) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    logbook.comment = comment;
    logbook.commentedAt = new Date();
    logbook.commentedBy = req.pembimbing._id;
    logbook.status = comment ? "dikomentari" : "menunggu";

    await logbook.save();

    // Populate data pembimbing untuk response
    await logbook.populate("commentedBy", "nama");

    res.json({
      message: "Komentar berhasil ditambahkan",
      logbook: logbook,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Gagal menambahkan komentar" });
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

// 📊 Get all logbooks (for admin)
router.get("/admin/all", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Token diperlukan" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const logbooks = await Logbook.find()
      .populate("user", "name email")
      .populate("pendaftaran", "namaLengkap universitas")
      .populate("commentedBy", "nama")
      .sort({ createdAt: -1 });

    res.json(logbooks);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil logbook" });
  }
});

module.exports = router;
