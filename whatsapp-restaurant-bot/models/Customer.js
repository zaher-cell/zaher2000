const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true }, // رقم واتساب xxxx@c.us
    name: { type: String, default: "" },
    loyaltyPoints: { type: Number, default: 0 },
    ordersCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Customer", customerSchema);
