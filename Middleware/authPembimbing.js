// middleware/authPembimbing.js
const jwt = require("jsonwebtoken");

const authPembimbing = (req, res, next) => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Tidak terautentikasi" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "pembimbing") {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token tidak valid" });
  }
};

module.exports = authPembimbing;
