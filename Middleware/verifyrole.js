const jwt = require("jsonwebtoken");

function verifyRole(allowedRoles) {
  return (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1]; // Ambil token dari header Authorization
    if (!token) return res.status(403).json({ message: "Access denied" });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userRole = decoded.role;

      // Cek apakah role pengguna termasuk dalam allowedRoles
      if (!allowedRoles.includes(userRole)) {
        return res
          .status(403)
          .json({ message: "Access forbidden: insufficient role" });
      }

      req.user = decoded; // Menyimpan informasi pengguna yang terautentikasi
      next(); // Melanjutkan ke rute berikutnya
    } catch (error) {
      res.status(400).json({ message: "Invalid token" });
    }
  };
}

module.exports = verifyRole;
