const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ["percent", "fixed"], default: "percent" },
    value: { type: Number, required: true }, // نسبة % أو مبلغ ثابت حسب discountType
    // اتركه فارغاً ليعمل الكوبون على كل المطاعم، أو حدد مطعماً معيناً
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", default: null },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null }, // null = بلا حد
    usedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
