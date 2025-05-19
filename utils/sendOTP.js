// utils/sendMail.js
const nodemailer = require("nodemailer");

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
    await transporter.sendMail(mailOptions);
    console.log("OTP sent to email!");
  } catch (error) {
    console.error("Error sending OTP:", error);
  }
};

module.exports = sendMail;
