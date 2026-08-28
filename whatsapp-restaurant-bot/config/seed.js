const Restaurant = require("../models/Restaurant");
const MenuItem = require("../models/MenuItem");
const Driver = require("../models/Driver");
const Admin = require("../models/Admin");
const Coupon = require("../models/Coupon");
const { hashPassword } = require("../utils/hash");

/**
 * يزرع بيانات تجريبية جاهزة أول مرة فقط (لو قاعدة البيانات فاضية) — بدون أي حاجة لتشغيل
 * أوامر Terminal، يشتغل تلقائياً عند أول إقلاع للسيرفر على Render.
 * آمن للتشغيل أكثر من مرة: يتحقق أولاً أن collection المطاعم فاضية قبل ما يضيف أي شي.
 */
async function autoSeed() {
  const existing = await Restaurant.countDocuments();
  if (existing > 0) {
    console.log("ℹ️ البيانات موجودة مسبقاً — تخطي الزرع التلقائي");
    return;
  }

  console.log("🌱 قاعدة البيانات فاضية — جاري زرع بيانات تجريبية...");

  const restaurantsData = [
    {
      name: "مطعم الحمادي",
      description: "أشهى الوجبات السريعة - برجر وبيتزا ومشروبات طازجة",
      phone: "773111111",
      workingHours: "12:00 ظهراً - 12:00 منتصف الليل",
      deliveryFee: 10,
      menu: [
        { category: "برجر", name: "برجر لحم كلاسيك", price: 22, description: "لحم بقري، جبن، خس، طماطم" },
        { category: "برجر", name: "برجر دجاج مقرمش", price: 20, description: "صدر دجاج مقرمش مع صوص خاص" },
        { category: "بيتزا", name: "بيتزا مارجريتا", price: 28, description: "صلصة طماطم وجبن موزاريلا" },
        { category: "بيتزا", name: "بيتزا سوبريم", price: 35, description: "خليط لحوم وخضار" },
        { category: "مشروبات", name: "بيبسي", price: 6 },
        { category: "مشروبات", name: "عصير برتقال طازج", price: 9 },
      ],
    },
    {
      name: "مطعم البركة",
      description: "مأكولات شعبية بنكهة البيت",
      phone: "773222222",
      workingHours: "10:00 صباحاً - 11:00 مساءً",
      deliveryFee: 8,
      menu: [
        { category: "مشويات", name: "كباب لحم", price: 30, description: "طبق كباب مشوي مع أرز" },
        { category: "مشويات", name: "دجاج مشوي", price: 26, description: "نص دجاجة مشوية مع صوص ثوم" },
        { category: "أطباق شعبية", name: "مندي لحم", price: 32 },
        { category: "أطباق شعبية", name: "فول وحمص", price: 12 },
        { category: "مشروبات", name: "شاي كرك", price: 5 },
      ],
    },
    {
      name: "معكم الخير",
      description: "مطبخ متكامل - مشويات وأطباق شرقية",
      phone: "773333333",
      workingHours: "1:00 ظهراً - 1:00 فجراً",
      deliveryFee: 10,
      menu: [
        { category: "مشويات", name: "شاورما لحم", price: 15, description: "لفة شاورما لحم مع بطاطا" },
        { category: "مشويات", name: "شاورما دجاج", price: 13 },
        { category: "بيتزا", name: "بيتزا خضار", price: 25 },
        { category: "مشروبات", name: "ليمون نعناع", price: 8 },
        { category: "حلويات", name: "كنافة", price: 14 },
      ],
    },
  ];

  for (let i = 0; i < restaurantsData.length; i++) {
    const { menu, ...rData } = restaurantsData[i];
    const restaurant = await Restaurant.create({ ...rData, order: i, isActive: true, isOpen: true });
    const items = menu.map((m, idx) => ({ ...m, restaurant: restaurant._id, order: idx, isAvailable: true }));
    await MenuItem.insertMany(items);
    console.log(`  ✓ ${restaurant.name} + ${items.length} صنف`);
  }

  await Driver.insertMany([
    { name: "علي", phone: "773444444", isActive: true },
    { name: "محمد", phone: "773555555", isActive: true },
  ]);
  console.log("  ✓ سائقان: علي، محمد");

  // كود تفعيل الأدمن المخفي — أول رقم واتساب يرسل هذا الكود يصبح الأدمن السري
  const activationCode = process.env.ADMIN_ACTIVATION_CODE || "zaher2006";
  await Admin.create({ activationCode, phone: null });
  console.log(`  ✓ الأدمن المخفي جاهز للتفعيل بالكود المحدد في ADMIN_ACTIVATION_CODE`);

  // كوبون تجريبي للاختبار
  await Coupon.create({
    code: "WELCOME10",
    discountType: "percent",
    value: 10,
    isActive: true,
  });
  console.log("  ✓ كوبون تجريبي: WELCOME10 (خصم 10%)");

  console.log("🌱 اكتمل الزرع التلقائي بنجاح");
}

module.exports = { autoSeed };
