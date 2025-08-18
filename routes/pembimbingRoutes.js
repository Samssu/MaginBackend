// routes/pembimbingRoutes.js
const express = require("express");
const {
  getMahasiswaBimbingan,
} = require("../controllers/pembimbingController");

const router = express.Router();

// Use this format for ID parameters
router.get("/:id/mahasiswa", getMahasiswaBimbingan);

module.exports = router;
