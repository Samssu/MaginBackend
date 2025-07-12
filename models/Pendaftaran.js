const mongoose = require("mongoose");

const PendaftaranSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  nama: { type: String, required: true },
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

  // ✅ Tambahkan status dan tanggal pendaftaran
  status: {
    type: String,
    enum: ["pending", "disetujui", "ditolak"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Pendaftaran", PendaftaranSchema);
