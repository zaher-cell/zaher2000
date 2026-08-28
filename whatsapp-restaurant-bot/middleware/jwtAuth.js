const jwt = require("jsonwebtoken");

/**
 * يتحقق من التوكن (Authorization: Bearer <token>) ويتأكد أن الدور مسموح له.
 * @param {string[]} allowedRoles ['admin'] أو ['admin','restaurant'] ...الخ
 */
function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "غير مصرح — لا يوجد توكن" });
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
        return res.status(403).json({ error: "غير مصرح لهذا الدور بالوصول" });
      }
      req.auth = payload; // { role, id, name }
      next();
    } catch (err) {
      return res.status(401).json({ error: "توكن غير صالح أو منتهي" });
    }
  };
}

module.exports = { requireAuth };
