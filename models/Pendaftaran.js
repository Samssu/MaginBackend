// models/Pendaftaran.js
const mongoose = require("mongoose");

const PendaftaranSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  nama: String,
  ttl: String,
  tanggalLahir: String,
  jenisKelamin: String,
  alamat: String,
  noHp: String,
  institusi: String,
  prodi: String,
  jenjang: String,
  semester: String,
  ipk: String,
  mulai: String,
  selesai: String,
  tujuan: String,
  divisi: String,
  tandaTangan: String,
  suratPengantar: String,
  cv: String,
  foto: String,
  ktpAtauKtm: String,
  transkrip: String,
  rekomendasi: String,
});

module.exports = mongoose.model("Pendaftaran", PendaftaranSchema);
