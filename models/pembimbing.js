// models/Pembimbing.js
const mongoose = require("mongoose");

const PembimbingSchema = new mongoose.Schema({
  nama: String,
  email: String,
  divisi: String,
  jumlahMahasiswa: Number,
  status: {
    type: String,
    enum: ["aktif", "non-aktif"],
    default: "aktif",
  },
});

module.exports = mongoose.model("Pembimbing", PembimbingSchema);
