const Pendaftaran = require("../models/Pendaftaran");

// Approve user
exports.approvePendaftaran = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId } = req.body;

    const updated = await Pendaftaran.findByIdAndUpdate(
      id,
      {
        status: "disetujui",
        tanggalDisetujui: new Date(),
        adminYangMenyetujui: adminId,
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Pendaftar tidak ditemukan" });
    }

    return res.json({
      message: "Pendaftaran telah disetujui",
      data: updated,
    });
  } catch (error) {
    console.error("Error saat menyetujui:", error);
    res.status(500).json({ message: "Gagal menyetujui pendaftaran" });
  }
};
