const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const Admin = require("../models/Admin");
const Restaurant = require("../models/Restaurant");
const Driver = require("../models/Driver");
const { verifyPassword, hashPassword } = require("../utils/hash");

function sign(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "30d" });
}

// تسجيل دخول الأدمن — كلمة مرور واحدة فقط (ADMIN_PASSWORD من متغيرات البيئة)
// أو كلمة مرور مخصصة إذا تم تعيينها لاحقاً على وثيقة الأدمن
router.post("/login/admin", async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "أدخل كلمة المرور" });

  const admin = await Admin.findOne();
  const customHash = admin && admin.passwordHash;

  const ok = customHash ? verifyPassword(password, customHash) : password === process.env.ADMIN_PASSWORD;

  if (!ok) return res.status(401).json({ error: "كلمة مرور خاطئة" });

  const token = sign({ role: "admin", id: admin ? admin._id : "env-admin", name: "الأدمن" });
  res.json({ token, role: "admin", name: "الأدمن" });
});

// تعيين/تغيير كلمة مرور لوحة تحكم الأدمن (يتطلب معرفة القيمة الحالية في .env أو الحالية المخزنة)
router.post("/login/admin/set-password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
  }
  let admin = await Admin.findOne();
  const currentOk = admin && admin.passwordHash
    ? verifyPassword(currentPassword, admin.passwordHash)
    : currentPassword === process.env.ADMIN_PASSWORD;
  if (!currentOk) return res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });

  if (!admin) admin = new Admin({ activationCode: process.env.ADMIN_ACTIVATION_CODE || "" });
  admin.passwordHash = hashPassword(newPassword);
  await admin.save();
  res.json({ ok: true });
});

// تسجيل دخول صاحب مطعم — بالجوال وكلمة المرور
router.post("/login/restaurant", async (req, res) => {
  const { phone, password } = req.body;
  const restaurant = await Restaurant.findOne({ phone: (phone || "").replace(/\D/g, "") });
  if (!restaurant || !restaurant.passwordHash || !verifyPassword(password, restaurant.passwordHash)) {
    return res.status(401).json({ error: "الجوال أو كلمة المرور غير صحيحة" });
  }
  const token = sign({ role: "restaurant", id: restaurant._id.toString(), name: restaurant.name });
  res.json({ token, role: "restaurant", name: restaurant.name, restaurantId: restaurant._id });
});

// تسجيل دخول سائق — بالجوال وكلمة المرور
router.post("/login/driver", async (req, res) => {
  const { phone, password } = req.body;
  const driver = await Driver.findOne({ phone: (phone || "").replace(/\D/g, "") });
  if (!driver || !driver.passwordHash || !verifyPassword(password, driver.passwordHash)) {
    return res.status(401).json({ error: "الجوال أو كلمة المرور غير صحيحة" });
  }
  const token = sign({ role: "driver", id: driver._id.toString(), name: driver.name });
  res.json({ token, role: "driver", name: driver.name, driverId: driver._id });
});

module.exports = router;
