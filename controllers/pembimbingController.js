// controllers/pembimbingController.js
const mongoose = require("mongoose");

exports.getMahasiswaBimbingan = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        message: "ID pembimbing tidak valid",
        receivedId: req.params.id,
      });
    }

    const pembimbingId = new mongoose.Types.ObjectId(req.params.id);

    const mahasiswa = await mongoose
      .model("Pendaftaran")
      .find({
        pembimbing: pembimbingId,
        status: "disetujui",
      })
      .select(
        "nama email telepon alamat institusi prodi status mulai selesai pembimbing"
      )
      .populate("pembimbing", "nama divisi");

    if (!mahasiswa.length) {
      return res.status(404).json({
        message: "Belum ada mahasiswa bimbingan",
        pembimbingId: req.params.id,
      });
    }

    res.json(mahasiswa);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Gagal mengambil data mahasiswa",
      error: error.message,
    });
  }
};
