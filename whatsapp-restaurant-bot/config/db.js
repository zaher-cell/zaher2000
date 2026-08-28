const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI غير موجود في متغيرات البيئة (.env)");
  }
  await mongoose.connect(uri);
  console.log("✅ تم الاتصال بقاعدة البيانات MongoDB");
  return mongoose.connection;
}

module.exports = { connectDB, mongoose };
