// models/Pembimbing.js
const mongoose = require("mongoose");

const PembimbingSchema = new mongoose.Schema({
  nama: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  divisi: { type: String, required: true },
  jumlahMahasiswa: { type: Number, default: 0 },
  status: { type: String, enum: ["aktif", "non-aktif"], default: "aktif" },
});

module.exports = mongoose.model("Pembimbing", PembimbingSchema);
