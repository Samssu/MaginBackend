const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminControllers");

router.post("/admin/send-otp", adminController.sendOTP);
router.post("/admin/verify-otp", adminController.verifyOTP);

module.exports = router;
