const mongoose = require("mongoose");

const PendaftaranSchema = new mongoose.Schema(
  {
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
    komentar: { type: String, default: "" },
    suratBalasan: String,
    certificate: String,
    certificateUploadDate: {
      type: Date,
      default: Date.now,
    },
    pembimbing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pembimbing",
    },
    laporanAkhir: String,
    laporanUploadDate: Date,
    laporanVerified: {
      type: Boolean,
      default: false,
    },

    // Status sinkron dengan frontend
    status: {
      type: String,
      enum: ["pending", "disetujui", "ditolak", "perbaiki"],
      default: "pending",
    },

    // Relasi ke logbook
    logbooks: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Logbook",
      },
    ],

    // Tambahan field untuk tracking
    tanggalDisetujui: Date,
    tanggalDitolak: Date,
    adminYangMenyetujui: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    notifications: [
      {
        title: String,
        message: String,
        type: String,
        createdAt: { type: Date, default: Date.now },
        read: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Pendaftaran", PendaftaranSchema);
