const mongoose = require("mongoose");

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    // مثال: برجر / بيتزا / مشروبات
    category: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ restaurant: 1, category: 1 });

module.exports = mongoose.model("MenuItem", menuItemSchema);
