const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    // رقم واتساب صاحب المطعم بصيغة دولية بدون + وبدون مسافات
    phone: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true }, // تفعيل/تعطيل من الأدمن
    isOpen: { type: Boolean, default: true }, // فتح/إغلاق مؤقت يتحكم فيه صاحب المطعم
    workingHours: { type: String, default: "" }, // نص حر، مثال: 12:00 ظهراً - 12:00 منتصف الليل
    deliveryFee: { type: Number, default: 10 },
    bankAccount: { type: String, default: "" }, // رقم حساب بنكي/آيبان صاحب المطعم
    passwordHash: { type: String, default: null }, // لتسجيل الدخول للوحة التحكم (JWT)
    ratingSum: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantSchema.methods.whatsappId = function () {
  return `${this.phone.replace(/\D/g, "")}@c.us`;
};

restaurantSchema.virtual("ratingAvg").get(function () {
  if (!this.ratingCount) return null;
  return Math.round((this.ratingSum / this.ratingCount) * 10) / 10;
});
restaurantSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Restaurant", restaurantSchema);
