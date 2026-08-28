const Restaurant = require("../models/Restaurant");
const Driver = require("../models/Driver");
const { handleCustomerMessage } = require("./customerFlow");
const { handleRestaurantMessage } = require("./restaurantFlow");
const { handleDriverMessage } = require("./driverFlow");
const { findAdminByPhone, tryActivateAdmin, handleAdminMessage } = require("./adminFlow");

function digitsOnly(phoneField) {
  return (phoneField || "").replace(/\D/g, "");
}

function attachRouter(client) {
  client.on("message", async (message) => {
    try {
      if (!message.from || message.from.endsWith("@g.us") || message.from === "status@broadcast") {
        return;
      }

      const senderDigits = digitsOnly(message.from);

      // 1) محاولة تفعيل الأدمن المخفي (صامتة تماماً لو الكود غلط أو مُفعّل مسبقاً)
      const activationReply = await tryActivateAdmin(senderDigits, message.body);
      if (activationReply) {
        await message.reply(activationReply);
        return;
      }

      // 2) هل المرسل هو الأدمن المخفي؟
      const admin = await findAdminByPhone(senderDigits);
      if (admin) {
        const reply = await handleAdminMessage(admin, message.body);
        if (reply) await message.reply(reply);
        return;
      }

      // 3) هل المرسل صاحب مطعم؟
      const restaurants = await Restaurant.find({ isActive: true });
      const matchedRestaurant = restaurants.find((r) => digitsOnly(r.phone) === senderDigits);
      if (matchedRestaurant) {
        const reply = await handleRestaurantMessage(matchedRestaurant, message.body);
        if (reply) await message.reply(reply);
        return;
      }

      // 4) هل المرسل سائق؟
      const drivers = await Driver.find({ isActive: true });
      const matchedDriver = drivers.find((d) => digitsOnly(d.phone) === senderDigits);
      if (matchedDriver) {
        const reply = await handleDriverMessage(matchedDriver, message.body);
        if (reply) await message.reply(reply);
        return;
      }

      // 5) غير ذلك، زبون عادي
      const reply = await handleCustomerMessage(message.from, message.body);
      if (reply) await message.reply(reply);
    } catch (err) {
      console.error("❌ خطأ أثناء معالجة رسالة واردة:", err);
      try {
        await message.reply("⚠️ صار خطأ غير متوقع، حاول مرة أخرى أو اكتب *الغاء* ثم *قائمة*.");
      } catch (_) {}
    }
  });
}

module.exports = { attachRouter };
