const Order = require("../models/Order");
const { applyOrderStatusSideEffects } = require("./orderEvents");

/**
 * استلام <رقم الطلب> → يسند السائق لنفسه وتصبح الحالة "مع السائق"
 * تسليم <رقم الطلب> → الطلب "تم التوصيل" (يطلق نقاط الولاء وطلب التقييم تلقائياً)
 */
async function handleDriverMessage(driver, rawText) {
  const text = (rawText || "").trim();

  const pickupMatch = text.match(/^استلام\s+(\S+)$/);
  if (pickupMatch) {
    const order = await Order.findOne({ orderNumber: pickupMatch[1] }).populate("restaurant");
    if (!order) return `❗ لم يتم العثور على طلب برقم ${pickupMatch[1]}.`;
    if (order.status !== "ready") {
      return `❗ هذا الطلب ليس جاهزاً للاستلام حالياً (الحالة: ${order.status}).`;
    }
    order.status = "out_for_delivery";
    order.driver = driver._id;
    await order.save();
    await applyOrderStatusSideEffects(order);
    return `✅ تم إسنادك لطلب ${order.orderNumber}. عنوان التوصيل: ${order.customer.address}`;
  }

  const deliverMatch = text.match(/^تسليم\s+(\S+)$/);
  if (deliverMatch) {
    const order = await Order.findOne({ orderNumber: deliverMatch[1], driver: driver._id }).populate("restaurant");
    if (!order) return `❗ لا يوجد طلب برقم ${deliverMatch[1]} مسند لك.`;
    order.status = "delivered";
    await order.save();
    await applyOrderStatusSideEffects(order);
    return `✅ تم تسجيل الطلب ${order.orderNumber} كـ "تم التوصيل". شكراً لجهدك 🙌`;
  }

  return (
    `مرحباً ${driver.name} 👋\n\n` +
    `الأوامر المتاحة:\n` +
    `استلام [رقم الطلب] — لتأكيد استلام الطلب من المطعم\n` +
    `تسليم [رقم الطلب] — لتأكيد التوصيل للزبون`
  );
}

module.exports = { handleDriverMessage };
