const crypto = require("crypto");

/**
 * تجزئة كلمة المرور باستخدام scrypt المدمج في Node.js
 * لا نستخدم مكتبة bcrypt الخارجية لتفادي مشاكل الترجمة (native build) على Render.
 * الناتج المخزن بصيغة: salt:hash (كلاهما hex)
 */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(plain, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
