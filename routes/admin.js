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
