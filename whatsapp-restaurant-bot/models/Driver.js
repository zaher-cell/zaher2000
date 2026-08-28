const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
    passwordHash: { type: String, default: null }, // لتسجيل الدخول للوحة التحكم (JWT)
  },
  { timestamps: true }
);

driverSchema.methods.whatsappId = function () {
  return `${this.phone.replace(/\D/g, "")}@c.us`;
};

module.exports = mongoose.model("Driver", driverSchema);
