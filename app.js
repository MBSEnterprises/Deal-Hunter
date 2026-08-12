const SUPABASE_URL = "https://uxtpwtverjwceekkrrzo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3bFWc3DG2by4XXVu1qe6FA_8Z3NAst6";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const el = (id) => document.getElementById(id);

const loginView = el("loginView");
const appView = el("appView");
const loginForm = el("loginForm");
const signOutBtn = el("signOutBtn");
const watchlist = el("watchlist");
const emptyState = el("emptyState");
const appMessage = el("appMessage");

const itemDialog = el("itemDialog");
const itemForm = el("itemForm");
const deleteItemBtn = el("deleteItemBtn");

let currentUser = null;
let items = [];

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function prettyUrgency(value) {
  return {
    can_wait: "Can wait",
    normal: "Normal",
    buy_soon: "Buy soon",
    buy_now: "Buy now"
  }[value] || value || "—";
}

function daysSince(dateString) {
  if (!dateString) return null;
  const start = new Date(dateString + "T00:00:00");
  const now = new Date();
  const ms = now - start;
  return Math.max(0, Math.floor(ms / 86400000));
}

function setMessage(node, text = "", type = "") {
  node.textContent = text;
  node.className = "message" + (type ? ` ${type}` : "");
}

async function refreshSession() {
  const { data, error } = await db.auth.getSession();
  if (error) {
    setMessage(el("loginMessage"), error.message, "error");
    return;
  }

  currentUser = data.session?.user || null;

  if (currentUser) {
    loginView.classList.add("hidden");
    appView.classList.remove("hidden");
    signOutBtn.classList.remove("hidden");
    await loadWatchlist();
  } else {
    loginView.classList.remove("hidden");
    appView.classList.add("hidden");
    signOutBtn.classList.add("hidden");
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(el("loginMessage"), "Signing in...");

  const email = el("email").value.trim();
  const password = el("password").value;

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    setMessage(el("loginMessage"), error.message, "error");
    return;
  }

  el("password").value = "";
  setMessage(el("loginMessage"), "");
  await refreshSession();
});

signOutBtn.addEventListener("click", async () => {
  await db.auth.signOut();
  currentUser = null;
  items = [];
  watchlist.innerHTML = "";
  await refreshSession();
});

async function loadWatchlist() {
  setMessage(appMessage, "Loading...");

  const { data, error } = await db
    .from("watchlist_items")
    .select("*")
    .order("search_started_at", { ascending: true });

  if (error) {
    setMessage(appMessage, error.message, "error");
    return;
  }

  items = data || [];
  renderWatchlist();
  setMessage(appMessage, "");
}

function renderWatchlist() {
  const activeItems = items.filter((item) => item.active !== false);

  el("activeCount").textContent = activeItems.length;

  const buyNowValues = activeItems
    .map((i) => Number(i.buy_now_price))
    .filter((n) => Number.isFinite(n) && n > 0);
  el("bestBuyNow").textContent = buyNowValues.length ? money(Math.min(...buyNowValues)) : "—";

  const searchDays = activeItems
    .map((i) => daysSince(i.search_started_at))
    .filter((n) => Number.isFinite(n));
  el("oldestSearch").textContent = searchDays.length ? `${Math.max(...searchDays)} days` : "—";

  if (!activeItems.length) {
    watchlist.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }

  emptyState.classList.add("hidden");

  watchlist.innerHTML = activeItems.map((item) => {
    const d = daysSince(item.search_started_at);
    const brandModel = [item.brand, item.model].filter(Boolean).join(" ");
    const subtitle = brandModel || item.category || "";
    return `
      <article class="item-card">
        <div>
          <h3>${escapeHtml(item.item_name)}</h3>
          <div class="item-meta">
            ${escapeHtml(subtitle)}
            ${item.condition_preference ? ` · ${escapeHtml(item.condition_preference)}` : ""}
            ${item.urgency ? ` · ${escapeHtml(prettyUrgency(item.urgency))}` : ""}
          </div>
          <div class="price-row">
            <span class="price-pill buy">Buy now ${money(item.buy_now_price)}</span>
            <span class="price-pill target">Target ${money(item.target_price)}</span>
            <span class="price-pill max">Max ${money(item.maximum_price)}</span>
          </div>
        </div>
        <div class="item-side">
          <div class="days">
            <strong>${d ?? "—"}</strong>
            days searching
          </div>
          <button class="ghost" onclick="editItem('${item.id}')">Edit</button>
        </div>
      </article>
    `;
  }).join("");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetForm() {
  itemForm.reset();
  el("itemId").value = "";
  el("dialogTitle").textContent = "Add item";
  deleteItemBtn.classList.add("hidden");
  el("active").checked = true;
  el("localRadius").value = "300";
  el("conditionPreference").value = "used";
  el("urgency").value = "can_wait";
  el("searchStartedAt").value = new Date().toISOString().slice(0, 10);
  setMessage(el("dialogMessage"), "");
}

el("addItemBtn").addEventListener("click", () => {
  resetForm();
  itemDialog.showModal();
});

el("closeDialogBtn").addEventListener("click", () => itemDialog.close());
el("cancelBtn").addEventListener("click", () => itemDialog.close());

window.editItem = (id) => {
  const item = items.find((x) => x.id === id);
  if (!item) return;

  el("itemId").value = item.id;
  el("dialogTitle").textContent = "Edit item";
  el("itemName").value = item.item_name || "";
  el("brand").value = item.brand || "";
  el("model").value = item.model || "";
  el("searchKeywords").value = item.search_keywords || "";
  el("category").value = item.category || "";
  el("conditionPreference").value = item.condition_preference || "used";
  el("buyNowPrice").value = item.buy_now_price ?? "";
  el("targetPrice").value = item.target_price ?? "";
  el("maximumPrice").value = item.maximum_price ?? "";
  el("urgency").value = item.urgency || "can_wait";
  el("localRadius").value = item.local_search_radius_miles ?? 300;
  el("shippingRequired").checked = !!item.shipping_required;
  el("californiaShippingRequired").checked = !!item.california_shipping_required;
  el("notes").value = item.notes || "";
  el("searchStartedAt").value = item.search_started_at || "";
  el("active").checked = item.active !== false;
  deleteItemBtn.classList.remove("hidden");
  setMessage(el("dialogMessage"), "");
  itemDialog.showModal();
};

function numericOrNull(id) {
  const value = el(id).value.trim();
  return value === "" ? null : Number(value);
}

itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    setMessage(el("dialogMessage"), "You are not signed in.", "error");
    return;
  }

  const id = el("itemId").value;

  const record = {
    user_id: currentUser.id,
    item_name: el("itemName").value.trim(),
    brand: el("brand").value.trim() || null,
    model: el("model").value.trim() || null,
    search_keywords: el("searchKeywords").value.trim() || null,
    category: el("category").value.trim() || null,
    condition_preference: el("conditionPreference").value,
    buy_now_price: numericOrNull("buyNowPrice"),
    target_price: numericOrNull("targetPrice"),
    maximum_price: numericOrNull("maximumPrice"),
    urgency: el("urgency").value,
    local_search_radius_miles: numericOrNull("localRadius") ?? 300,
    shipping_required: el("shippingRequired").checked,
    california_shipping_required: el("californiaShippingRequired").checked,
    notes: el("notes").value.trim() || null,
    search_started_at: el("searchStartedAt").value || new Date().toISOString().slice(0, 10),
    active: el("active").checked
  };

  setMessage(el("dialogMessage"), "Saving...");

  let result;
  if (id) {
    result = await db
      .from("watchlist_items")
      .update(record)
      .eq("id", id);
  } else {
    result = await db
      .from("watchlist_items")
      .insert(record);
  }

  if (result.error) {
    setMessage(el("dialogMessage"), result.error.message, "error");
    return;
  }

  itemDialog.close();
  await loadWatchlist();
});

deleteItemBtn.addEventListener("click", async () => {
  const id = el("itemId").value;
  if (!id) return;

  const item = items.find((x) => x.id === id);
  const name = item?.item_name || "this item";

  if (!confirm(`Delete "${name}" from Deal Hunter?`)) return;

  const { error } = await db
    .from("watchlist_items")
    .delete()
    .eq("id", id);

  if (error) {
    setMessage(el("dialogMessage"), error.message, "error");
    return;
  }

  itemDialog.close();
  await loadWatchlist();
});

db.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user || null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

refreshSession();
