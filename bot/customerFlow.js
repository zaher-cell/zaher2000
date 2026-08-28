const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Order = require("../models/Order");
const Coupon = require("../models/Coupon");
const Customer = require("../models/Customer");
const { getSession, resetSession, touch, STEPS } = require("./sessionStore");
const msg = require("./messages");
const { sendWhatsAppMessage } = require("./notify");

const GLOBAL_COMMANDS = {
  MENU: ["قائمة", "القائمة", "menu"],
  HELP: ["مساعدة", "help"],
  CANCEL: ["الغاء", "إلغاء", "cancel"],
  CART: ["سلة", "السلة", "cart"],
  MY_ORDERS: ["طلباتي", "طلبي"],
  LOYALTY: ["نقاطي", "نقاط"],
};

function matches(text, list) {
  return list.includes(text.trim().toLowerCase());
}

async function showMainMenu(chatId, session) {
  const restaurants = await Restaurant.find({ isActive: true }).sort({ order: 1, name: 1 });
  session.step = STEPS.MAIN_MENU;
  session.restaurantsShown = restaurants.map((r) => r._id.toString());
  if (!restaurants.length) return "😕 لا توجد مطاعم متاحة حالياً، حاول لاحقاً.";
  return msg.mainMenu(restaurants);
}

async function showRestaurant(session, restaurant) {
  const items = await MenuItem.find({ restaurant: restaurant._id, isAvailable: true });
  const categories = [...new Set(items.map((i) => i.category))];
  session.step = STEPS.RESTAURANT_MENU;
  session.restaurantId = restaurant._id.toString();
  session.categoriesShown = categories;
  if (!categories.length) {
    return `😕 لا توجد أصناف متاحة حالياً في ${restaurant.name}.\n\n0️⃣ اكتب 0 للرجوع للقائمة الرئيسية.`;
  }
  return msg.restaurantDetails(restaurant, categories);
}

async function showCategory(session, category) {
  const items = await MenuItem.find({
    restaurant: session.restaurantId,
    category,
    isAvailable: true,
  }).sort({ order: 1, name: 1 });
  session.step = STEPS.BROWSING_CATEGORY;
  session.itemsShown = items.map((i) => ({ id: i._id.toString(), name: i.name, price: i.price }));
  return msg.categoryItems(category, items);
}

async function handleCustomerMessage(chatId, rawText) {
  const text = (rawText || "").trim();
  const session = getSession(chatId);
  touch(chatId);

  // تقييم بعد التوصيل — أولوية فقط لما الزبون يكون في القائمة الرئيسية (تفادي تعارض الأرقام مع التنقل)
  if (session.awaitingRatingFor && session.step === STEPS.MAIN_MENU) {
    const rm = text.match(/^([1-5])\s*(.*)$/);
    if (rm) {
      const stars = parseInt(rm[1], 10);
      const comment = rm[2] || "";
      const orderId = session.awaitingRatingFor;
      session.awaitingRatingFor = null;
      const order = await Order.findById(orderId);
      if (order) {
        order.rating = { stars, comment };
        await order.save();
        const restaurant = await Restaurant.findById(order.restaurant);
        if (restaurant) {
          restaurant.ratingSum = (restaurant.ratingSum || 0) + stars;
          restaurant.ratingCount = (restaurant.ratingCount || 0) + 1;
          await restaurant.save();
        }
      }
      return msg.ratingThanks(stars);
    }
  }

  if (matches(text, GLOBAL_COMMANDS.CANCEL)) {
    resetSession(chatId);
    return "تم الإلغاء. اكتب *قائمة* للبدء من جديد. " + msg.welcome();
  }
  if (matches(text, GLOBAL_COMMANDS.HELP)) return msg.help();
  if (matches(text, GLOBAL_COMMANDS.MENU)) return showMainMenu(chatId, session);
  if (matches(text, GLOBAL_COMMANDS.CART)) {
    session.step = STEPS.CART;
    return msg.cartView(session.cart);
  }
  if (matches(text, GLOBAL_COMMANDS.LOYALTY)) {
    const customer = await Customer.findOne({ phone: chatId });
    return msg.loyaltyBalance(customer ? customer.loyaltyPoints : 0);
  }
  if (matches(text, GLOBAL_COMMANDS.MY_ORDERS)) {
    const orders = await Order.find({ "customer.phone": chatId }).sort({ createdAt: -1 }).limit(5);
    return msg.ordersList(orders);
  }
  const trackMatch = text.match(/^تتبع\s+(\S+)$/i);
  if (trackMatch) {
    const order = await Order.findOne({ orderNumber: trackMatch[1], "customer.phone": chatId });
    if (!order) return `❗ لم يتم العثور على طلب برقم ${trackMatch[1]} لهذا الرقم.`;
    return msg.orderTrackingCard(order);
  }

  if (session.step === STEPS.MAIN_MENU && session.restaurantsShown.length === 0 && !text) {
    return msg.welcome() + "\n\n" + (await showMainMenu(chatId, session));
  }

  switch (session.step) {
    case STEPS.MAIN_MENU:
      return handleMainMenu(chatId, session, text);
    case STEPS.RESTAURANT_MENU:
      return handleRestaurantMenu(chatId, session, text);
    case STEPS.BROWSING_CATEGORY:
      return handleBrowsingCategory(chatId, session, text);
    case STEPS.AWAITING_ITEM_NOTE:
      return handleItemNote(chatId, session, text);
    case STEPS.CART:
      return handleCart(chatId, session, text);
    case STEPS.CHECKOUT_NAME:
      session.customer.name = text;
      session.step = STEPS.CHECKOUT_PHONE;
      return msg.askPhone();
    case STEPS.CHECKOUT_PHONE:
      session.customer.phone = text;
      session.step = STEPS.CHECKOUT_ADDRESS;
      return msg.askAddress();
    case STEPS.CHECKOUT_ADDRESS:
      session.customer.address = text;
      session.step = STEPS.CHECKOUT_COUPON;
      return msg.askCoupon();
    case STEPS.CHECKOUT_COUPON:
      return handleCoupon(chatId, session, text);
    case STEPS.CHECKOUT_CONFIRM:
      return handleCheckoutConfirm(chatId, session, text);
    default:
      resetSession(chatId);
      return msg.welcome() + "\n\n" + (await showMainMenu(chatId, session));
  }
}

async function handleMainMenu(chatId, session, text) {
  const idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= session.restaurantsShown.length) {
    return "❗ رقم غير صحيح.\n\n" + (await showMainMenu(chatId, session));
  }
  const restaurant = await Restaurant.findById(session.restaurantsShown[idx]);
  if (!restaurant) return "❗ هذا المطعم غير متاح حالياً.\n\n" + (await showMainMenu(chatId, session));
  if (restaurant.isOpen === false) return msg.restaurantClosed(restaurant);
  return showRestaurant(session, restaurant);
}

async function handleRestaurantMenu(chatId, session, text) {
  if (text.trim() === "0") return showMainMenu(chatId, session);
  const idx = parseInt(text, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= session.categoriesShown.length) {
    const restaurant = await Restaurant.findById(session.restaurantId);
    return "❗ رقم غير صحيح.\n\n" + (await showRestaurant(session, restaurant));
  }
  return showCategory(session, session.categoriesShown[idx]);
}

async function handleBrowsingCategory(chatId, session, text) {
  if (text.trim() === "0") {
    const restaurant = await Restaurant.findById(session.restaurantId);
    return showRestaurant(session, restaurant);
  }
  const parts = text.trim().split(/\s+/);
  const idx = parseInt(parts[0], 10) - 1;
  const quantity = parts[1] ? Math.max(1, parseInt(parts[1], 10) || 1) : 1;

  if (isNaN(idx) || idx < 0 || idx >= session.itemsShown.length) {
    return "❗ رقم غير صحيح. أرسل رقم الصنف من القائمة أعلاه.";
  }
  const item = session.itemsShown[idx];
  const existing = session.cart.find((c) => c.menuItemId === item.id && !c.note);
  if (existing) {
    existing.quantity += quantity;
    session.lastAddedCartIndex = session.cart.indexOf(existing);
  } else {
    session.cart.push({ menuItemId: item.id, name: item.name, price: item.price, quantity, note: "" });
    session.lastAddedCartIndex = session.cart.length - 1;
  }
  session.step = STEPS.AWAITING_ITEM_NOTE;
  return msg.itemAdded(item, quantity);
}

async function handleItemNote(chatId, session, text) {
  const t = text.trim();
  session.step = STEPS.BROWSING_CATEGORY;
  if (t.toLowerCase() !== "تخطي" && t.toLowerCase() !== "skip" && t) {
    const idx = session.lastAddedCartIndex;
    if (idx >= 0 && session.cart[idx]) session.cart[idx].note = t;
    return `📝 تمت إضافة الملاحظة.\n\nأرسل رقم صنف آخر، أو اكتب *سلة* لعرض السلة، أو *0* للرجوع.`;
  }
  return `أرسل رقم صنف آخر، أو اكتب *سلة* لعرض السلة، أو *0* للرجوع.`;
}

async function handleCart(chatId, session, text) {
  const t = text.trim();
  if (matches(t, GLOBAL_COMMANDS.MENU)) return showMainMenu(chatId, session);

  if (t.toLowerCase() === "تأكيد" || t.toLowerCase() === "confirm") {
    if (!session.cart.length) return "🛒 سلتك فارغة. اكتب *قائمة* لإضافة أصناف أولاً.";
    session.step = STEPS.CHECKOUT_NAME;
    return msg.askName();
  }

  const editMatch = t.match(/^تعديل\s+(\d+)\s+(\d+)$/);
  if (editMatch) {
    const idx = parseInt(editMatch[1], 10) - 1;
    const qty = Math.max(1, parseInt(editMatch[2], 10));
    if (idx >= 0 && idx < session.cart.length) {
      session.cart[idx].quantity = qty;
      return msg.cartView(session.cart);
    }
    return "❗ رقم غير صحيح في السلة.";
  }

  const deleteMatch = t.match(/^حذف\s+(\d+)$/);
  if (deleteMatch) {
    const idx = parseInt(deleteMatch[1], 10) - 1;
    if (idx >= 0 && idx < session.cart.length) {
      session.cart.splice(idx, 1);
      return msg.cartView(session.cart);
    }
    return "❗ رقم غير صحيح في السلة.";
  }

  return msg.cartView(session.cart);
}

async function validateCoupon(code, restaurantId, subtotal) {
  const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), isActive: true });
  if (!coupon) return { valid: false };
  if (coupon.restaurant && coupon.restaurant.toString() !== restaurantId) return { valid: false };
  if (coupon.expiresAt && new Date() > coupon.expiresAt) return { valid: false };
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return { valid: false };
  const discount =
    coupon.discountType === "percent" ? Math.round(((subtotal * coupon.value) / 100) * 100) / 100 : coupon.value;
  return { valid: true, coupon, discount: Math.min(discount, subtotal) };
}

async function handleCoupon(chatId, session, text) {
  const t = text.trim();
  if (t.toLowerCase() === "تخطي" || t.toLowerCase() === "skip") {
    session.couponCode = null;
    session.step = STEPS.CHECKOUT_CONFIRM;
    return buildOrderPreview(session);
  }
  const subtotal = session.cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const result = await validateCoupon(t, session.restaurantId, subtotal);
  if (!result.valid) return msg.couponInvalid();
  session.couponCode = result.coupon.code;
  session.step = STEPS.CHECKOUT_CONFIRM;
  return msg.couponApplied(result.discount) + "\n\n" + (await buildOrderPreview(session));
}

async function buildOrderPreview(session) {
  const subtotal = session.cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const restaurant = await Restaurant.findById(session.restaurantId);
  const deliveryFee = restaurant ? restaurant.deliveryFee || 0 : 0;

  let discount = 0;
  if (session.couponCode) {
    const result = await validateCoupon(session.couponCode, session.restaurantId, subtotal);
    if (result.valid) discount = result.discount;
  }

  const totalPrice = Math.max(0, subtotal + deliveryFee - discount);

  session._pendingOrder = {
    customer: { ...session.customer },
    items: session.cart.map((c) => ({
      menuItem: c.menuItemId,
      name: c.name,
      price: c.price,
      quantity: c.quantity,
      note: c.note || "",
    })),
    subtotal,
    deliveryFee,
    discount,
    couponCode: session.couponCode,
    totalPrice,
  };
  return msg.orderSummary(
    { customer: session.customer, ...session._pendingOrder },
    restaurant ? restaurant.name : ""
  );
}

async function handleCheckoutConfirm(chatId, session, text) {
  const t = text.trim().toLowerCase();
  if (t === "نعم" || t === "yes" || t === "تأكيد") {
    const restaurant = await Restaurant.findById(session.restaurantId);
    const orderData = session._pendingOrder;
    orderData.customer.phone = chatId;

    const order = await Order.create({
      orderNumber: msg.generateOrderNumber(),
      restaurant: restaurant._id,
      customer: orderData.customer,
      items: orderData.items,
      subtotal: orderData.subtotal,
      deliveryFee: orderData.deliveryFee,
      discount: orderData.discount,
      couponCode: orderData.couponCode,
      totalPrice: orderData.totalPrice,
      status: "new",
    });

    if (orderData.couponCode) {
      await Coupon.updateOne({ code: orderData.couponCode }, { $inc: { usedCount: 1 } });
    }

    await sendWhatsAppMessage(restaurant.whatsappId(), msg.orderNotifyRestaurant(order));

    resetSession(chatId);
    return msg.orderConfirmedCustomer(order);
  }
  if (t === "الغاء" || t === "إلغاء" || t === "no" || t === "لا") {
    session.step = STEPS.CART;
    return "تم التراجع عن التأكيد. " + msg.cartView(session.cart);
  }
  return "من فضلك اكتب *نعم* للتأكيد أو *الغاء* للتراجع.\n\n" + (await buildOrderPreview(session));
}

module.exports = { handleCustomerMessage };
