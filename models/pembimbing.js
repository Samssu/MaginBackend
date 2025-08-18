// models/pembimbing.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const pembimbingSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: [true, "Nama pembimbing wajib diisi"],
  },
  email: {
    type: String,
    required: [true, "Email wajib diisi"],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/\S+@\S+\.\S+/, "Email tidak valid"],
  },
  password: {
    type: String,
    required: [true, "Password wajib diisi"],
    select: false,
    minlength: [6, "Password minimal 6 karakter"],
  },
  divisi: {
    type: String,
    required: [true, "Divisi wajib diisi"],
  },
  status: {
    type: String,
    enum: ["aktif", "tidak aktif"],
    default: "aktif",
  },
  role: {
    type: String,
    enum: ["pembimbing"],
    default: "pembimbing",
  },
  pembimbing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Pembimbing",
  },
  jumlahMahasiswa: {
    type: Number,
    default: 0,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Method untuk membandingkan password
pembimbingSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Pembimbing", pembimbingSchema);
