const express = require("express");
const router = express.Router();

const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Driver = require("../models/Driver");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const Customer = require("../models/Customer");
const { requireAuth } = require("../middleware/jwtAuth");
const { hashPassword } = require("../utils/hash");
const { getState } = require("../bot/client");
const { sendWhatsAppMessage } = require("../bot/notify");
const { applyOrderStatusSideEffects } = require("../bot/orderEvents");
const msg = require("../bot/messages");

router.use("/auth", require("./auth"));

// حالة الاتصال بالواتساب — للأدمن فقط
router.get("/whatsapp/status", requireAuth(["admin"]), (req, res) => {
  res.json(getState());
});

// ==================== المطاعم ====================
// الأدمن يشوف الكل، المطعم يشوف بياناته فقط
router.get("/restaurants", requireAuth(["admin", "restaurant"]), async (req, res) => {
  if (req.auth.role === "restaurant") {
    const r = await Restaurant.findById(req.auth.id);
    return res.json(r ? [r] : []);
  }
  const list = await Restaurant.find().sort({ order: 1, name: 1 });
  res.json(list);
});

router.post("/restaurants", requireAuth(["admin"]), async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.password) {
      body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    const r = await Restaurant.create(body);
    res.status(201).json(r);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// تحديث بيانات مطعم — الأدمن يقدر يعدل كل شي، المطعم يقدر يعدل بياناته الخاصة فقط
// (اسم/وصف/ساعات عمل/رسوم توصيل/حساب بنكي/فتح-إغلاق)
router.put("/restaurants/:id", requireAuth(["admin", "restaurant"]), async (req, res) => {
  if (req.auth.role === "restaurant" && req.auth.id !== req.params.id) {
    return res.status(403).json({ error: "لا يمكنك تعديل بيانات مطعم آخر" });
  }
  try {
    const body = { ...req.body };
    if (body.password) {
      body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    if (req.auth.role === "restaurant") {
      // المطعم ممنوع يغير isActive أو phone من هالمسار (صلاحية أدمن فقط)
      delete body.isActive;
      delete body.phone;
    }
    const r = await Restaurant.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!r) return res.status(404).json({ error: "غير موجود" });
    res.json(r);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/restaurants/:id", requireAuth(["admin"]), async (req, res) => {
  await Restaurant.findByIdAndDelete(req.params.id);
  await MenuItem.deleteMany({ restaurant: req.params.id });
  res.json({ ok: true });
});

// ==================== عناصر القائمة ====================
router.get("/menu-items", requireAuth(["admin", "restaurant"]), async (req, res) => {
  const filter = {};
  const restaurantId = req.auth.role === "restaurant" ? req.auth.id : req.query.restaurant;
  if (restaurantId) filter.restaurant = restaurantId;
  const items = await MenuItem.find(filter).sort({ category: 1, order: 1, name: 1 });
  res.json(items);
});

router.post("/menu-items", requireAuth(["admin", "restaurant"]), async (req, res) => {
  try {
    const body = { ...req.body };
    if (req.auth.role === "restaurant") body.restaurant = req.auth.id;
    const item = await MenuItem.create(body);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/menu-items/:id", requireAuth(["admin", "restaurant"]), async (req, res) => {
  try {
    const existing = await MenuItem.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: "غير موجود" });
    if (req.auth.role === "restaurant" && existing.restaurant.toString() !== req.auth.id) {
      return res.status(403).json({ error: "لا يمكنك تعديل صنف مطعم آخر" });
    }
    Object.assign(existing, req.body);
    await existing.save();
    res.json(existing);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/menu-items/:id", requireAuth(["admin", "restaurant"]), async (req, res) => {
  const existing = await MenuItem.findById(req.params.id);
  if (!existing) return res.json({ ok: true });
  if (req.auth.role === "restaurant" && existing.restaurant.toString() !== req.auth.id) {
    return res.status(403).json({ error: "لا يمكنك حذف صنف مطعم آخر" });
  }
  await existing.deleteOne();
  res.json({ ok: true });
});

// ==================== السائقون ====================
router.get("/drivers", requireAuth(["admin"]), async (req, res) => {
  const drivers = await Driver.find().sort({ name: 1 });
  res.json(drivers);
});

router.post("/drivers", requireAuth(["admin"]), async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.password) {
      body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    const d = await Driver.create(body);
    res.status(201).json(d);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/drivers/:id", requireAuth(["admin", "driver"]), async (req, res) => {
  if (req.auth.role === "driver" && req.auth.id !== req.params.id) {
    return res.status(403).json({ error: "غير مسموح" });
  }
  try {
    const body = { ...req.body };
    if (body.password) {
      body.passwordHash = hashPassword(body.password);
      delete body.password;
    }
    if (req.auth.role === "driver") {
      delete body.isActive;
      delete body.phone;
    }
    const d = await Driver.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!d) return res.status(404).json({ error: "غير موجود" });
    res.json(d);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/drivers/:id", requireAuth(["admin"]), async (req, res) => {
  await Driver.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ==================== الكوبونات — أدمن فقط ====================
router.get("/coupons", requireAuth(["admin"]), async (req, res) => {
  const list = await Coupon.find().sort({ createdAt: -1 });
  res.json(list);
});

router.post("/coupons", requireAuth(["admin"]), async (req, res) => {
  try {
    const c = await Coupon.create(req.body);
    res.status(201).json(c);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/coupons/:id", requireAuth(["admin"]), async (req, res) => {
  const c = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) return res.status(404).json({ error: "غير موجود" });
  res.json(c);
});

router.delete("/coupons/:id", requireAuth(["admin"]), async (req, res) => {
  await Coupon.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// ==================== الطلبات ====================
router.get("/orders", requireAuth(["admin", "restaurant", "driver"]), async (req, res) => {
  const filter = {};
  if (req.auth.role === "restaurant") filter.restaurant = req.auth.id;
  if (req.auth.role === "driver") {
    // السائق يشوف: الطلبات الجاهزة بدون سائق (Pool) + طلباته الحالية
    filter.$or = [{ status: "ready", driver: null }, { driver: req.auth.id }];
  }
  if (req.auth.role === "admin" && req.query.restaurant) filter.restaurant = req.query.restaurant;
  if (req.query.status) filter.status = req.query.status;

  const orders = await Order.find(filter)
    .populate("restaurant", "name phone")
    .populate("driver", "name phone")
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(orders);
});

router.get("/orders/stats", requireAuth(["admin", "restaurant"]), async (req, res) => {
  const filter = {};
  if (req.auth.role === "restaurant") filter.restaurant = req.auth.id;
  else if (req.query.restaurant) filter.restaurant = req.query.restaurant;
  const agg = await Order.aggregate([
    { $match: filter },
    { $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$totalPrice" } } },
  ]);
  res.json(agg);
});

// تحديث حالة الطلب — يرسل إشعار واتساب تلقائي، ويشعر السائقين لو صار "جاهز"
router.put("/orders/:id/status", requireAuth(["admin", "restaurant", "driver"]), async (req, res) => {
  const { status } = req.body;
  if (!Order.STATUSES.includes(status)) {
    return res.status(400).json({ error: "حالة غير صحيحة" });
  }
  const order = await Order.findById(req.params.id).populate("restaurant");
  if (!order) return res.status(404).json({ error: "الطلب غير موجود" });

  if (req.auth.role === "restaurant" && order.restaurant._id.toString() !== req.auth.id) {
    return res.status(403).json({ error: "غير مسموح بتعديل طلب مطعم آخر" });
  }
  if (req.auth.role === "driver" && order.driver && order.driver.toString() !== req.auth.id) {
    return res.status(403).json({ error: "غير مسموح — الطلب مسند لسائق آخر" });
  }

  order.status = status;
  if (req.auth.role === "driver" && status === "out_for_delivery") order.driver = req.auth.id;
  if (req.body.driver !== undefined && req.auth.role !== "driver") order.driver = req.body.driver || null;
  await order.save();

  await applyOrderStatusSideEffects(order);

  res.json(order);
});

// ==================== لوحة إحصائيات الأدمن العامة ====================
router.get("/admin/overview", requireAuth(["admin"]), async (req, res) => {
  const [restaurantsCount, driversCount, ordersAgg, customersCount] = await Promise.all([
    Restaurant.countDocuments(),
    Driver.countDocuments(),
    Order.aggregate([{ $group: { _id: "$status", count: { $sum: 1 }, total: { $sum: "$totalPrice" } } }]),
    Customer.countDocuments(),
  ]);
  res.json({ restaurantsCount, driversCount, customersCount, ordersAgg });
});

module.exports = router;
