const Restaurant = require("../models/Restaurant");
const Driver = require("../models/Driver");
const Customer = require("../models/Customer");
const { sendWhatsAppMessage } = require("./notify");
const { getSession } = require("./sessionStore");
const msg = require("./messages");

/**
 * يُستدعى من أي مكان يغيّر حالة الطلب (لوحة التحكم، أمر واتساب من المطعم، أمر واتساب من السائق)
 * حتى تكون الإشعارات ونقاط الولاء وطلب التقييم متسقة دائماً بغض النظر عن مصدر التحديث.
 * @param {import("mongoose").Document} order وثيقة الطلب بعد حفظ الحالة الجديدة
 */
async function applyOrderStatusSideEffects(order) {
  const restaurant =
    order.restaurant && order.restaurant.name ? order.restaurant : await Restaurant.findById(order.restaurant);

  // إشعار الزبون بكل تغيير حالة
  await sendWhatsAppMessage(order.customer.phone, msg.statusUpdateCustomer(order));

  if (order.status === "ready") {
    const drivers = await Driver.find({ isActive: true });
    for (const d of drivers) {
      await sendWhatsAppMessage(d.whatsappId(), msg.orderReadyNotifyDrivers(order, restaurant));
    }
  }

  if (order.status === "delivered") {
    // نقاط الولاء: نقطة واحدة لكل 10 وحدة عملة من قيمة الطلب
    const pointsEarned = Math.floor(order.totalPrice / 10);
    if (!order.loyaltyPointsEarned) {
      order.loyaltyPointsEarned = pointsEarned;
      await order.save();
    }

    const customer = await Customer.findOneAndUpdate(
      { phone: order.customer.phone },
      {
        $inc: { loyaltyPoints: pointsEarned, ordersCount: 1 },
        $set: { name: order.customer.name },
      },
      { upsert: true, new: true }
    );

    // نطلب التقييم — نضع علامة بالجلسة تنتظر رقم من 1 إلى 5 في أول رسالة قادمة من الزبون
    const session = getSession(order.customer.phone);
    session.awaitingRatingFor = order._id.toString();

    await sendWhatsAppMessage(
      order.customer.phone,
      msg.askRating(order, customer.loyaltyPoints)
    );
  }
}

module.exports = { applyOrderStatusSideEffects };
