require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const User = require("./models/User");
const adminAuth = require("./routes/AdminAuth");

const app = express();

// Mengatur CORS untuk pengembangan atau produksi
app.use(
  cors({
    origin: "http://localhost:3000", // Atur domain frontend Anda jika perlu
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  })
);

app.use("/api", adminAuth);

// Middleware untuk parsing JSON yang aman dan menangani error
app.use(express.json());
app.use((req, res, next) => {
  try {
    // Menangani kemungkinan karakter kontrol yang buruk dalam JSON
    const rawBody = JSON.stringify(req.body);
    if (/[^\x20-\x7E]/.test(rawBody)) {
      // Memeriksa karakter tidak valid
      throw new Error("Invalid character in the request body");
    }
    next();
  } catch (err) {
    console.error("Invalid character in JSON:", err);
    return res
      .status(400)
      .json({ message: "Bad control character in string literal" });
  }
});

// Menghubungkan ke MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error: ", err));

// Fungsi untuk mengirim OTP melalui email
const sendMail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "OTP Verification",
    text: `Your OTP is ${otp}. Please use this to complete your registration.`,
  };

  try {
    console.log(`Sending OTP ${otp} to email ${email}`);
    await transporter.sendMail(mailOptions);
    console.log("OTP sent to email!");
  } catch (error) {
    console.error("Error sending OTP:", error);
  }
};

// Route Register
app.post("/api/register", async (req, res) => {
  const { email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000);

    console.log(`Registering new user with email ${email} and OTP ${otp}`);

    const user = new User({
      email,
      password: hashedPassword,
      otp,
      isVerified: false,
    });

    await user.save();

    const token = jwt.sign({ otp, email }, process.env.JWT_SECRET, {
      expiresIn: "5m",
    });

    // Kirim OTP via email
    await sendMail(email, otp);

    res.status(200).json({ message: "OTP sent to your email", token });
  } catch (error) {
    console.error("Error saving user or sending OTP:", error);
    res.status(500).json({ message: "Error saving to database" });
  }
});

// Route Verify OTP
app.post("/api/verify-otp", async (req, res) => {
  const { otp, token } = req.body;

  if (!otp || !token) {
    console.log("OTP or token missing in request body");
    return res.status(400).json({ message: "OTP and token are required" });
  }

  try {
    // Validasi token JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded JWT token:", decoded);

    const { otp: storedOtp, email } = decoded;
    const user = await User.findOne({ email });

    if (!user) {
      console.log("User not found for email:", email);
      return res.status(404).json({ message: "User not found" });
    }

    console.log("Comparing OTPs, input:", otp, "stored:", storedOtp);
    if (parseInt(otp) !== storedOtp) {
      console.log("OTP does not match");
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.isVerified = true;
    await user.save();

    console.log("User verified successfully:", email);
    res.status(200).json({ message: "OTP verified successfully" });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Server error during OTP verification" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Mencari user berdasarkan email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Memeriksa apakah password cocok dengan yang tersimpan di database
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // Membuat token JWT yang berisi userId dan email
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // Token kadaluarsa dalam 1 jam
    );

    // Mengembalikan token JWT sebagai respons
    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
});

// Mengatur server untuk mendengarkan di port 5000
app.listen(5000, () => {
  console.log("Backend server is running on http://localhost:5000");
});
