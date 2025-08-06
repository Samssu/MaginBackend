require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const User = require("./models/User");
const ResetToken = require("./models/ResetToken");
const Pendaftaran = require("./models/Pendaftaran");
const Pembimbing = require("./models/pembimbing");

const app = express();

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// Untuk mengatur batas ukuran payload, misalnya 50MB
app.use(express.json({ limit: "50mb" })); // Mengatur batas body untuk JSON
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Mengatur batas body untuk URL-encoded

app.use(
  cors({
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: "GET,POST,PUT,PATCH,DELETE",
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.json());

// Konfigurasi multer untuk file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

let temporaryUsers = {}; // Penyimpanan sementara user OTP

const sendMail = async (email, subject, message) => {
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
    subject,
    text: message,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${email}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

// 📩 API REGISTER (OTP)
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = Math.floor(100000 + Math.random() * 900000);

    temporaryUsers[email] = {
      name,
      email,
      password: hashedPassword,
      otp,
      isVerified: false,
    };

    const token = jwt.sign({ email, otp }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    await sendMail(
      email,
      "OTP Verification",
      `Your OTP is ${otp}. Please use this to complete your registration.`
    );

    res.status(200).json({ message: "OTP sent to your email", token });
  } catch (error) {
    console.error("Error saving user or sending OTP:", error);
    res.status(500).json({ message: "Error saving to database" });
  }
});

// 📩 VERIFIKASI OTP
app.post("/api/verify-otp", async (req, res) => {
  const { otp, token } = req.body;

  if (!otp || !token) return res.status(400).send();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { email, otp: storedOtp } = decoded;

    if (parseInt(otp) !== storedOtp) return res.status(400).send();
    if (!temporaryUsers[email]) return res.status(404).send();

    const userData = temporaryUsers[email];
    const user = new User({
      name: userData.name,
      email: userData.email,
      password: userData.password,
      isVerified: true,
      role: "user",
    });

    await user.save();
    delete temporaryUsers[email];
    res.status(200).send();
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).send();
  }
});

// 🔐 LOGIN
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email dan password diperlukan" });

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Email atau password salah" });

    // Perbaikan: Admin tidak perlu verifikasi email
    if (user.role !== "admin" && !user.isVerified)
      return res.status(400).json({
        message: "Email belum diverifikasi. Silakan verifikasi email Anda.",
      });

    const token = jwt.sign(
      {
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        name: user.name, // Tambahkan name jika diperlukan
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Set cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600000, // 1 jam
      path: "/",
    });

    return res.status(200).json({ token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Terjadi kesalahan server" });
  }
});

// 🔁 LUPA PASSWORD
app.post("/api/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "Email tidak ditemukan" });

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "15m",
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await ResetToken.create({ userId: user._id, token: resetToken, expiresAt });

    const resetLink = `http://localhost:3000/reset-password/${resetToken}`;
    await sendMail(
      email,
      "Reset Password",
      `Klik link berikut untuk reset password Anda: ${resetLink}`
    );

    res.status(200).json({ message: "Link reset berhasil dikirim ke email" });
  } catch (error) {
    console.error("Error in forgot password:", error);
    res.status(500).json({ message: "Gagal mengirim email reset password" });
  }
});

// 🔁 RESET PASSWORD
app.post("/api/reset-password/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const resetTokenDoc = await ResetToken.findOne({
      token,
      userId: decoded.id,
    });

    if (!resetTokenDoc)
      return res.status(400).json({ message: "Token tidak ditemukan" });

    if (resetTokenDoc.used)
      return res.status(400).json({ message: "Token sudah digunakan" });

    if (resetTokenDoc.expiresAt < new Date())
      return res.status(400).json({ message: "Token kedaluwarsa" });

    const user = await User.findById(decoded.id);
    if (!user)
      return res.status(404).json({ message: "Pengguna tidak ditemukan" });

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    resetTokenDoc.used = true;
    await resetTokenDoc.save();

    res.status(200).json({ message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Error in reset password:", error);
    res.status(400).json({ message: "Token tidak valid atau kedaluwarsa" });
  }
});

app.listen(5000, () => {
  console.log("✅ Backend server running on http://localhost:5000");
});

// API Logout
app.post("/api/logout", (req, res) => {
  try {
    // Clear the HTTP-only cookie
    res.clearCookie("token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.status(200).json({ message: "Logout berhasil" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ message: "Gagal logout" });
  }
});

//Pendaftaran
app.post(
  "/api/pendaftaran",
  upload.fields([
    { name: "suratPengantar" },
    { name: "cv" },
    { name: "foto" },
    { name: "ktm" },
    { name: "transkrip" },
    { name: "rekomendasi" },
  ]),
  async (req, res) => {
    try {
      const email = req.body.email;

      // Cek apakah sudah pernah mendaftar
      const existing = await Pendaftaran.findOne({ email });
      if (existing) {
        return res
          .status(409)
          .json({ message: "Email sudah digunakan untuk mendaftar." });
      }

      const newPendaftaran = new Pendaftaran({
        ...req.body,
        suratPengantar: req.files?.suratPengantar?.[0]?.filename || "",
        cv: req.files?.cv?.[0]?.filename || "",
        foto: req.files?.foto?.[0]?.filename || "",
        ktpAtauKtm: req.files?.ktm?.[0]?.filename || "",
        transkrip: req.files?.transkrip?.[0]?.filename || "",
        rekomendasi: req.files?.rekomendasi?.[0]?.filename || "",
      });

      await newPendaftaran.save();

      return res.status(201).json({ message: "Pendaftaran berhasil disimpan" });
    } catch (err) {
      console.error("❌ Gagal menyimpan pendaftaran:", err);
      if (err.code === 11000 && err.keyPattern.email) {
        return res
          .status(409)
          .json({ message: "Email sudah digunakan untuk mendaftar." });
      }
      return res.status(500).json({ message: "Gagal menyimpan pendaftaran" });
    }
  }
);

// Get all pendaftar
app.get("/api/pendaftaran", async (req, res) => {
  try {
    const data = await Pendaftaran.find();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Gagal mengambil data pendaftaran" });
  }
});

// Update data pendaftar (edit atau setujui/tolak)
app.put("/api/pendaftaran/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      status: "pending", // Force status to pending on any update
      updatedAt: new Date(),
    };

    const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating pendaftaran:", error);
    res.status(500).json({ error: "Gagal memperbarui data" });
  }
});

// Endpoint ambil riwayat pendaftaran user
app.get("/riwayat/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const data = await Pendaftaran.findOne({ email });

    if (!data) {
      return res.status(404).json({ message: "Riwayat tidak ditemukan" });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

const logbookRoutes = require("./routes/logbookRoutes");
app.use("/api/logbook", logbookRoutes);

app.use(
  "/uploads/logbooks",
  express.static(path.join(__dirname, "uploads/logbooks"))
);

// Ambil semua pembimbing
app.get("/api/pembimbing", async (req, res) => {
  try {
    const data = await Pembimbing.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil data pembimbing" });
  }
});

// Tambah pembimbing baru dengan JWT token
app.post("/api/pembimbing", async (req, res) => {
  try {
    const { nama, email, password, divisi } = req.body;

    // Validasi input
    if (!nama || !email || !password || !divisi) {
      return res.status(400).json({
        success: false,
        message: "Semua field wajib diisi",
      });
    }

    // Validasi format email
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    // Validasi kekuatan password
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    // Cek email sudah terdaftar
    const existing = await Pembimbing.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email sudah digunakan",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Buat pembimbing baru
    const pembimbing = new Pembimbing({
      nama,
      email,
      password: hashedPassword,
      divisi,
    });

    await pembimbing.save();

    // Generate JWT token
    const token = jwt.sign(
      {
        id: pembimbing._id,
        email: pembimbing.email,
        role: "pembimbing",
        divisi: pembimbing.divisi,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" } // Token berlaku 7 hari
    );

    // Kirim email credentials (opsional)
    try {
      await sendMail(
        email,
        "Akun Pembimbing Magang",
        `Berikut adalah kredensial akun Anda:\n\nEmail: ${email}\nPassword: ${password}\n\nSilakan login di http://localhost:3000/login`
      );
    } catch (emailError) {
      console.error("Gagal mengirim email:", emailError);
      // Lanjutkan meskipun gagal kirim email
    }

    // Response tanpa menyertakan password
    res.status(201).json({
      success: true,
      message: "Berhasil tambah pembimbing",
      data: {
        _id: pembimbing._id,
        nama: pembimbing.nama,
        email: pembimbing.email,
        divisi: pembimbing.divisi,
        status: pembimbing.status,
        token, // Sertakan token dalam response
      },
    });
  } catch (err) {
    console.error("Error:", err);

    // Handle error spesifik MongoDB
    if (err.name === "MongoError" && err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar",
        error: err.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Gagal menambah pembimbing",
      error: err.message,
    });
  }
});

// Hapus pembimbing
app.delete("/api/pembimbing/:id", async (req, res) => {
  try {
    await Pembimbing.findByIdAndDelete(req.params.id);
    res.json({ message: "Pembimbing berhasil dihapus" });
  } catch (err) {
    res.status(500).json({ message: "Gagal menghapus pembimbing" });
  }
});

//Ubah Status admin
app.patch(
  "/api/pendaftaran/:id/status",
  upload.single("suratBalasan"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, komentar } = req.body;
      const suratBalasan = req.file?.filename;

      // Validasi
      if (!status) {
        return res.status(400).json({ message: "Status is required" });
      }

      const updateData = { status };
      if (komentar) updateData.komentar = komentar;
      if (suratBalasan) updateData.suratBalasan = suratBalasan;

      const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      if (!updated) {
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      // Kirim email notifikasi jika status disetujui
      if (status === "disetujui") {
        try {
          await sendMail(
            updated.email,
            "Status Pendaftaran Magang",
            `Pendaftaran magang Anda telah disetujui. Silakan lihat surat balasan di aplikasi.`
          );
        } catch (emailError) {
          console.error("Gagal mengirim email notifikasi:", emailError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Gagal memperbarui status" });
    }
  }
);

// Ubah status aktif/tidak aktif
app.patch("/api/pembimbing/:id/status", async (req, res) => {
  try {
    const pembimbing = await Pembimbing.findById(req.params.id);
    if (!pembimbing)
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });

    pembimbing.status = req.body.status;
    await pembimbing.save();
    res.json({ message: "Status diperbarui", data: pembimbing });
  } catch (err) {
    res.status(500).json({ message: "Gagal memperbarui status pembimbing" });
  }
});

// Mendapatkan semua data pendaftar
app.get("/api/pendaftaran", async (req, res) => {
  try {
    const data = await Pendaftaran.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (error) {
    console.error("Error fetching pendaftaran:", error);
    res.status(500).json({ error: "Gagal mengambil data pendaftaran" });
  }
});

// // Mendapatkan data pendaftar berdasarkan ID
// app.get("/api/pendaftaran/:id", async (req, res) => {
//   const { id } = req.params;

//   // 🛡️ Validasi agar hanya ObjectId yang masuk
//   if (!mongoose.Types.ObjectId.isValid(id)) {
//     return res.status(400).json({ message: "ID tidak valid" });
//   }

//   try {
//     const pendaftaran = await Pendaftaran.findById(id);
//     if (!pendaftaran) {
//       return res.status(404).json({ message: "Pendaftaran tidak ditemukan" });
//     }
//     res.json(pendaftaran);
//   } catch (error) {
//     console.error("Error fetching pendaftaran by ID:", error);
//     res.status(500).json({ message: "Gagal mengambil data pendaftaran" });
//   }
// });

// Mendapatkan data pendaftaran berdasarkan ID
app.get("/api/pendaftaran/:id", async (req, res) => {
  try {
    const pendaftaran = await Pendaftaran.findById(req.params.id);
    if (!pendaftaran) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }
    res.json(pendaftaran);
  } catch (error) {
    console.error("Error fetching pendaftaran:", error);
    res.status(500).json({ error: "Gagal mengambil data pendaftaran" });
  }
});

// Update pendaftaran dengan dokumen baru
app.put(
  "/api/pendaftaran/:id/dokumen",
  upload.fields([
    { name: "suratPengantar" },
    { name: "cv" },
    { name: "foto" },
    { name: "ktm" },
    { name: "transkrip" },
    { name: "rekomendasi" },
  ]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = {
        status: "pending", // Reset status ke pending saat edit
        updatedAt: new Date(),
      };

      // Tambahkan file baru jika ada
      if (req.files?.suratPengantar?.[0]) {
        updateData.suratPengantar = req.files.suratPengantar[0].filename;
      }
      if (req.files?.cv?.[0]) {
        updateData.cv = req.files.cv[0].filename;
      }
      if (req.files?.foto?.[0]) {
        updateData.foto = req.files.foto[0].filename;
      }
      if (req.files?.ktm?.[0]) {
        updateData.ktm = req.files.ktm[0].filename;
      }
      if (req.files?.transkrip?.[0]) {
        updateData.transkrip = req.files.transkrip[0].filename;
      }
      if (req.files?.rekomendasi?.[0]) {
        updateData.rekomendasi = req.files.rekomendasi[0].filename;
      }

      const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating documents:", error);
      res.status(500).json({ error: "Gagal memperbarui dokumen" });
    }
  }
);

// Mengupdate data pendaftar (untuk edit)
app.put("/api/pendaftaran/:id", async (req, res) => {
  try {
    const updated = await Pendaftaran.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating pendaftaran:", error);
    res.status(500).json({ error: "Gagal memperbarui data" });
  }
});

// Upload file PDF (untuk surat balasan)
app.post("/api/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      message: "File uploaded successfully",
      fileName: req.file.filename,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Error uploading file" });
  }
});

// Mengupdate status pendaftaran (setujui/tolak/perbaiki)
app.patch("/api/pendaftaran/:id/status", async (req, res) => {
  try {
    const { status, komentar, suratBalasan } = req.body;

    // Validasi
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    // Validasi khusus untuk status disetujui
    if (status === "disetujui" && !suratBalasan) {
      return res.status(400).json({
        message: "Surat balasan wajib diisi untuk status disetujui",
      });
    }

    const updateData = {
      status,
      updatedAt: new Date(),
      ...(komentar && { komentar }),
      ...(suratBalasan && { suratBalasan }),
    };

    const updated = await Pendaftaran.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    // Kirim email notifikasi jika status disetujui
    if (status === "disetujui") {
      try {
        await sendMail(
          updated.email,
          "Status Pendaftaran Magang",
          `Pendaftaran magang Anda telah disetujui. Silakan login untuk melihat surat balasan.`
        );
      } catch (emailError) {
        console.error("Gagal mengirim email:", emailError);
      }
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating status:", error);
    res.status(500).json({ error: "Gagal memperbarui status" });
  }
});

// Endpoint untuk pendaftaran baru
app.post(
  "/api/pendaftaran",
  upload.fields([
    { name: "suratPengantar", maxCount: 1 },
    { name: "cv", maxCount: 1 },
    { name: "foto", maxCount: 1 },
    { name: "ktm", maxCount: 1 },
    { name: "transkrip", maxCount: 1 },
    { name: "rekomendasi", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const email = req.body.email;

      // Cek apakah email sudah terdaftar
      const existing = await Pendaftaran.findOne({ email });
      if (existing) {
        // Hapus file yang sudah diupload jika pendaftaran gagal
        if (req.files) {
          Object.values(req.files).forEach((fileArray) => {
            if (fileArray && fileArray[0]) {
              fs.unlinkSync(
                path.join(__dirname, "uploads", fileArray[0].filename)
              );
            }
          });
        }
        return res.status(409).json({
          message: "Email sudah digunakan untuk mendaftar",
        });
      }

      // Buat data pendaftaran baru
      const newPendaftaran = new Pendaftaran({
        ...req.body,
        status: "pending", // Default status
        suratPengantar: req.files?.suratPengantar?.[0]?.filename || "",
        cv: req.files?.cv?.[0]?.filename || "",
        foto: req.files?.foto?.[0]?.filename || "",
        ktm: req.files?.ktm?.[0]?.filename || "",
        transkrip: req.files?.transkrip?.[0]?.filename || "",
        rekomendasi: req.files?.rekomendasi?.[0]?.filename || "",
      });

      await newPendaftaran.save();

      // Kirim email konfirmasi
      await sendMail(
        email,
        "Pendaftaran Magang Diterima",
        `Terima kasih telah mendaftar magang. Pendaftaran Anda sedang diproses.`
      );

      res.status(201).json({
        message: "Pendaftaran berhasil disimpan",
        data: newPendaftaran,
      });
    } catch (err) {
      console.error("Gagal menyimpan pendaftaran:", err);

      // Hapus file yang sudah diupload jika pendaftaran gagal
      if (req.files) {
        Object.values(req.files).forEach((fileArray) => {
          if (fileArray && fileArray[0]) {
            fs.unlinkSync(
              path.join(__dirname, "uploads", fileArray[0].filename)
            );
          }
        });
      }

      if (err.code === 11000 && err.keyPattern.email) {
        return res.status(409).json({
          message: "Email sudah digunakan untuk mendaftar",
        });
      }
      res.status(500).json({ message: "Gagal menyimpan pendaftaran" });
    }
  }
);

app.put("/api/user/:id/edit-profile", async (req, res) => {
  try {
    // Verify token first
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify the user is editing their own profile
    if (decoded.id !== req.params.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { id } = req.params;
    const { name, phone, birthDate, gender, address, profilePicture } =
      req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({ message: "Nama lengkap wajib diisi" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      id,
      {
        name,
        phone,
        birthDate,
        gender,
        address,
        profilePicture,
      },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove sensitive data before sending response
    const userResponse = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      birthDate: updatedUser.birthDate,
      gender: updatedUser.gender,
      address: updatedUser.address,
      profilePicture: updatedUser.profilePicture,
      role: updatedUser.role,
    };

    res.status(200).json({
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error updating profile:", error);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid token" });
    }

    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((val) => val.message);
      return res.status(400).json({
        message: "Validation error",
        errors: messages,
      });
    }

    res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

// Get user's internship history
app.get("/api/riwayat", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token kedaluwarsa" });
      }
      return res.status(403).json({ message: "Token tidak valid" });
    }

    const riwayat = await Pendaftaran.find({ email: decoded.email }).sort({
      createdAt: -1,
    });

    res.json(riwayat);
  } catch (error) {
    console.error("Error fetching riwayat:", error);
    res.status(500).json({ message: "Gagal mengambil data riwayat" });
  }
});

// Update internship period
app.put("/api/riwayat/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { mulai, selesai } = req.body;

    // Find the registration
    const pendaftaran = await Pendaftaran.findOne({
      _id: req.params.id,
      email: decoded.email,
    });

    if (!pendaftaran) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    // Only allow editing if status is still pending
    if (pendaftaran.status !== "pending") {
      return res.status(400).json({
        message: "Hanya bisa mengedit jika status masih diproses",
      });
    }

    pendaftaran.mulai = mulai;
    pendaftaran.selesai = selesai;
    await pendaftaran.save();

    res.json({ message: "Periode magang berhasil diperbarui" });
  } catch (error) {
    console.error("Error updating riwayat:", error);
    res.status(500).json({ message: "Gagal memperbarui data" });
  }
});

// Upload final report
app.post(
  "/api/riwayat/:id/laporan",
  upload.single("laporanAkhir"),
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!req.file) {
        return res.status(400).json({ message: "File tidak ditemukan" });
      }

      const pendaftaran = await Pendaftaran.findOne({
        _id: req.params.id,
        email: decoded.email,
        status: "disetujui", // Only allow upload if approved
      });

      if (!pendaftaran) {
        // Delete the uploaded file if registration not found
        fs.unlinkSync(req.file.path);
        return res
          .status(404)
          .json({ message: "Data tidak ditemukan atau tidak disetujui" });
      }

      // Delete old report if exists
      if (pendaftaran.laporanAkhir) {
        const oldPath = path.join(
          __dirname,
          "uploads",
          pendaftaran.laporanAkhir
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      pendaftaran.laporanAkhir = req.file.filename;
      await pendaftaran.save();

      res.json({ message: "Laporan akhir berhasil diunggah" });
    } catch (error) {
      console.error("Error uploading laporan:", error);
      res.status(500).json({ message: "Gagal mengunggah laporan" });
    }
  }
);

// Endpoint untuk download file
app.get("/api/download/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ message: "File not found" });
  }
});

// Get statistics
app.get("/api/statistik", async (req, res) => {
  try {
    const data = await Pendaftaran.find();
    const totalPendaftar = data.length;
    const totalDisetujui = data.filter((p) => p.status === "disetujui").length;
    const totalMenunggu = data.filter((p) => p.status === "pending").length;
    const totalLogbook = data.reduce(
      (acc, curr) => acc + (curr.logbooks ? curr.logbooks.length : 0),
      0
    );

    res.json({
      totalPendaftar,
      totalDisetujui,
      totalMenunggu,
      totalLogbook,
    });
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil statistik" });
  }
});

// Get recent activities
app.get("/api/aktivitas-terbaru", async (req, res) => {
  try {
    // Get recent registration status changes
    const pendaftaran = await Pendaftaran.find()
      .sort({ updatedAt: -1 })
      .limit(10);

    const activities = pendaftaran.map((p) => ({
      type:
        p.status === "disetujui"
          ? "disetujui"
          : p.status === "ditolak"
          ? "ditolak"
          : p.status === "perbaiki"
          ? "perbaiki"
          : "pendaftaran",
      message:
        p.status === "disetujui"
          ? `Pendaftaran ${p.nama} disetujui`
          : p.status === "ditolak"
          ? `Pendaftaran ${p.nama} ditolak`
          : p.status === "perbaiki"
          ? `Pendaftaran ${p.nama} perlu perbaikan`
          : `Pendaftaran baru dari ${p.nama}`,
      timestamp: p.updatedAt,
    }));

    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: "Gagal mengambil aktivitas" });
  }
});

// 📧 Endpoint untuk mengirim email credentials
app.post("/api/send-credentials", async (req, res) => {
  const { email, password, role } = req.body;

  try {
    await sendMail(
      email,
      "Akun Pembimbing Magang",
      `Berikut adalah kredensial akun Anda:\n\nEmail: ${email}\nPassword: ${password}\nRole: ${role}\n\nSilakan login di http://localhost:3000/login`
    );

    res.status(200).json({ message: "Email berhasil dikirim" });
  } catch (error) {
    console.error("Gagal mengirim email:", error);
    res.status(500).json({ message: "Gagal mengirim email" });
  }
});

// 🔐 LOGIN PEMBIMBING
app.post("/api/pembimbing/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Cari pembimbing berdasarkan email
    const pembimbing = await Pembimbing.findOne({ email }).select("+password");
    if (!pembimbing) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    // 2. Verifikasi password
    const isPasswordValid = await bcrypt.compare(password, pembimbing.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Password salah" });
    }

    // 3. Buat token JWT
    const token = jwt.sign(
      {
        id: pembimbing._id,
        email: pembimbing.email,
        nama: pembimbing.nama,
        divisi: pembimbing.divisi,
        role: "pembimbing",
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 4. Kirim response
    res.status(200).json({
      token,
      user: {
        id: pembimbing._id,
        nama: pembimbing.nama,
        email: pembimbing.email,
        divisi: pembimbing.divisi,
        role: "pembimbing",
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server" });
  }
});

// API endpoint to update pendaftaran with pembimbing
app.patch("/api/pendaftaran/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating pendaftaran:", error);
    res.status(500).json({ error: "Gagal memperbarui data" });
  }
});

// API endpoint to increment pembimbing's jumlahMahasiswa
app.patch("/api/pembimbing/:id/tambah-mahasiswa", async (req, res) => {
  try {
    const pembimbing = await Pembimbing.findById(req.params.id);
    if (!pembimbing) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    pembimbing.jumlahMahasiswa = (pembimbing.jumlahMahasiswa || 0) + 1;
    await pembimbing.save();

    res.json({
      message: "Jumlah mahasiswa berhasil ditambahkan",
      data: pembimbing,
    });
  } catch (error) {
    console.error("Error updating pembimbing:", error);
    res.status(500).json({ error: "Gagal memperbarui pembimbing" });
  }
});

// Get pendaftaran by email
app.get("/api/pendaftaran/email/:email", async (req, res) => {
  try {
    const data = await Pendaftaran.findOne({ email: req.params.email });
    if (!data) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Gagal mengambil data pendaftaran" });
  }
});

//tambahkan endpoint untuk assign pembimbing
app.patch("/api/pendaftaran/:id/assign-pembimbing", async (req, res) => {
  try {
    const { pembimbingId } = req.body;

    const updated = await Pendaftaran.findByIdAndUpdate(
      req.params.id,
      { pembimbing: pembimbingId },
      { new: true }
    ).populate("pembimbing");

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Gagal assign pembimbing" });
  }
});

// API endpoint to decrement pembimbing's jumlahMahasiswa
app.patch("/api/pembimbing/:id/kurangi-mahasiswa", async (req, res) => {
  try {
    const pembimbing = await Pembimbing.findById(req.params.id);
    if (!pembimbing) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    // Pastikan jumlah tidak kurang dari 0
    pembimbing.jumlahMahasiswa = Math.max(
      0,
      (pembimbing.jumlahMahasiswa || 0) - 1
    );
    await pembimbing.save();

    res.json({
      message: "Jumlah mahasiswa berhasil dikurangi",
      data: pembimbing,
    });
  } catch (error) {
    console.error("Error updating pembimbing:", error);
    res.status(500).json({ error: "Gagal memperbarui pembimbing" });
  }
});

// Add this endpoint for certificate upload
app.post("/api/upload-certificate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      message: "File uploaded successfully",
      fileName: req.file.filename,
    });
  } catch (error) {
    console.error("Error uploading certificate:", error);
    res.status(500).json({ message: "Error uploading certificate" });
  }
});

// Add this endpoint to update pendaftaran with certificate
app.patch("/api/pendaftaran/:id/certificate", async (req, res) => {
  try {
    const { id } = req.params;
    const { certificate } = req.body;

    // Delete old certificate if exists
    const existing = await Pendaftaran.findById(id);
    if (existing.certificate) {
      const oldPath = path.join(__dirname, "uploads", existing.certificate);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const updated = await Pendaftaran.findByIdAndUpdate(
      id,
      { certificate },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating certificate:", error);
    res.status(500).json({ error: "Gagal memperbarui sertifikat" });
  }
});

// Upload sertifikat
app.post("/api/upload-certificate", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    res.json({
      message: "File uploaded successfully",
      fileName: req.file.filename,
    });
  } catch (error) {
    console.error("Error uploading certificate:", error);
    res.status(500).json({ message: "Error uploading certificate" });
  }
});

// Update pendaftaran dengan sertifikat
app.patch("/api/pendaftaran/:id/certificate", async (req, res) => {
  try {
    const { id } = req.params;
    const { certificate } = req.body;

    // Hapus sertifikat lama jika ada
    const existing = await Pendaftaran.findById(id);
    if (existing.certificate) {
      const oldPath = path.join(__dirname, "uploads", existing.certificate);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const updated = await Pendaftaran.findByIdAndUpdate(
      id,
      {
        certificate,
        certificateUploadDate: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Data tidak ditemukan" });
    }

    res.json(updated);
  } catch (error) {
    console.error("Error updating certificate:", error);
    res.status(500).json({ error: "Gagal memperbarui sertifikat" });
  }
});

app.get("/api/download/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads", req.params.filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ message: "File not found" });
  }
});

// Endpoint untuk menampilkan mahasiswa yang sudah dibimbing
app.get("/api/pembimbing/:id/mahasiswa", async (req, res) => {
  try {
    const pembimbingId = req.params.id;

    // Find all Pendaftaran records that have this pembimbing assigned
    const mahasiswa = await Pendaftaran.find({
      pembimbing: pembimbingId,
      status: "disetujui", // Only include approved students
    }).select("nama institusi prodi status mulai selesai");

    res.status(200).json(mahasiswa);
  } catch (error) {
    console.error("Error fetching mahasiswa:", error);
    res.status(500).json({ message: "Gagal mengambil data mahasiswa" });
  }
});

// In server.js, update the endpoint to handle both cases
app.get("/api/logbook/pdf/:userId", async (req, res) => {
  try {
    // Get user data
    const user = await Pendaftaran.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get logbooks - either all or filtered by date if query params exist
    let query = { userId: req.params.userId };

    if (req.query.startDate && req.query.endDate) {
      query.tanggal = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate),
      };
    }

    const logbooks = await Logbook.find(query).sort({ tanggal: 1 });

    // Create PDF document
    const doc = new PDFDocument();

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Logbook_${user.nama}.pdf"`
    );

    // Pipe the PDF to response
    doc.pipe(res);

    doc.end();
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).json({ error: "Gagal menghasilkan PDF" });
  }
});
