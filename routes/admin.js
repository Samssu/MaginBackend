// createAdmin.js
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

const createAdmin = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const existingAdmin = await User.findOne({ role: "admin" });
  if (existingAdmin) {
    console.log("Admin sudah ada:", existingAdmin.email);
    process.exit();
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = new User({
    name: "Administrator",
    email: "admin@example.com",
    password: hashedPassword,
    role: "admin",
    isVerified: true,
  });

  await admin.save();
  console.log("Admin berhasil dibuat:", admin.email);
  process.exit();
};

createAdmin();

// routes/admin.js
const express = require("express");
const router = express.Router();
const Pendaftaran = require("../models/Pendaftaran");
const Logbook = require("../models/logbook");

router.get("/statistik", async (req, res) => {
  try {
    const totalPendaftar = await Pendaftaran.countDocuments();
    const totalDisetujui = await Pendaftaran.countDocuments({
      status: "disetujui",
    });
    const totalMenunggu = await Pendaftaran.countDocuments({
      status: "menunggu",
    });
    const totalLogbook = await Logbook.countDocuments();

    res.json({ totalPendaftar, totalDisetujui, totalMenunggu, totalLogbook });
  } catch (error) {
    res.status(500).json({ message: "Gagal mengambil data statistik" });
  }
});
