const { STATUS_LABELS_AR } = require("../models/Order");

function money(n) {
  return `${Number(n).toFixed(2)} ريال`;
}

function generateOrderNumber() {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${stamp}-${rand}`;
}

const welcome = () =>
  `👋 أهلاً بك!\n` +
  `اكتب *قائمة* في أي وقت للرجوع للقائمة الرئيسية، أو *مساعدة* لعرض الأوامر.`;

const help = () =>
  `📖 *الأوامر المتاحة*\n\n` +
  `قائمة — الرجوع للقائمة الرئيسية\n` +
  `سلة — عرض سلة المشتريات\n` +
  `تعديل رقم كمية — تعديل كمية صنف بالسلة (مثال: تعديل 1 3)\n` +
  `حذف رقم — حذف صنف من السلة (مثال: حذف 1)\n` +
  `طلباتي — عرض آخر طلباتك\n` +
  `تتبع رقم_الطلب — تتبع طلب معين\n` +
  `نقاطي — رصيد نقاط الولاء\n` +
  `الغاء — إلغاء العملية الحالية والبدء من جديد\n` +
  `مساعدة — عرض هذه الرسالة`;

function mainMenu(restaurants) {
  let text = `🍽️ *اختر مطعم:*\n\n`;
  restaurants.forEach((r, i) => {
    const closedTag = r.isOpen === false ? " (مغلق حالياً 🔴)" : "";
    text += `${i + 1}️⃣ ${r.name}${closedTag}\n`;
  });
  text += `\nأرسل رقم المطعم للمتابعة.`;
  return text;
}

function restaurantDetails(restaurant, categories) {
  let text = `🏪 *${restaurant.name}*\n`;
  if (restaurant.description) text += `${restaurant.description}\n`;
  text += `📞 ${restaurant.phone}\n`;
  if (restaurant.workingHours) text += `🕐 ساعات العمل: ${restaurant.workingHours}\n`;
  text += `🚴 رسوم التوصيل: ${money(restaurant.deliveryFee || 0)}\n`;
  if (restaurant.ratingCount) {
    const avg = Math.round((restaurant.ratingSum / restaurant.ratingCount) * 10) / 10;
    text += `⭐ التقييم: ${avg} (${restaurant.ratingCount} تقييم)\n`;
  }
  text += `\n📋 *الأقسام:*\n`;
  categories.forEach((c, i) => {
    text += `${i + 1}️⃣ ${c}\n`;
  });
  text += `\n0️⃣ رجوع للقائمة الرئيسية\n`;
  text += `\nأرسل رقم القسم لعرض الأصناف.`;
  return text;
}

const restaurantClosed = (restaurant) =>
  `🔴 عذراً، *${restaurant.name}* مغلق حالياً ولا يستقبل طلبات.\n\nاكتب *قائمة* لاختيار مطعم آخر.`;

function categoryItems(category, items) {
  let text = `📂 *${category}*\n\n`;
  items.forEach((it, i) => {
    text += `${i + 1}️⃣ ${it.name} — ${money(it.price)}\n`;
    if (it.description) text += `   _${it.description}_\n`;
  });
  text += `\n0️⃣ رجوع لقائمة الأقسام\n`;
  text += `\nأرسل رقم الصنف لإضافته للسلة (تقدر تكتب الرقم ثم مسافة والكمية، مثال: 2 3).`;
  return text;
}

function itemAdded(item, quantity) {
  return (
    `✅ تمت إضافة *${item.name}* × ${quantity} للسلة.\n\n` +
    `تحب تضيف ملاحظة على هذا الصنف؟ (مثال: بدون بصل)\n` +
    `اكتب الملاحظة الآن، أو اكتب *تخطي* للمتابعة.`
  );
}

function cartView(cart) {
  if (!cart.length) {
    return `🛒 سلتك فارغة حالياً.\nاكتب *قائمة* للبدء بالطلب.`;
  }
  let text = `🛒 *سلة المشتريات:*\n\n`;
  let total = 0;
  cart.forEach((c, i) => {
    const lineTotal = c.price * c.quantity;
    total += lineTotal;
    text += `${i + 1}. ${c.name} × ${c.quantity} = ${money(lineTotal)}\n`;
    if (c.note) text += `   📝 ${c.note}\n`;
  });
  text += `\n💰 *المجموع الفرعي: ${money(total)}*\n\n`;
  text +=
    `اكتب *تأكيد* لإتمام الطلب\n` +
    `أو *حذف رقم* لحذف صنف (مثال: حذف 1)\n` +
    `أو *تعديل رقم كمية* لتغيير الكمية (مثال: تعديل 1 3)\n` +
    `أو *قائمة* لإضافة المزيد.`;
  return text;
}

const askName = () => `✍️ ما اسمك الكامل؟`;
const askPhone = () => `📱 رقم جوالك للتواصل؟ (مثال: 05xxxxxxxx)`;
const askAddress = () => `📍 عنوان التوصيل بالتفصيل (الحي، الشارع، أقرب معلم)؟`;
const askCoupon = () => `🎟️ عندك كود خصم؟ اكتبه الآن، أو اكتب *تخطي* للمتابعة بدون خصم.`;
const couponInvalid = () => `❗ الكود غير صحيح أو منتهي. اكتب كود آخر أو *تخطي* للمتابعة بدون خصم.`;
const couponApplied = (discount) => `🎉 تم تطبيق الخصم! وفرت ${money(discount)}.`;

function priceBreakdown({ subtotal, deliveryFee, discount, totalPrice }) {
  let text = `💰 المجموع الفرعي: ${money(subtotal)}\n`;
  text += `🚴 رسوم التوصيل: ${money(deliveryFee)}\n`;
  if (discount > 0) text += `🎟️ الخصم: -${money(discount)}\n`;
  text += `*الإجمالي: ${money(totalPrice)}*`;
  return text;
}

function orderSummary(order, restaurantName) {
  let text = `🧾 *ملخص الطلب*\n\n`;
  text += `المطعم: ${restaurantName}\n`;
  text += `الاسم: ${order.customer.name}\n`;
  text += `الجوال: ${order.customer.phone}\n`;
  text += `العنوان: ${order.customer.address}\n\n`;
  order.items.forEach((it, i) => {
    text += `${i + 1}. ${it.name} × ${it.quantity} = ${money(it.price * it.quantity)}\n`;
    if (it.note) text += `   📝 ${it.note}\n`;
  });
  text += `\n` + priceBreakdown(order) + `\n\n`;
  text += `اكتب *نعم* لتأكيد الطلب وإرساله، أو *الغاء* للتراجع.`;
  return text;
}

function orderConfirmedCustomer(order) {
  return (
    `✅ *تم استلام طلبك بنجاح!*\n\n` +
    `رقم الطلب: ${order.orderNumber}\n` +
    `الحالة: ${STATUS_LABELS_AR[order.status]}\n\n` +
    `راح تصلك تحديثات على حالة الطلب هنا في واتساب.\n` +
    `اكتب *تتبع ${order.orderNumber}* لمتابعته، أو *طلباتي* لعرض كل طلباتك.`
  );
}

function orderNotifyRestaurant(order) {
  let text = `🔔 *طلب جديد!*\n\n`;
  text += `رقم الطلب: ${order.orderNumber}\n`;
  text += `الزبون: ${order.customer.name}\n`;
  text += `الجوال: ${order.customer.phone}\n`;
  text += `العنوان: ${order.customer.address}\n\n`;
  order.items.forEach((it, i) => {
    text += `${i + 1}. ${it.name} × ${it.quantity}\n`;
    if (it.note) text += `   📝 ${it.note}\n`;
  });
  text += `\n` + priceBreakdown(order) + `\n\n`;
  text += `تابع الطلب وحدّث حالته من لوحة التحكم، أو اكتب *قبول ${order.orderNumber}* ثم *جاهز ${order.orderNumber}*.`;
  return text;
}

function orderReadyNotifyDrivers(order, restaurant) {
  return (
    `🚗 *طلب جاهز للتوصيل*\n\n` +
    `رقم الطلب: ${order.orderNumber}\n` +
    `المطعم: ${restaurant.name} — ${restaurant.phone}\n` +
    `عنوان التوصيل: ${order.customer.address}\n` +
    `جوال الزبون: ${order.customer.phone}\n\n` +
    `للاستلام، اكتب: *استلام ${order.orderNumber}*`
  );
}

function statusUpdateCustomer(order) {
  const map = {
    preparing: "👨‍🍳 جاري تحضير طلبك الآن.",
    ready: "📦 طلبك جاهز، بانتظار السائق.",
    out_for_delivery: "🚗 طلبك في الطريق إليك!",
    delivered: "✅ تم توصيل طلبك، بالهناء والشفاء!",
    cancelled: "❌ تم إلغاء طلبك.",
  };
  const extra = map[order.status] || "";
  return `🔔 تحديث حالة الطلب ${order.orderNumber}\n${extra}`;
}

function askRating(order, loyaltyPoints) {
  return (
    `🎉 استلمت ${money(order.totalPrice)}، وربحت ${order.loyaltyPointsEarned || 0} نقطة ولاء ` +
    `(رصيدك الآن ${loyaltyPoints} نقطة).\n\n` +
    `قيّم تجربتك من 1 إلى 5 ⭐ (اكتب رقم فقط، أو رقم ثم تعليق قصير).`
  );
}

const ratingThanks = (stars) => `🙏 شكراً لتقييمك! (${"⭐".repeat(stars)})`;

function orderTrackingCard(order) {
  let text = `📦 *${order.orderNumber}*\n`;
  text += `الحالة: ${STATUS_LABELS_AR[order.status]}\n`;
  text += `الإجمالي: ${money(order.totalPrice)}\n`;
  text += `بتاريخ: ${new Date(order.createdAt).toLocaleString("ar-EG")}`;
  return text;
}

function ordersList(orders) {
  if (!orders.length) return "لا توجد طلبات سابقة لك بعد. اكتب *قائمة* لتبدأ.";
  let text = `📋 *طلباتك الأخيرة:*\n\n`;
  orders.forEach((o) => {
    text += `${o.orderNumber} — ${STATUS_LABELS_AR[o.status]} — ${money(o.totalPrice)}\n`;
  });
  text += `\nاكتب *تتبع رقم_الطلب* لتفاصيل طلب معين.`;
  return text;
}

const loyaltyBalance = (points) => `⭐ رصيد نقاط الولاء الخاص بك: *${points}* نقطة.`;

module.exports = {
  money,
  generateOrderNumber,
  welcome,
  help,
  mainMenu,
  restaurantDetails,
  restaurantClosed,
  categoryItems,
  itemAdded,
  cartView,
  askName,
  askPhone,
  askAddress,
  askCoupon,
  couponInvalid,
  couponApplied,
  priceBreakdown,
  orderSummary,
  orderConfirmedCustomer,
  orderNotifyRestaurant,
  orderReadyNotifyDrivers,
  statusUpdateCustomer,
  askRating,
  ratingThanks,
  orderTrackingCard,
  ordersList,
  loyaltyBalance,
};
