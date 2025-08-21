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

//########################################################################################################################################################################
// mongoDB Check | Limit ation: 500MB | multer
//########################################################################################################################################################################

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

const laporanStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads/laporan");
    if (!fs.existsSync(uploadPath))
      fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const uploadLaporan = multer({
  storage: laporanStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

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

//########################################################################################################################################################################
// (Backend) Login,Register,Lupa Passowrd,Reset Password, verifikasi Email, Sendemail, Logout
//########################################################################################################################################################################

// 📩 API REGISTER (OTP)
app.post("/api/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(400).json({ message: "Email sudah terdaftar" });

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

    // Template email dalam Bahasa Indonesia
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        <div style="background: #2563eb; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0;">Selamat Datang di MAGIN</h1>
          <p style="color: white; margin: 5px 0 0; font-size: 14px;">Sistem Magang Kominfo</p>
        </div>
        
        <div style="padding: 30px;">
          <p style="font-size: 16px;">Halo ${name},</p>
          <p style="font-size: 16px;">Terima kasih telah mendaftar. Silakan gunakan kode OTP berikut untuk menyelesaikan verifikasi:</p>
          
          <div style="background: #f8f9fa; border-radius: 6px; padding: 15px; text-align: center; margin: 25px 0; font-size: 24px; letter-spacing: 3px; font-weight: bold; color: #2563eb;">
            ${otp}
          </div>
          
          <p style="font-size: 14px; color: #666;">Kode OTP ini berlaku selama 15 menit. Jangan berikan kode ini kepada siapapun.</p>
          
          <p style="font-size: 16px;">Jika Anda tidak merasa melakukan pendaftaran ini, abaikan email ini.</p>
        </div>
        
        <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #666;">
          <p>© ${new Date().getFullYear()} MAGIN - Sistem Magang Kominfo. Hak cipta dilindungi.</p>
        </div>
      </div>
      `;

    // Versi teks biasa
    const emailText = `
      Selamat Datang di MAGIN - Sistem Magang Kominfo
      
      Halo ${name},
      
      Terima kasih telah mendaftar. Silakan gunakan kode OTP berikut untuk menyelesaikan verifikasi:
      
      Kode OTP: ${otp}
      
      Kode ini berlaku selama 15 menit. Jangan berikan kode ini kepada siapapun.
      
      Jika Anda tidak merasa melakukan pendaftaran ini, abaikan email ini.
      
      © ${new Date().getFullYear()} MAGIN - Sistem Magang Kominfo. Hak cipta dilindungi.
      `;

    await sendMail(
      email,
      "🔐 Kode Verifikasi MAGIN - Harap Segera Diverifikasi", // Subjek email
      emailText, // Versi teks biasa
      emailHtml // Versi HTML
    );

    res.status(200).json({ message: "OTP telah dikirim ke email Anda", token });
  } catch (error) {
    console.error("Error saat menyimpan user atau mengirim OTP:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server" });
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

    // Modern email template in Bahasa Indonesia
    const emailHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <div style="background: linear-gradient(135deg, #2563eb, #1e40af); padding: 25px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Permintaan Reset Password</h1>
          <p style="color: rgba(255, 255, 255, 0.9); margin: 5px 0 0; font-size: 14px;">MAGIN - Sistem Magang Kominfo</p>
        </div>
        
        <div style="padding: 30px; background: #ffffff;">
          <p style="font-size: 16px; line-height: 1.5;">Halo,</p>
          <p style="font-size: 16px; line-height: 1.5;">Kami menerima permintaan reset password untuk akun Anda. Silakan klik tombol di bawah ini untuk melanjutkan:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">Reset Password</a>
          </div>
          
          <p style="font-size: 14px; color: #666; line-height: 1.5;">Atau salin dan tempel link berikut di browser Anda:<br>
          <span style="word-break: break-all; color: #2563eb;">${resetLink}</span></p>
          
          <p style="font-size: 14px; color: #666; line-height: 1.5;">Link ini akan kadaluarsa dalam 15 menit. Jika Anda tidak meminta reset password, abaikan email ini.</p>
        </div>
        
        <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
          <p>© ${new Date().getFullYear()} MAGIN - Sistem Magang Kominfo. Hak cipta dilindungi.</p>
        </div>
      </div>
      `;

    // Plain text version
    const emailText = `
      Permintaan Reset Password - MAGIN
      
      Halo,
      
      Kami menerima permintaan reset password untuk akun Anda. 
      Silakan gunakan link berikut untuk melanjutkan:
      
      ${resetLink}
      
      Link ini akan kadaluarsa dalam 15 menit.
      Jika Anda tidak meminta reset password, abaikan email ini.
      
      © ${new Date().getFullYear()} MAGIN - Sistem Magang Kominfo
      `;

    await sendMail(
      email,
      "🔑 Permintaan Reset Password - MAGIN",
      emailText,
      emailHtml
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

//################################################################################################################################################################################################################################
// (Backend) pendaftaran magang, Ambil Data peserta Magang, Update data pendaftar (edit atau setujui/tolak),Ambil Riwayat, ambil data pembimbing, Buat Akun Pembimbing, Kirim email Pemimbing
//################################################################################################################################################################################################################################

//################################################################################################################################################################################################################################
// (Backend) hapus Akun pembimbing | Ubah Status Peserta Magang di dashboard admin | Ubah status aktif/tidak aktif akun pembimbing | ambil semua data pendaftar | Ubah pendaftaran dengan dokumen baru |
//################################################################################################################################################################################################################################

//################################################################################################################################################################################################################################
// (Backend) edit data peserta (admin) | Upload Surat balasan | Mengupdate status pendaftaran (setujui/tolak/perbaiki) | pendaftaran baru? | Data Riwayat peserta Magang |  Update Masa Magang | upload laporan akhir |
//################################################################################################################################################################################################################################

//################################################################################################################################################################################################################################
// (Backend) download file | tampilan Aktifitas
//################################################################################################################################################################################################################################

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

// Ambil Data peserta Magang
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
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password minimal 6 karakter",
      });
    }

    const existing = await Pembimbing.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Email sudah digunakan",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Buat pembimbing baru
    const pembimbing = new Pembimbing({
      nama,
      email,
      password: hashedPassword,
      divisi,
    });

    await pembimbing.save();

    const token = jwt.sign(
      {
        id: pembimbing._id,
        email: pembimbing.email,
        role: "pembimbing",
        divisi: pembimbing.divisi,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Kirim email credentials (opsional)
    try {
      await sendMail(
        email,
        "Informasi Akun Pembimbing Magang",
        `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #333;">
        <h2 style="color: #1E3A8A;">Selamat Datang di Sistem Magang Kominfo</h2>
        <p>Berikut adalah kredensial akun Anda sebagai Pembimbing Magang:</p>
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Password:</strong> ${password}</li>
        </ul>
        <p>Silakan login ke sistem melalui tautan berikut:</p>
        <a href="http://localhost:3000/login" style="color: #2563EB; text-decoration: none;">http://localhost:3000/login</a>
        <p>Jika Anda tidak merasa mendaftarkan akun ini, silakan abaikan email ini.</p>
        <br />
        <p>Hormat kami,<br /><strong>Tim Magang Kominfo Palembang</strong></p>
      </div>
      `
      );
    } catch (emailError) {
      console.error("Gagal mengirim email:", emailError);
      // Lanjutkan meskipun gagal kirim email
    }

    res.status(201).json({
      success: true,
      message: "Berhasil tambah pembimbing",
      data: {
        _id: pembimbing._id,
        nama: pembimbing.nama,
        email: pembimbing.email,
        divisi: pembimbing.divisi,
        status: pembimbing.status,
        token,
      },
    });
  } catch (err) {
    console.error("Error:", err);
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

//Ubah Status Peserta Magang di dashboard admin
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
            `Halo,

  Selamat! Pendaftaran magang Anda telah disetujui ✅

  Silakan login ke aplikasi untuk melihat dan mengunduh surat balasan resmi Anda.

  Terima kasih,
  Magin | KOMINFO Kota Palembang`
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

    console.log("File uploaded:", {
      originalname: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });

    // Pastikan file tersimpan
    const filePath = path.join(__dirname, "uploads", req.file.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error("File gagal disimpan");
    }

    res.json({
      message: "File uploaded successfully",
      fileName: req.file.filename,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    // Hapus file jika gagal
    if (req.file) {
      fs.unlinkSync(path.join(__dirname, "uploads", req.file.filename));
    }
    res.status(500).json({ message: "Error uploading file" });
  }
});

// Mengupdate status pendaftaran (setujui/tolak/perbaiki)
app.patch(
  "/api/pendaftaran/:id/status",
  upload.single("suratBalasan"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, komentar } = req.body;
      const suratBalasan = req.file?.filename; // Pastikan ini terisi

      const updateData = {
        status,
        updatedAt: new Date(),
        ...(komentar && { komentar }),
        ...(suratBalasan && { suratBalasan }), // Pastikan ini tersimpan
      };

      const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
        new: true,
      });

      res.json(updated);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Gagal memperbarui status" });
    }
  }
);

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
        "Konfirmasi Pendaftaran Magang",
        `
    Halo ${email},

    Terima kasih telah melakukan pendaftaran program magang di Kominfo Kota Palembang.
    Saat ini, pendaftaran Anda sedang kami proses.

    Anda akan menerima pemberitahuan selanjutnya setelah proses verifikasi selesai.

    Hormat kami,  
    Magin | Sistem magang Kominfo Kota Palembang
    `
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

// app.put("/api/user/:id/edit-profile", async (req, res) => {
//   try {
//     // Verify token first
//     const token = req.headers.authorization?.split(" ")[1];
//     if (!token) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     // Verify the user is editing their own profile
//     if (decoded.id !== req.params.id) {
//       return res.status(403).json({ message: "Forbidden" });
//     }

//     const { id } = req.params;
//     const { name, phone, birthDate, gender, address, profilePicture } =
//       req.body;

//     // Validate required fields
//     if (!name) {
//       return res.status(400).json({ message: "Nama lengkap wajib diisi" });
//     }

//     const updatedUser = await User.findByIdAndUpdate(
//       id,
//       {
//         name,
//         phone,
//         birthDate,
//         gender,
//         address,
//         profilePicture,
//       },
//       { new: true, runValidators: true }
//     );

//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // Remove sensitive data before sending response
//     const userResponse = {
//       _id: updatedUser._id,
//       name: updatedUser.name,
//       email: updatedUser.email,
//       phone: updatedUser.phone,
//       birthDate: updatedUser.birthDate,
//       gender: updatedUser.gender,
//       address: updatedUser.address,
//       profilePicture: updatedUser.profilePicture,
//       role: updatedUser.role,
//     };

//     res.status(200).json({
//       message: "Profile updated successfully",
//       user: userResponse,
//     });
//   } catch (error) {
//     console.error("Error updating profile:", error);

//     if (error.name === "JsonWebTokenError") {
//       return res.status(401).json({ message: "Invalid token" });
//     }

//     if (error.name === "ValidationError") {
//       const messages = Object.values(error.errors).map((val) => val.message);
//       return res.status(400).json({
//         message: "Validation error",
//         errors: messages,
//       });
//     }

//     res.status(500).json({
//       message: "Failed to update profile",
//       error: error.message,
//     });
//   }
// });

// Data Riwayat peserta Magang
app.get("/api/riwayat", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tidak perlu .select("+suratBalasan") karena field selalu diinclude
    const riwayat = await Pendaftaran.find({ email: decoded.email })
      .populate("pembimbing", "nama divisi")
      .sort({ createdAt: -1 });

    console.log(
      "Data riwayat yang dikirim:",
      riwayat.map((r) => ({
        _id: r._id,
        nama: r.nama,
        status: r.status,
        suratBalasan: r.suratBalasan,
        hasSuratBalasan: !!r.suratBalasan,
      }))
    );

    res.json(riwayat);
  } catch (error) {
    console.error("Error fetching riwayat:", error);
    res.status(500).json({ message: "Gagal mengambil data riwayat" });
  }
});

// Update Masa Magang
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

// Endpoint untuk upload laporan akhir
app.post(
  "/api/pendaftaran/:pendaftaranId/laporan",
  uploadLaporan.single("laporan"),
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded) {
        return res.status(401).json({ message: "Token tidak valid" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "File tidak ditemukan" });
      }

      const pendaftaran = await Pendaftaran.findById(req.params.pendaftaranId);
      if (!pendaftaran) {
        // Hapus file yang sudah diupload jika pendaftaran tidak ditemukan
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Data tidak ditemukan" });
      }

      // Hapus laporan lama jika ada
      if (pendaftaran.laporanAkhir) {
        const oldPath = path.join(
          __dirname,
          "uploads/laporan",
          pendaftaran.laporanAkhir
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      pendaftaran.laporanAkhir = req.file.filename;
      pendaftaran.laporanUploadDate = new Date();
      await pendaftaran.save();

      res.json({
        message: "Laporan akhir berhasil diunggah",
        filename: req.file.filename,
      });
    } catch (error) {
      console.error("Error uploading laporan:", error);
      // Hapus file jika ada error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ message: "Gagal mengunggah laporan" });
    }
  }
);

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

// Tampilakan Aktifitas
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

//################################################################################################################################################################################################################################
// (Backend) Email Pembimbing | Login Pembimbing | Update Pendaftar dgn pembimbing |  pembimbing jumlahMahasiswa | Ambil Pendaftar lewat email | endpoint untuk assign pembimbing | Kurangi Jumlah mahasiswa | Upload sertifikat
//################################################################################################################################################################################################################################
//################################################################################################################################################################################################################################
// (Backend) Update Pendafaran dgn sertifikat | Download? | mendapatkan mahasiswa bimbingan berdasarkan ID pembimbing | Admin logbook endpoint | Get pembimbing data by token |  Endpoint Pembimbing dan peserta lo
//################################################################################################################################################################################################################################
//################################################################################################################################################################################################################################
// (Backend) upload laporan akhir |  endpoint for report verification |
//################################################################################################################################################################################################################################

// 📧 Endpoint untuk mengirim email credentials
app.post("/api/send-credentials", async (req, res) => {
  const { email, password, role } = req.body;

  try {
    await sendMail(
      email,
      "Informasi Akun Pembimbing Magang",
      `
    Halo ${email},

    Selamat! Anda telah ditambahkan sebagai pembimbing magang pada sistem magang Kominfo Kota Palembang.

    Berikut adalah informasi akun Anda:

    📧 Email   : ${email}  
    🔑 Password: ${password}  
    🧑‍💼 Role   : ${role}

    Silakan login ke sistem melalui tautan berikut:  
    👉 http://localhost:3000/login

    Demi keamanan, mohon segera ganti password Anda setelah login pertama.

    Hormat kami,  
    Tim Magang Kominfo Kota Palembang
    `
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

// Update Pendaftar dgn pembimbing
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

// pembimbing jumlahMahasiswa
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

// Ambil Pendaftar lewat email
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

// Kurangi Jumlah mahasiswa
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

// Update Pendafaran dgn sertifikat
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

// Endpoint untuk download laporan akhir
app.get("/api/download-laporan/:filename", (req, res) => {
  const filePath = path.join(__dirname, "uploads/laporan", req.params.filename);

  console.log("Mencari file laporan di:", filePath);

  if (fs.existsSync(filePath)) {
    console.log("File ditemukan, mengirim...");
    res.download(filePath, (err) => {
      if (err) {
        console.error("Error mengirim file:", err);
        res.status(500).json({ message: "Gagal mengunduh file" });
      }
    });
  } else {
    console.log("File tidak ditemukan:", filePath);
    res.status(404).json({ message: "Laporan tidak ditemukan" });
  }
});

// mendapatkan mahasiswa bimbingan berdasarkan ID pembimbing
app.get("/api/pembimbing/:id/mahasiswa", async (req, res) => {
  try {
    const pembimbingId = req.params.id;

    // 1. Verifikasi pembimbing
    const pembimbing = await Pembimbing.findById(pembimbingId);
    if (!pembimbing) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    // 2. Dapatkan mahasiswa bimbingan
    const mahasiswa = await Pendaftaran.find({
      pembimbing: pembimbingId,
      status: "disetujui",
    }).select(
      "nama namaLengkap email telepon institusi universitas prodi status mulai selesai divisi"
    );

    // 3. Format response
    res.status(200).json(
      mahasiswa.map((m) => ({
        _id: m._id,
        nama: m.nama || m.namaLengkap,
        email: m.email,
        telepon: m.telepon,
        institusi: m.institusi || m.universitas,
        prodi: m.prodi,
        status: m.status,
        mulai: m.mulai,
        selesai: m.selesai,
        divisi: m.divisi,
      }))
    );
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Server error" });
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

// Admin logbook endpoint
app.get("/api/logbook/admin", async (req, res) => {
  try {
    // Fetch all logbooks with populated user and pendaftaran data
    const logbooks = await Logbook.find()
      .populate({
        path: "user",
        select: "name email", // Only include name and email from user
      })
      .populate({
        path: "pendaftaran",
        select: "namaLengkap email universitas", // Only include these fields from pendaftaran
      })
      .sort({ createdAt: -1 }); // Sort by newest first

    // Format the response data
    const formattedLogbooks = logbooks.map((logbook) => ({
      _id: logbook._id,
      title: logbook.title,
      content: logbook.content,
      report: logbook.report,
      comment: logbook.comment,
      createdAt: logbook.createdAt,
      updatedAt: logbook.updatedAt,
      // Combine user and pendaftaran data
      user: logbook.user
        ? {
            _id: logbook.user._id,
            name: logbook.user.name,
            email: logbook.user.email,
          }
        : null,
      pendaftaran: logbook.pendaftaran
        ? {
            _id: logbook.pendaftaran._id,
            namaLengkap: logbook.pendaftaran.namaLengkap,
            email: logbook.pendaftaran.email,
            universitas: logbook.pendaftaran.universitas,
          }
        : null,
    }));

    res.status(200).json(formattedLogbooks);
  } catch (error) {
    console.error("Error fetching admin logbooks:", error);
    res.status(500).json({ message: "Gagal memuat data logbook" });
  }
});

// // Add comment to logbook
// app.patch("/api/logbook/:id/comment", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { comment } = req.body;

//     const updatedLogbook = await Logbook.findByIdAndUpdate(
//       id,
//       { comment },
//       { new: true }
//     ).populate("pendaftaran", "namaLengkap email");

//     if (!updatedLogbook) {
//       return res.status(404).json({ message: "Logbook tidak ditemukan" });
//     }

//     res.json(updatedLogbook);
//   } catch (error) {
//     console.error("Error adding comment:", error);
//     res.status(500).json({ message: "Gagal menambahkan komentar" });
//   }
// });

// Get pembimbing data by token
app.get("/api/pembimbing/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const pembimbing = await Pembimbing.findById(decoded.id).select(
      "-password"
    );

    if (!pembimbing) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    res.json(pembimbing);
  } catch (error) {
    console.error("Error fetching pembimbing data:", error);
    res.status(500).json({ message: "Gagal mengambil data pembimbing" });
  }
});

// Endpoint Pembimbing dan peserta lo
app.get("/api/pembimbing/:pembimbingId/logbooks", async (req, res) => {
  try {
    const { pembimbingId } = req.params;
    const user = await User.findById(pembimbingId).lean();

    if (!user) {
      return res.status(404).json({ message: "Pembimbing tidak ditemukan" });
    }

    // 1. Dapatkan semua mahasiswa yang dibimbing oleh pembimbing ini (baik by ID atau nama)
    const mahasiswa = await Pendaftaran.find({
      $or: [{ pembimbingId: pembimbingId }, { "pembimbing.nama": user.nama }],
    }).lean();

    if (!mahasiswa || mahasiswa.length === 0) {
      return res
        .status(404)
        .json({ message: "Tidak ada mahasiswa yang dibimbing" });
    }

    // 2. Untuk setiap mahasiswa, dapatkan data riwayat dan logbook
    const result = await Promise.all(
      mahasiswa.map(async (mhs) => {
        const riwayat = await Riwayat.findOne({ email: mhs.email }).lean();

        if (!riwayat) {
          return null;
        }

        const logbooks = await Logbook.find({ userId: riwayat._id })
          .sort({ tanggal: -1 })
          .lean();

        return {
          mahasiswa: {
            _id: mhs._id,
            nama: mhs.nama,
            email: mhs.email,
            institusi: mhs.institusi,
            divisi: mhs.divisi,
          },
          pembimbing: {
            id: pembimbingId,
            nama: user.nama,
            divisi: user.divisi,
          },
          periode: {
            mulai: riwayat.mulai,
            selesai: riwayat.selesai,
          },
          logbooks: logbooks.map((log) => ({
            id: log._id,
            kegiatan: log.kegiatan,
            tanggal: log.tanggal,
            status: log.status || "pending",
            deskripsi: log.deskripsi,
            createdAt: log.createdAt,
          })),
        };
      })
    );

    // Filter out null values (mahasiswa tanpa riwayat)
    const filteredResult = result.filter((item) => item !== null);

    res.json(filteredResult);
  } catch (error) {
    console.error("Error fetching logbooks:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Endpoint untuk upload laporan akhir
app.post(
  "/api/pendaftaran/:pendaftaranId/laporan",
  uploadLaporan.single("laporan"),
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1];
      if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded) {
        return res.status(401).json({ message: "Invalid token" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Validate file type
      const allowedTypes = [".pdf", ".doc", ".docx"];
      const fileExt = path.extname(req.file.originalname).toLowerCase();
      if (!allowedTypes.includes(fileExt)) {
        fs.unlinkSync(req.file.path); // Delete the uploaded file
        return res.status(400).json({
          message: "Invalid file type. Only PDF, DOC, and DOCX are allowed.",
        });
      }

      const pendaftaran = await Pendaftaran.findById(req.params.pendaftaranId);
      if (!pendaftaran) {
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Registration data not found" });
      }

      // Verify the user owns this registration
      if (pendaftaran.email !== decoded.email) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({
          message: "You can only upload reports for your own registration",
        });
      }

      // Verify status is approved
      if (pendaftaran.status !== "disetujui") {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          message: "Report can only be uploaded for approved registrations",
          currentStatus: pendaftaran.status,
        });
      }

      // Delete old report if exists
      if (pendaftaran.laporanAkhir) {
        const oldPath = path.join(
          __dirname,
          "uploads/laporan",
          pendaftaran.laporanAkhir
        );
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }

      pendaftaran.laporanAkhir = req.file.filename;
      pendaftaran.laporanUploadDate = new Date();
      pendaftaran.laporanVerified = false; // Reset verification status
      await pendaftaran.save();

      res.json({
        message: "Final report uploaded successfully",
        filename: req.file.filename,
        uploadDate: pendaftaran.laporanUploadDate,
      });
    } catch (error) {
      console.error("Error uploading report:", error);
      // Delete file if there was an error
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }

      if (error.name === "JsonWebTokenError") {
        return res.status(401).json({ message: "Invalid token" });
      }

      res.status(500).json({
        message: "Failed to upload report",
        error: error.message,
      });
    }
  }
);

// Add this endpoint for report verification
app.patch("/api/pendaftaran/:id/verify-laporan", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    const pendaftaran = await Pendaftaran.findById(req.params.id);
    if (!pendaftaran) {
      return res.status(404).json({ message: "Registration not found" });
    }

    if (!pendaftaran.laporanAkhir) {
      return res.status(400).json({ message: "No report to verify" });
    }

    pendaftaran.laporanVerified = true;
    pendaftaran.laporanVerificationDate = new Date();
    await pendaftaran.save();

    res.json({
      message: "Report verified successfully",
      verificationDate: pendaftaran.laporanVerificationDate,
    });
  } catch (error) {
    console.error("Error verifying report:", error);
    res.status(500).json({
      message: "Failed to verify report",
      error: error.message,
    });
  }
});

// Add comment to logbook
app.patch("/api/logbook/:id/comment", async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    // Verify token
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user is pembimbing or admin
    if (decoded.role !== "pembimbing" && decoded.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedLogbook = await Logbook.findByIdAndUpdate(
      id,
      {
        comment,
        status: comment ? "verified" : "pending", // Auto-verify when commented
      },
      { new: true }
    ).populate("pendaftaran", "namaLengkap email");

    if (!updatedLogbook) {
      return res.status(404).json({ message: "Logbook tidak ditemukan" });
    }

    res.json(updatedLogbook);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Gagal menambahkan komentar" });
  }
});

// Middleware authenticateToken - TAMBAHKAN INI JIKA BELUM ADA
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Token diperlukan" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: "Token tidak valid" });
    }
    req.user = decoded;
    next();
  });
};

// GET logbooks by mahasiswa ID - UNTUK PEMBIMBING DAN ADMIN
app.get(
  "/api/logbook/mahasiswa/:mahasiswaId",
  authenticateToken,
  async (req, res) => {
    try {
      const { mahasiswaId } = req.params;

      console.log("🔍 User accessing logbooks - Role:", req.user.role);
      console.log("🔍 User ID:", req.user.id);
      console.log("🔍 Mahasiswa ID:", mahasiswaId);

      // UBAH INI: Izinkan admin dan pembimbing
      if (req.user.role !== "pembimbing" && req.user.role !== "admin") {
        console.log("❌ Access denied - Role not allowed:", req.user.role);
        return res.status(403).json({
          message: "Hanya pembimbing dan admin yang dapat mengakses",
          userRole: req.user.role,
        });
      }

      console.log("✅ Access granted - Fetching logbooks...");

      // Dapatkan logbook berdasarkan pendaftaran ID
      const logbooks = await Logbook.find({ pendaftaran: mahasiswaId })
        .populate("user", "name email")
        .sort({ tanggal: -1, createdAt: -1 });

      console.log("✅ Found logbooks:", logbooks.length);
      res.status(200).json(logbooks);
    } catch (error) {
      console.error("❌ Error fetching mahasiswa logbooks:", error);
      res.status(500).json({
        message: "Gagal memuat logbook mahasiswa",
        error: error.message,
      });
    }
  }
);

// ADD COMMENT - FIXED VERSION
app.patch("/api/logbook/:id/comment", authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;

    // Pastikan user adalah pembimbing
    if (req.user.role !== "pembimbing") {
      return res
        .status(403)
        .json({ message: "Hanya pembimbing yang dapat memberikan komentar" });
    }

    const logbook = await Logbook.findById(id).populate("pendaftaran");

    if (!logbook) {
      return res.status(404).json({ message: "Logbook tidak ditemukan" });
    }

    // Verifikasi bahwa pembimbing adalah pembimbing mahasiswa ini
    if (logbook.pendaftaran.pembimbing.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ message: "Anda bukan pembimbing mahasiswa ini" });
    }

    const updatedLogbook = await Logbook.findByIdAndUpdate(
      id,
      {
        comment,
        commentedAt: new Date(),
        commentedBy: req.user.id,
        status: comment ? "dikomentari" : "menunggu",
      },
      { new: true }
    ).populate("commentedBy", "nama");

    res.json({
      message: "Komentar berhasil ditambahkan",
      logbook: updatedLogbook,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ message: "Gagal menambahkan komentar" });
  }
});

// Endpoint untuk download file
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);

  console.log("Mencari file di:", filePath);
  console.log("File exists:", fs.existsSync(filePath));

  if (fs.existsSync(filePath)) {
    console.log("File ditemukan, mengirim...");
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Error mengirim file:", err);
        res.status(500).json({ message: "Gagal mengunduh file" });
      }
    });
  } else {
    console.log("File tidak ditemukan:", filePath);
    res.status(404).json({ message: "File tidak ditemukan" });
  }
});

// Endpoint untuk download file
app.get("/api/download/:filename", (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, "uploads", filename);

  console.log("Mencari file di:", filePath);
  console.log("File exists:", fs.existsSync(filePath));

  if (fs.existsSync(filePath)) {
    console.log("File ditemukan, mengirim...");
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error("Error mengirim file:", err);
        res.status(500).json({ message: "Gagal mengunduh file" });
      }
    });
  } else {
    console.log("File tidak ditemukan:", filePath);
    res.status(404).json({ message: "File tidak ditemukan" });
  }
});

// Endpoint untuk update status dengan surat balasan
app.patch(
  "/api/pendaftaran/:id/status",
  upload.single("file"), // Pastikan nama field sesuai dengan frontend
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status, komentar } = req.body;

      // Debug: Lihat apa yang diterima
      console.log("=== DATA YANG DITERIMA ===");
      console.log("Status:", status);
      console.log("Komentar:", komentar);
      console.log("File:", req.file);
      console.log("Filename:", req.file?.filename);
      console.log("=========================");

      const updateData = {
        status,
        updatedAt: new Date(),
        ...(komentar && { komentar }),
      };

      // Handle file upload jika status disetujui dan ada file
      if (status === "disetujui" && req.file) {
        const fileName = req.file.filename;
        updateData.suratBalasan = fileName;

        console.log("Surat balasan disimpan:", fileName);
      }

      console.log("Data yang akan diupdate:", updateData);

      const updated = await Pendaftaran.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
        // Pastikan mengembalikan field suratBalasan
        select: "+suratBalasan",
      });

      console.log("=== SETELAH UPDATE ===");
      console.log("ID:", updated._id);
      console.log("Status:", updated.status);
      console.log("Surat Balasan:", updated.suratBalasan);
      console.log("======================");

      res.json(updated);
    } catch (error) {
      console.error("Error updating status:", error);
      res.status(500).json({ error: "Gagal memperbarui status" });
    }
  }
);
