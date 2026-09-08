const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const qrcode = require("qrcode");
const mongoose = require("mongoose");
const { ensureChromeReady } = require("./ensureChrome");

// حالة الاتصال الحالية، تُقرأ من الـ API لعرضها في الـ Dashboard
const state = {
  status: "starting", // starting | qr | authenticated | ready | disconnected
  qrDataUrl: null,
  pairingCode: null, // كود الاقتران النصي (مثال: ABCD-EFGH) إن طُلب بدل QR
  lastMessage: "جاري بدء تشغيل البوت...",
};

let client = null;

/**
 * ينشئ عميل واتساب ويربطه بقاعدة البيانات لحفظ الجلسة (RemoteAuth)
 * هذا مهم على Render لأن القرص المحلي يُمسح عند كل إعادة نشر،
 * فحفظ الجلسة في MongoDB يمنعك من مسح كود QR في كل مرة.
 */
async function createClient() {
  // نجهز Chrome ونتحقق أنه يعمل فعلياً *قبل* إنشاء عميل واتساب — لو فشل هذا،
  // نرمي الخطأ فوراً وواضحاً ولا ننشئ عميل واتساب بمسار غير صالح إطلاقاً.
  let executablePath, args;
  try {
    const chrome = await ensureChromeReady();
    executablePath = chrome.executablePath;
    args = chrome.args;
  } catch (err) {
    state.status = "disconnected";
    state.lastMessage = `فشل تجهيز المتصفح: ${err.message}`;
    throw err;
  }

  const store = new MongoStore({ mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 5 * 60 * 1000, // نسخ احتياطي للجلسة كل 5 دقائق
    }),
    puppeteer: {
      headless: true,
      executablePath,
      args,
    },
  });

  client.on("qr", async (qr) => {
    state.status = "qr";
    state.pairingCode = null;
    state.lastMessage = "امسح رمز QR من صفحة /qr في الداشبورد لربط الواتساب، أو استخدم كود الاقتران بدلاً منه";
    state.qrDataUrl = await qrcode.toDataURL(qr);
    console.log("📱 كود QR جاهز — افتح /qr في المتصفح لمسحه");
  });

  // يُطلق تلقائياً من مكتبة whatsapp-web.js بعد استدعاء requestPairingCode بنجاح
  client.on("code", (code) => {
    state.status = "qr";
    state.pairingCode = code;
    state.lastMessage = "أدخل كود الاقتران هذا في واتساب لربط الجهاز";
    console.log(`🔢 كود الاقتران جاهز: ${code}`);
  });

  client.on("authenticated", () => {
    state.status = "authenticated";
    state.pairingCode = null;
    state.lastMessage = "تم تسجيل الدخول، جاري تجهيز البوت...";
    console.log("🔐 تم تسجيل الدخول بنجاح");
  });

  client.on("remote_session_saved", () => {
    console.log("💾 تم حفظ جلسة الواتساب في قاعدة البيانات");
  });

  client.on("ready", () => {
    state.status = "ready";
    state.qrDataUrl = null;
    state.lastMessage = "البوت يعمل الآن ومتصل بواتساب ✅";
    console.log("✅ بوت واتساب جاهز ويستقبل الطلبات");
  });

  client.on("disconnected", (reason) => {
    state.status = "disconnected";
    state.lastMessage = `انقطع الاتصال: ${reason}`;
    console.log("⚠️ انقطع اتصال واتساب:", reason);

    // انقطاع غير مقصود (شبكة، انهيار صفحة، إلخ) → نحاول إعادة التهيئة تلقائياً
    // بما أن الجلسة محفوظة في MongoDB (RemoteAuth) فلن يحتاج مسح QR/كود مرة ثانية.
    // "LOGOUT" فقط يعني أن المستخدم فصل الجهاز فعلياً من واتساب نفسه — لا نعيد المحاولة حينها.
    if (reason !== "LOGOUT") {
      console.log("🔁 محاولة إعادة الاتصال تلقائياً خلال 10 ثوانٍ...");
      setTimeout(() => {
        client.initialize().catch((err) => {
          console.error("❌ فشلت إعادة المحاولة التلقائية:", err.message);
        });
      }, 10000);
    }
  });

  client.on("auth_failure", (msg) => {
    state.status = "disconnected";
    state.lastMessage = `فشل تسجيل الدخول: ${msg}`;
    console.log("❌ فشل تسجيل الدخول:", msg);
  });

  return client;
}

/**
 * يطلب كود اقتران (Pairing Code) من واتساب لربط الجهاز برقم هاتف مباشرة،
 * بديل لمسح QR من نفس الجهاز بدون كاميرا/جهاز ثانٍ. لا يُنشئ عميلاً جديداً
 * ولا يمس جلسة RemoteAuth — يستخدم العميل الحالي نفسه الذي يعمل أصلاً.
 * @param {string} phoneNumber رقم دولي بدون + وبدون مسافات أو رموز (مثال: 966501234567)
 * @returns {Promise<string>} الكود بصيغة مثل "ABCDEFGH"
 * @throws {Error} إذا لم يكن العميل جاهزاً لطلب كود اقتران (مثلاً بعد تسجيل الدخول فعلاً)
 */
async function requestPairingCode(phoneNumber) {
  if (!client) {
    throw new Error("عميل واتساب غير مهيأ بعد — انتظر حتى تظهر حالة الاتصال أولاً");
  }
  if (state.status === "ready" || state.status === "authenticated") {
    throw new Error("الحساب مرتبط بالفعل — لا حاجة لكود اقتران جديد");
  }
  if (state.status !== "qr") {
    // الصفحة الداخلية (pupPage) لسه ما جهزت — لو نادينا requestPairingCode الآن
    // بيطلع خطأ تقني غير مفهوم بدل رسالة واضحة، فنمنعها من هنا مبكراً
    throw new Error("البوت لا يزال يجهز نفسه، انتظر ثوانٍ قليلة ثم حاول مرة أخرى");
  }
  const clean = (phoneNumber || "").replace(/\D/g, "");
  if (!clean) {
    throw new Error("رقم الهاتف غير صحيح");
  }
  const code = await client.requestPairingCode(clean, true);
  state.pairingCode = code;
  state.lastMessage = "أدخل كود الاقتران هذا في واتساب لربط الجهاز";
  return code;
}

/**
 * يلغي طلب كود الاقتران الحالي ويرجّع العميل لوضع QR الطبيعي.
 */
async function cancelPairing() {
  if (!client) return;
  await client.cancelPairingCode();
  state.pairingCode = null;
}

function getClient() {
  return client;
}

function getState() {
  return state;
}

module.exports = { createClient, getClient, getState, requestPairingCode, cancelPairing };
