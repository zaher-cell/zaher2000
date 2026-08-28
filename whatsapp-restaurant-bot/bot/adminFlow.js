const Admin = require("../models/Admin");
const Restaurant = require("../models/Restaurant");
const Order = require("../models/Order");

/**
 * يتحقق هل الرقم المرسل هو الأدمن المخفي حالياً (بعد التفعيل).
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findAdminByPhone(phoneDigits) {
  const admin = await Admin.findOne({ phone: phoneDigits });
  return admin || null;
}

/**
 * يحاول تفعيل الأدمن المخفي إذا كانت الرسالة تطابق كود التفعيل ولم يُستخدم من قبل.
 * لا يُظهر أي رد يكشف وجود نظام أدمن إذا فشلت المطابقة أو كان مُفعّلاً مسبقاً —
 * يُرجع null بصمت ليكمل الراوتر معاملة الرسالة كزبون عادي (إخفاء تام).
 * @returns {Promise<string|null>} رسالة تأكيد التفعيل أو null
 */
async function tryActivateAdmin(senderDigits, text) {
  const code = (text || "").trim();
  if (!code) return null;

  let admin = await Admin.findOne();
  if (!admin) {
    // أول تشغيل: ننشئ وثيقة الأدمن بالكود من متغيرات البيئة
    admin = await Admin.create({ activationCode: process.env.ADMIN_ACTIVATION_CODE || "" });
  }

  if (admin.phone) return null; // مُفعّل مسبقاً — تجاهل صامت
  if (!admin.activationCode || code !== admin.activationCode) return null; // كود غلط — تجاهل صامت

  admin.phone = senderDigits;
  await admin.save();
  return (
    `🔐 تم تفعيلك كأدمن مخفي بنجاح.\n\n` +
    `هذا الرقم أصبح الآن رقم الإدارة السري ولن يظهر لأي زبون أو مطعم أو سائق.\n` +
    `افتح لوحة التحكم من المتصفح وسجّل دخول كـ"أدمن" بكلمة المرور اللي حطيتها في إعدادات Render (ADMIN_PASSWORD).`
  );
}

/**
 * أوامر إدارية سريعة من واتساب — بجانب لوحة التحكم الكاملة.
 */
async function handleAdminMessage(admin, rawText) {
  const text = (rawText || "").trim();

  if (text === "احصائيات" || text === "إحصائيات") {
    const [restaurantsCount, ordersAgg] = await Promise.all([
      Restaurant.countDocuments(),
      Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);
    let out = `📊 *إحصائيات سريعة*\n\nعدد المطاعم: ${restaurantsCount}\n\n`;
    ordersAgg.forEach((a) => (out += `${a._id}: ${a.count}\n`));
    return out;
  }

  if (text === "مطاعم") {
    const list = await Restaurant.find().sort({ name: 1 });
    if (!list.length) return "لا توجد مطاعم مسجلة بعد.";
    return list.map((r) => `${r.isActive ? "🟢" : "🔴"} ${r.name} — ${r.phone}`).join("\n");
  }

  return (
    `👑 مرحباً أيها الأدمن\n\n` +
    `الأوامر المتاحة هنا:\n` +
    `احصائيات — نظرة سريعة على الطلبات\n` +
    `مطاعم — عرض كل المطاعم وحالتها\n\n` +
    `للتحكم الكامل (إضافة/حذف مطاعم وسائقين وكوبونات)، استخدم لوحة التحكم من المتصفح.`
  );
}

module.exports = { findAdminByPhone, tryActivateAdmin, handleAdminMessage };
