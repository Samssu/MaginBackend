require("dotenv").config();
const nodemailer = require("nodemailer");

async function testEmail() {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Test Email",
      text: "This is a test email from Nodemailer.",
    });
    console.log("Test email sent:", info.response);
  } catch (error) {
    console.error("Test email error:", error);
  }
}

testEmail();
