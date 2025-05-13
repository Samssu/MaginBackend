const nodemailer = require("nodemailer");

const sendOTP = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: `"Magang Kominfo" <${process.env.EMAIL_FROM}>`,
    to: email,
    subject: "Kode OTP Verifikasi Email",
    text: `Kode OTP Anda adalah: ${otp}`,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = sendOTP;
