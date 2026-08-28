const Order = require("../models/Order");
const { STATUS_LABELS_AR } = require("../models/Order");
const { applyOrderStatusSideEffects } = require("./orderEvents");

/**
 * أوامر سريعة يقدر صاحب المطعم يستخدمها من واتساب مباشرة، بجانب لوحة التحكم.
 * قبول <رقم الطلب>   → تحضير
 * جاهز <رقم الطلب>   → جاهز للتوصيل + إشعار السائقين
 * طلبات              → عرض الطلبات الجارية
 * فتح / اغلاق        → تفعيل أو إيقاف استقبال الطلبات مؤقتاً
 */
async function handleRestaurantMessage(restaurant, rawText) {
  const text = (rawText || "").trim();

  if (text === "طلبات") {
    const orders = await Order.find({
      restaurant: restaurant._id,
      status: { $in: ["new", "preparing", "ready"] },
    }).sort({ createdAt: 1 });
    if (!orders.length) return "لا توجد طلبات جارية حالياً.";
    return orders
      .map((o) => `#${o.orderNumber} — ${STATUS_LABELS_AR[o.status]} — ${o.customer.name}`)
      .join("\n");
  }

  if (text === "فتح") {
    restaurant.isOpen = true;
    await restaurant.save();
    return "🟢 المطعم أصبح مفتوحاً ويستقبل الطلبات.";
  }
  if (text === "اغلاق" || text === "إغلاق") {
    restaurant.isOpen = false;
    await restaurant.save();
    return "🔴 المطعم أصبح مغلقاً ولن يستقبل طلبات جديدة حتى تكتب *فتح*.";
  }

  const acceptMatch = text.match(/^قبول\s+(\S+)$/);
  if (acceptMatch) return updateStatus(restaurant, acceptMatch[1], "preparing");

  const readyMatch = text.match(/^جاهز\s+(\S+)$/);
  if (readyMatch) return updateStatus(restaurant, readyMatch[1], "ready");

  return (
    `مرحباً ${restaurant.name} 👋\n\n` +
    `الأوامر المتاحة:\n` +
    `طلبات — عرض الطلبات الجارية\n` +
    `قبول [رقم الطلب] — بدء التحضير\n` +
    `جاهز [رقم الطلب] — تجهيز الطلب للتوصيل\n` +
    `فتح / اغلاق — التحكم باستقبال الطلبات\n\n` +
    `أو استخدم لوحة التحكم الكاملة من المتصفح.`
  );
}

async function updateStatus(restaurant, orderNumber, status) {
  const order = await Order.findOne({ orderNumber, restaurant: restaurant._id });
  if (!order) return `❗ لم يتم العثور على طلب برقم ${orderNumber} لهذا المطعم.`;
  order.status = status;
  await order.save();
  order.restaurant = restaurant; // نمرر الوثيقة كاملة لتفادي استعلام إضافي بالدالة المشتركة
  await applyOrderStatusSideEffects(order);
  return `✅ تم تحديث الطلب ${order.orderNumber} إلى: ${STATUS_LABELS_AR[status]}`;
}

module.exports = { handleRestaurantMessage };
