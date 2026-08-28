const mongoose = require("mongoose");

/**
 * وثيقة واحدة فقط تمثل "الأدمن المخفي".
 * لا يظهر أي ذكر للأدمن في أي قائمة يشوفها الزبون أو المطعم أو السائق.
 * التفعيل يتم لمرة واحدة: أول رقم واتساب يرسل كود التفعيل (activationCode)
 * يصبح هو رقم الأدمن السري تلقائياً، وبعدها الكود لا يشتغل مرة ثانية.
 */
const adminSchema = new mongoose.Schema(
  {
    activationCode: { type: String, required: true }, // مثال: zaher2006
    phone: { type: String, default: null }, // يُملأ تلقائياً بعد أول تفعيل، رقم واتساب xxxxxxxx (بدون @c.us)
    passwordHash: { type: String, default: null }, // كلمة مرور لوحة التحكم (تُنشأ لاحقاً من صفحة أول دخول)
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
