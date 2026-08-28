const STATUS_LABELS = {
  new: "جديد", preparing: "قيد التحضير", ready: "جاهز للتوصيل",
  out_for_delivery: "مع السائق", delivered: "تم التوصيل", cancelled: "ملغي",
};
const STATUS_ORDER = ["new", "preparing", "ready", "out_for_delivery", "delivered", "cancelled"];

const NAV_BY_ROLE = {
  admin: [
    { page: "connection", label: "ربط واتساب", icon: "" },
    { page: "overview", label: "📊 نظرة عامة" },
    { page: "orders", label: "📦 الطلبات" },
    { page: "restaurants", label: "🏪 المطاعم" },
    { page: "menu", label: "📋 قوائم الطعام" },
    { page: "drivers", label: "🚗 السائقون" },
    { page: "coupons", label: "🎟️ الكوبونات" },
  ],
  restaurant: [
    { page: "orders", label: "📦 طلباتي" },
    { page: "menu", label: "📋 قائمة الطعام" },
    { page: "restaurant-settings", label: "⚙️ إعدادات المطعم" },
  ],
  driver: [
    { page: "orders", label: "📦 الطلبات" },
    { page: "driver-settings", label: "⚙️ إعداداتي" },
  ],
};

function authData() {
  try { return JSON.parse(localStorage.getItem("auth") || "null"); } catch (_) { return null; }
}
function saveAuth(data) { localStorage.setItem("auth", JSON.stringify(data)); }
function clearAuth() { localStorage.removeItem("auth"); }

async function api(path, options = {}) {
  const auth = authData();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) { clearAuth(); showLogin(); }
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "غير مصرح");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "حدث خطأ");
  return data;
}

function showLogin() {
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
}
function showApp() {
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("app").style.display = "grid";
}

function logout() { clearAuth(); showLogin(); }

// ---------------- تبويبات الدخول ----------------
document.querySelectorAll(".role-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".role-tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".role-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-role-panel="${tab.dataset.role}"]`).classList.add("active");
    document.getElementById("loginError").innerText = "";
  });
});

async function doLogin() {
  const role = document.querySelector(".role-tab.active").dataset.role;
  const errEl = document.getElementById("loginError");
  errEl.innerText = "";
  try {
    let body, data;
    if (role === "admin") {
      body = { password: document.getElementById("adminPassword").value };
      data = await fetch("/api/auth/login/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json().then(j => ({ ok: r.ok, j })));
    } else if (role === "restaurant") {
      body = { phone: document.getElementById("restaurantPhone").value, password: document.getElementById("restaurantPassword").value };
      data = await fetch("/api/auth/login/restaurant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json().then(j => ({ ok: r.ok, j })));
    } else {
      body = { phone: document.getElementById("driverPhone").value, password: document.getElementById("driverPassword").value };
      data = await fetch("/api/auth/login/driver", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(r => r.json().then(j => ({ ok: r.ok, j })));
    }
    if (!data.ok) { errEl.innerText = data.j.error || "فشل تسجيل الدخول"; return; }
    saveAuth({ token: data.j.token, role: data.j.role, name: data.j.name, id: data.j.restaurantId || data.j.driverId || null });
    boot();
  } catch (err) {
    errEl.innerText = "تعذر الاتصال بالسيرفر";
  }
}

// ---------------- الوضع الليلي ----------------
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelectorAll(".theme-toggle").forEach((b) => (b.textContent = theme === "dark" ? "☀️ الوضع النهاري" : "🌙 الوضع الليلي"));
  localStorage.setItem("theme", theme);
}
function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(cur === "dark" ? "light" : "dark");
}
document.getElementById("loginThemeToggle").addEventListener("click", toggleTheme);
document.getElementById("appThemeToggle").addEventListener("click", toggleTheme);
applyTheme(localStorage.getItem("theme") || "light");

// ---------------- بناء التنقل حسب الدور ----------------
function buildNav() {
  const auth = authData();
  const items = NAV_BY_ROLE[auth.role] || [];
  const nav = document.getElementById("navItems");
  nav.innerHTML = items
    .map(
      (it, i) =>
        `<div class="nav-item ${i === 0 ? "active" : ""}" data-page="${it.page}">${it.page === "connection" ? '<span class="nav-dot" id="navConnDot"></span> ' : ""}${it.label}</div>`
    )
    .join("");
  nav.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", () => selectPage(el.dataset.page));
  });
  if (items.length) selectPage(items[0].page);
}

function selectPage(page) {
  document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.classList.toggle("active", n.dataset.page === page));
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add("active");

  if (page === "connection") pollConnection();
  if (page === "overview") loadOverview();
  if (page === "orders") loadOrders();
  if (page === "restaurants") loadRestaurants();
  if (page === "menu") loadMenuPage();
  if (page === "drivers") loadDrivers();
  if (page === "coupons") loadCoupons();
  if (page === "restaurant-settings") loadRestaurantSettings();
}

// ---------------- حالة واتساب (أدمن فقط) ----------------
async function pollConnection() {
  try {
    const state = await api("/whatsapp/status");
    const pill = document.getElementById("connStatusPill");
    const text = document.getElementById("connStatusText");
    const dot = document.getElementById("navConnDot");
    pill.className = `status-pill ${state.status}`;
    pill.innerText = { starting: "جاري التشغيل", qr: "بانتظار المسح", authenticated: "تم الدخول", ready: "متصل ✅", disconnected: "غير متصل" }[state.status] || state.status;
    text.innerText = state.lastMessage || "";
    if (dot) dot.className = "nav-dot " + (state.status === "ready" ? "ready" : state.status === "qr" ? "waiting" : "");
    const img = document.getElementById("qrImage");
    if (state.qrDataUrl) { img.src = state.qrDataUrl; img.style.display = "block"; } else { img.style.display = "none"; }
  } catch (_) {}
}

// ---------------- نظرة عامة (أدمن) ----------------
async function loadOverview() {
  const data = await api("/admin/overview");
  const grid = document.getElementById("overviewStats");
  const ordersMap = {};
  (data.ordersAgg || []).forEach((a) => (ordersMap[a._id] = a.count));
  const cards = [
    { num: data.restaurantsCount, label: "المطاعم" },
    { num: data.driversCount, label: "السائقون" },
    { num: data.customersCount, label: "الزبائن" },
    ...STATUS_ORDER.map((s) => ({ num: ordersMap[s] || 0, label: STATUS_LABELS[s] })),
  ];
  grid.innerHTML = cards.map((c) => `<div class="stat-card"><div class="num">${c.num}</div><div class="label">${c.label}</div></div>`).join("");
}

// ---------------- المطاعم (أدمن) ----------------
async function loadRestaurants() {
  const list = await api("/restaurants");
  const auth = authData();
  if (auth.role === "admin") {
    const tbody = document.querySelector("#restaurantsTable tbody");
    if (tbody) {
      tbody.innerHTML = list.map((r) => `<tr>
        <td>${r.name}</td><td>${r.phone}</td><td>${r.isActive ? "نشط" : "متوقف"}</td>
        <td>
          <button class="btn small" onclick="toggleRestaurant('${r._id}', ${!r.isActive})">${r.isActive ? "إيقاف" : "تفعيل"}</button>
          <button class="btn small danger" onclick="deleteRestaurant('${r._id}')">حذف</button>
        </td></tr>`).join("");
    }
    const opts = list.map((r) => `<option value="${r._id}">${r.name}</option>`).join("");
    const mR = document.getElementById("mRestaurant"); if (mR) mR.innerHTML = opts;
    const mF = document.getElementById("menuFilterRestaurant"); if (mF) mF.innerHTML = `<option value="">اختر مطعم</option>` + opts;
    const oF = document.getElementById("orderRestaurantFilter"); if (oF) oF.innerHTML = `<option value="">كل المطاعم</option>` + opts;
  }
  return list;
}

async function createRestaurant() {
  const name = document.getElementById("rName").value.trim();
  const phone = document.getElementById("rPhone").value.trim();
  const password = document.getElementById("rPassword").value.trim();
  const description = document.getElementById("rDesc").value.trim();
  const deliveryFee = parseFloat(document.getElementById("rDeliveryFee").value) || 0;
  if (!name || !phone || !password) return alert("الاسم والجوال وكلمة المرور مطلوبة");
  await api("/restaurants", { method: "POST", body: JSON.stringify({ name, phone, password, description, deliveryFee }) });
  ["rName", "rPhone", "rPassword", "rDesc"].forEach((id) => (document.getElementById(id).value = ""));
  loadRestaurants();
}
async function toggleRestaurant(id, isActive) { await api(`/restaurants/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }); loadRestaurants(); }
async function deleteRestaurant(id) { if (!confirm("حذف المطعم وكل قائمته؟")) return; await api(`/restaurants/${id}`, { method: "DELETE" }); loadRestaurants(); }

// ---------------- إعدادات المطعم (self-service) ----------------
async function loadRestaurantSettings() {
  const list = await api("/restaurants");
  const r = list[0];
  if (!r) return;
  document.getElementById("rsName").value = r.name || "";
  document.getElementById("rsHours").value = r.workingHours || "";
  document.getElementById("rsDeliveryFee").value = r.deliveryFee || 0;
  document.getElementById("rsBankAccount").value = r.bankAccount || "";
  document.getElementById("rsDesc").value = r.description || "";
  document.getElementById("rsIsOpen").checked = r.isOpen !== false;
  window._myRestaurantId = r._id;
}
async function saveRestaurantSettings() {
  const id = window._myRestaurantId;
  const body = {
    name: document.getElementById("rsName").value.trim(),
    workingHours: document.getElementById("rsHours").value.trim(),
    deliveryFee: parseFloat(document.getElementById("rsDeliveryFee").value) || 0,
    bankAccount: document.getElementById("rsBankAccount").value.trim(),
    description: document.getElementById("rsDesc").value.trim(),
    isOpen: document.getElementById("rsIsOpen").checked,
  };
  await api(`/restaurants/${id}`, { method: "PUT", body: JSON.stringify(body) });
  alert("تم الحفظ ✅");
}

async function changeMyPassword(role) {
  const inputId = role === "restaurant" ? "rsNewPassword" : "dsNewPassword";
  const password = document.getElementById(inputId).value.trim();
  if (!password || password.length < 4) return alert("كلمة مرور قصيرة جداً");
  const auth = authData();
  const path = role === "restaurant" ? `/restaurants/${auth.id || window._myRestaurantId}` : `/drivers/${auth.id}`;
  await api(path, { method: "PUT", body: JSON.stringify({ password }) });
  document.getElementById(inputId).value = "";
  alert("تم تحديث كلمة المرور ✅");
}

// ---------------- قوائم الطعام ----------------
async function loadMenuPage() {
  const auth = authData();
  const picker = document.getElementById("menuRestaurantPicker");
  const filterWrap = document.getElementById("menuFilterWrap");
  if (auth.role === "restaurant") {
    picker.style.display = "none";
    filterWrap.style.display = "none";
    loadMenuItems();
  } else {
    picker.style.display = "";
    filterWrap.style.display = "";
    await loadRestaurants();
    loadMenuItems();
  }
}
async function loadMenuItems() {
  const auth = authData();
  let url = "/menu-items";
  if (auth.role === "admin") {
    const restaurantId = document.getElementById("menuFilterRestaurant").value;
    if (!restaurantId) { document.querySelector("#menuTable tbody").innerHTML = `<tr><td colspan="5" class="empty-hint">اختر مطعماً لعرض قائمته</td></tr>`; return; }
    url += `?restaurant=${restaurantId}`;
  }
  const items = await api(url);
  document.querySelector("#menuTable tbody").innerHTML = items.map((i) => `<tr>
    <td>${i.category}</td><td>${i.name}</td><td>${i.price.toFixed(2)} ريال</td><td>${i.isAvailable ? "متاح" : "غير متاح"}</td>
    <td>
      <button class="btn small" onclick="toggleMenuItem('${i._id}', ${!i.isAvailable})">${i.isAvailable ? "إخفاء" : "إظهار"}</button>
      <button class="btn small danger" onclick="deleteMenuItem('${i._id}')">حذف</button>
    </td></tr>`).join("") || `<tr><td colspan="5" class="empty-hint">لا توجد أصناف بعد</td></tr>`;
}
async function createMenuItem() {
  const auth = authData();
  const restaurant = auth.role === "admin" ? document.getElementById("mRestaurant").value : undefined;
  const category = document.getElementById("mCategory").value.trim();
  const name = document.getElementById("mName").value.trim();
  const price = parseFloat(document.getElementById("mPrice").value);
  const description = document.getElementById("mDesc").value.trim();
  if ((auth.role === "admin" && !restaurant) || !category || !name || isNaN(price)) return alert("تأكد من تعبئة كل الحقول");
  await api("/menu-items", { method: "POST", body: JSON.stringify({ restaurant, category, name, price, description }) });
  ["mCategory", "mName", "mPrice", "mDesc"].forEach((id) => (document.getElementById(id).value = ""));
  if (auth.role === "admin") document.getElementById("menuFilterRestaurant").value = restaurant;
  loadMenuItems();
}
async function toggleMenuItem(id, isAvailable) { await api(`/menu-items/${id}`, { method: "PUT", body: JSON.stringify({ isAvailable }) }); loadMenuItems(); }
async function deleteMenuItem(id) { if (!confirm("حذف هذا الصنف؟")) return; await api(`/menu-items/${id}`, { method: "DELETE" }); loadMenuItems(); }

// ---------------- السائقون (أدمن) ----------------
async function loadDrivers() {
  const list = await api("/drivers");
  document.querySelector("#driversTable tbody").innerHTML = list.map((d) => `<tr>
    <td>${d.name}</td><td>${d.phone}</td><td>${d.isActive ? "نشط" : "متوقف"}</td>
    <td>
      <button class="btn small" onclick="toggleDriver('${d._id}', ${!d.isActive})">${d.isActive ? "إيقاف" : "تفعيل"}</button>
      <button class="btn small danger" onclick="deleteDriver('${d._id}')">حذف</button>
    </td></tr>`).join("") || `<tr><td colspan="4" class="empty-hint">لا يوجد سائقون بعد</td></tr>`;
}
async function createDriver() {
  const name = document.getElementById("dName").value.trim();
  const phone = document.getElementById("dPhone").value.trim();
  const password = document.getElementById("dPassword").value.trim();
  if (!name || !phone || !password) return alert("كل الحقول مطلوبة");
  await api("/drivers", { method: "POST", body: JSON.stringify({ name, phone, password }) });
  ["dName", "dPhone", "dPassword"].forEach((id) => (document.getElementById(id).value = ""));
  loadDrivers();
}
async function toggleDriver(id, isActive) { await api(`/drivers/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }); loadDrivers(); }
async function deleteDriver(id) { if (!confirm("حذف هذا السائق؟")) return; await api(`/drivers/${id}`, { method: "DELETE" }); loadDrivers(); }

// ---------------- الكوبونات (أدمن) ----------------
async function loadCoupons() {
  const list = await api("/coupons");
  document.querySelector("#couponsTable tbody").innerHTML = list.map((c) => `<tr>
    <td>${c.code}</td>
    <td>${c.discountType === "percent" ? c.value + "%" : c.value + " ريال"}</td>
    <td>${c.usedCount}${c.usageLimit ? "/" + c.usageLimit : ""}</td>
    <td>${c.isActive ? "فعال" : "متوقف"}</td>
    <td>
      <button class="btn small" onclick="toggleCoupon('${c._id}', ${!c.isActive})">${c.isActive ? "إيقاف" : "تفعيل"}</button>
      <button class="btn small danger" onclick="deleteCoupon('${c._id}')">حذف</button>
    </td></tr>`).join("") || `<tr><td colspan="5" class="empty-hint">لا توجد كوبونات بعد</td></tr>`;
}
async function createCoupon() {
  const code = document.getElementById("cCode").value.trim().toUpperCase();
  const discountType = document.getElementById("cType").value;
  const value = parseFloat(document.getElementById("cValue").value);
  const usageLimit = document.getElementById("cLimit").value ? parseInt(document.getElementById("cLimit").value, 10) : null;
  if (!code || isNaN(value)) return alert("تأكد من الكود والقيمة");
  await api("/coupons", { method: "POST", body: JSON.stringify({ code, discountType, value, usageLimit }) });
  ["cCode", "cValue", "cLimit"].forEach((id) => (document.getElementById(id).value = ""));
  loadCoupons();
}
async function toggleCoupon(id, isActive) { await api(`/coupons/${id}`, { method: "PUT", body: JSON.stringify({ isActive }) }); loadCoupons(); }
async function deleteCoupon(id) { if (!confirm("حذف هذا الكوبون؟")) return; await api(`/coupons/${id}`, { method: "DELETE" }); loadCoupons(); }

// ---------------- الطلبات (مشترك) ----------------
async function loadOrders() {
  const auth = authData();
  let qs = "";
  if (auth.role === "admin") {
    if (!document.getElementById("orderRestaurantFilter").options.length) await loadRestaurants();
    const restaurantId = document.getElementById("orderRestaurantFilter").value;
    qs = restaurantId ? `?restaurant=${restaurantId}` : "";
  }
  const orders = await api(`/orders${qs}`);
  const kanban = document.getElementById("ordersKanban");
  kanban.innerHTML = STATUS_ORDER.map((status) => {
    const inCol = orders.filter((o) => o.status === status);
    return `<div class="kanban-col"><h3>${STATUS_LABELS[status]} (${inCol.length})</h3>
      ${inCol.map((o) => `<div class="order-card">
          <div class="num">#${o.orderNumber}</div>
          <div>${o.restaurant ? o.restaurant.name : ""}</div>
          <div>${o.customer.name} — ${o.customer.phone.replace("@c.us", "")}</div>
          <div>${o.totalPrice.toFixed(2)} ريال</div>
          <select onchange="changeOrderStatus('${o._id}', this.value)">
            ${STATUS_ORDER.map((s) => `<option value="${s}" ${s === o.status ? "selected" : ""}>${STATUS_LABELS[s]}</option>`).join("")}
          </select>
        </div>`).join("") || `<div class="empty-hint">لا يوجد</div>`}
    </div>`;
  }).join("");
}
async function changeOrderStatus(id, status) { await api(`/orders/${id}/status`, { method: "PUT", body: JSON.stringify({ status }) }); loadOrders(); }

// ---------------- بدء التشغيل ----------------
let pollTimer = null;
function boot() {
  const auth = authData();
  if (!auth) { showLogin(); return; }
  showApp();
  buildNav();
  if (pollTimer) clearInterval(pollTimer);
  if (auth.role === "admin") pollTimer = setInterval(pollConnection, 4000);
}

if (authData()) boot(); else showLogin();
