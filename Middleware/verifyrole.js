// middleware/verifyrole.js
const jwt = require("jsonwebtoken");

function verifyRole(allowedRoles) {
  return (req, res, next) => {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Verifikasi role
      if (!allowedRoles.includes(decoded.role)) {
        return res
          .status(403)
          .json({ message: "Forbidden: Insufficient role" });
      }

      req.user = decoded;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expired" });
      }
      res.status(400).json({ message: "Invalid token" });
    }
  };
}

module.exports = verifyRole;
