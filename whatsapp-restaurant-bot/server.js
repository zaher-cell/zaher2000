require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { connectDB } = require("./config/db");
const { autoSeed } = require("./config/seed");
const { createClient, getClient } = require("./bot/client");
const { attachRouter } = require("./bot/router");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// فحص صحة بسيط (يفيد مع خدمات "إبقاء الموقع مستيقظ" مثل UptimeRobot)
app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api", apiRoutes);

async function start() {
  try {
    await connectDB();
    await autoSeed();

    const client = await createClient();
    attachRouter(client);
    client.initialize();

    app.listen(PORT, () => {
      console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
      console.log(`   الداشبورد: افتح الرابط الأساسي في المتصفح`);
    });
  } catch (err) {
    console.error("❌ فشل بدء التشغيل:", err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

start();
