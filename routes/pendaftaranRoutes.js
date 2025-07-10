const express = require("express");
const multer = require("multer");
const router = express.Router();
const Pendaftaran = require("../models/Pendaftaran");
const { sendEmailNotif } = require("../utils/emailService");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

router.get("/check", async (req, res) => {
  const { nim } = req.query;
  const existing = await Pendaftaran.findOne({ nim });
  res.json({ alreadyRegistered: !!existing });
});

router.post(
  "/submit",
  upload.fields([
    { name: "fileKtm", maxCount: 1 },
    { name: "fileSurat", maxCount: 1 },
  ]),
  async (req, res) => {
    const { nama, nim, universitas, waktuPelaksanaan, tempat } = req.body;

    const existing = await Pendaftaran.findOne({ nim });
    if (existing) return res.status(400).json({ message: "Sudah terdaftar" });

    const newPendaftaran = new Pendaftaran({
      nama,
      nim,
      universitas,
      waktuPelaksanaan,
      tempat,
      fileKtm: req.files.fileKtm[0].filename,
      fileSurat: req.files.fileSurat[0].filename,
    });

    await newPendaftaran.save();

    await sendEmailNotif(nama); // mengirim email

    res.json({ success: true });
  }
);

module.exports = router;
