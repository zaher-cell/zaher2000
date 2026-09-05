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

    // Important: Start listening BEFORE initializing the WhatsApp client.
    // This ensures the host (Render) detects an open port quickly and doesn't
    // kill the service while the potentially long Chrome / Puppeteer
    // installation runs in the background.
    const server = app.listen(PORT, () => {
      console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
      console.log(`   الداشبورد: افتح الرابط الأساسي في المتصفح`);
    });

    // Initialize the WhatsApp client asynchronously so it doesn't block
    // the server from binding the port. Errors from the client should not
    // bring down the whole process — they are logged for debugging.
    createClient()
      .then((client) => {
        try {
          attachRouter(client);
          client.initialize();
        } catch (err) {
          console.error("❌ خطأ أثناء تهيئة عميل واتساب:", err);
        }
      })
      .catch((err) => {
        // createClient failed (e.g., Chrome install failed). Log but don't exit.
        console.error("❌ فشل إنشاء عميل واتساب (لن يتم إيقاف السيرفر):", err);
      });
  } catch (err) {
    // Critical errors (DB/connect/seed) should still stop the process.
    console.error("❌ فشل بدء التشغيل:", err);
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

start();
