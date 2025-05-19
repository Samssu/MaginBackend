const express = require("express");
const router = express.Router();
const { register, verifyOtp } = require("../controllers/authController");

router.post("/register", register);
router.post("/verify-otp", verifyOtp);

module.exports = router;
