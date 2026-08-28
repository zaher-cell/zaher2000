const mongoose = require("mongoose");

const ORDER_STATUSES = [
  "new",
  "preparing",
  "ready",
  "out_for_delivery",
  "delivered",
  "cancelled",
];

const STATUS_LABELS_AR = {
  new: "جديد",
  preparing: "قيد التحضير",
  ready: "جاهز للتوصيل",
  out_for_delivery: "مع السائق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
};

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem" },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    note: { type: String, default: "" }, // ملاحظة الزبون على هذا الصنف تحديداً
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true }, // xxxx@c.us
      address: { type: String, required: true },
    },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true }, // مجموع الأصناف قبل التوصيل والخصم
    deliveryFee: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    discount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true }, // subtotal + deliveryFee - discount
    loyaltyPointsEarned: { type: Number, default: 0 },
    status: { type: String, enum: ORDER_STATUSES, default: "new" },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "Driver", default: null },
    rating: {
      stars: { type: Number, min: 1, max: 5, default: null },
      comment: { type: String, default: "" },
    },
    statusHistory: {
      type: [
        {
          status: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

orderSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.statusHistory.push({ status: this.status, at: new Date() });
  }
  next();
});

orderSchema.statics.STATUSES = ORDER_STATUSES;
orderSchema.statics.STATUS_LABELS_AR = STATUS_LABELS_AR;

module.exports = mongoose.model("Order", orderSchema);
