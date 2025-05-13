const express = require("express");
const router = express.Router();
const auth = require("../controllers/authControllers");

router.post("/register", auth.register);
router.post("/verify", auth.verifyOTP);
router.post("/login", auth.login);

module.exports = router;
