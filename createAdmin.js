require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const email = "admin@example.com"; // Ganti dengan email admin yang kamu inginkan
    const password = "admin123"; // Ganti dengan password admin

    // Cek apakah admin sudah ada
    const existing = await User.findOne({ email });
    if (existing) {
      console.log("Admin sudah ada di database:", email);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Buat user admin baru dengan isVerified true supaya bisa login langsung
    const adminUser = new User({
      email,
      password: hashedPassword,
      isVerified: true,
      role: "admin",
    });

    await adminUser.save();

    console.log("Admin berhasil dibuat dengan email:", email);
    process.exit(0);
  } catch (err) {
    console.error("Error membuat admin:", err);
    process.exit(1);
  }
}

createAdmin();
