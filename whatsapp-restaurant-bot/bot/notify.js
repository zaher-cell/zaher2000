const { getClient, getState } = require("./client");

/**
 * يرسل رسالة واتساب بأمان — لا يوقف السيرفر إذا فشل الإرسال (رقم غير موجود، البوت غير متصل...الخ)
 * @param {string} whatsappId رقم بصيغة xxxxxxxxxx@c.us
 * @param {string} text
 */
async function sendWhatsAppMessage(whatsappId, text) {
  const client = getClient();
  const state = getState();
  if (!client || state.status !== "ready") {
    console.warn(`⚠️ تعذر إرسال رسالة إلى ${whatsappId} — البوت غير متصل حالياً`);
    return false;
  }
  try {
    await client.sendMessage(whatsappId, text);
    return true;
  } catch (err) {
    console.error(`❌ فشل إرسال رسالة إلى ${whatsappId}:`, err.message);
    return false;
  }
}

module.exports = { sendWhatsAppMessage };
