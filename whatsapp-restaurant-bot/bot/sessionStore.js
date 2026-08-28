/**
 * تخزين حالة المحادثة لكل زبون في الذاكرة (Map)
 * ملاحظة: هذا التخزين يُمسح إذا انطفأ السيرفر أو أعاد Render تشغيله — مقبول تماماً لبوت مطاعم.
 */

const sessions = new Map();

const STEPS = {
  MAIN_MENU: "MAIN_MENU",
  RESTAURANT_MENU: "RESTAURANT_MENU",
  BROWSING_CATEGORY: "BROWSING_CATEGORY",
  AWAITING_ITEM_NOTE: "AWAITING_ITEM_NOTE",
  CART: "CART",
  CHECKOUT_NAME: "CHECKOUT_NAME",
  CHECKOUT_PHONE: "CHECKOUT_PHONE",
  CHECKOUT_ADDRESS: "CHECKOUT_ADDRESS",
  CHECKOUT_COUPON: "CHECKOUT_COUPON",
  CHECKOUT_CONFIRM: "CHECKOUT_CONFIRM",
};

function getSession(id) {
  if (!sessions.has(id)) {
    sessions.set(id, freshSession());
  }
  return sessions.get(id);
}

function freshSession() {
  return {
    step: STEPS.MAIN_MENU,
    restaurantId: null,
    restaurantsShown: [],
    categoriesShown: [],
    itemsShown: [],
    cart: [], // [{menuItemId, name, price, quantity, note}]
    lastAddedCartIndex: -1,
    customer: { name: "", phone: "", address: "" },
    couponCode: null,
    awaitingRatingFor: null, // orderId بانتظار تقييم الزبون له
    updatedAt: Date.now(),
  };
}

function resetSession(id) {
  const prev = sessions.get(id);
  const fresh = freshSession();
  // نحافظ على علامة انتظار التقييم حتى لو بدأ الزبون طلب جديد
  if (prev && prev.awaitingRatingFor) fresh.awaitingRatingFor = prev.awaitingRatingFor;
  sessions.set(id, fresh);
  return sessions.get(id);
}

function touch(id) {
  const s = getSession(id);
  s.updatedAt = Date.now();
}

setInterval(() => {
  const twoHours = 2 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, s] of sessions.entries()) {
    if (now - s.updatedAt > twoHours) sessions.delete(id);
  }
}, 30 * 60 * 1000);

module.exports = { getSession, resetSession, touch, STEPS };
