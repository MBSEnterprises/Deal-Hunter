const SUPABASE_URL = "https://uxtpwtverjwceekkrrzo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3bFWc3DG2by4XXVu1qe6FA_8Z3NAst6";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const el = (id) => document.getElementById(id);
const loginView = el("loginView"), appView = el("appView"), loginForm = el("loginForm"), signOutBtn = el("signOutBtn"), watchlist = el("watchlist"), emptyState = el("emptyState"), appMessage = el("appMessage");
const itemDialog = el("itemDialog"), itemForm = el("itemForm"), archiveItemBtn = el("archiveItemBtn");
let currentUser = null, items = [], selectedStatus = "watching";

function money(value) { if (value === null || value === undefined || value === "") return "—"; return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:0 }).format(Number(value)); }
function prettyUrgency(value) { return ({can_wait:"Can wait",normal:"Normal",buy_soon:"Buy soon",buy_now:"Buy now"})[value] || value || "—"; }
function prettyStatus(value) { return ({watching:"Watching",paused:"Paused",purchased:"Purchased",stopped:"Stopped",archived:"Archived"})[value] || value || "—"; }
function daysSince(dateString) { if (!dateString) return null; const start = new Date(dateString + "T00:00:00"), now = new Date(); return Math.max(0, Math.floor((now-start)/86400000)); }
function setMessage(node,text="",type="") { node.textContent=text; node.className="message"+(type?` ${type}`:""); }
function escapeHtml(value="") { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

async function refreshSession(){ const {data,error}=await db.auth.getSession(); if(error){setMessage(el("loginMessage"),error.message,"error");return;} currentUser=data.session?.user||null; if(currentUser){loginView.classList.add("hidden");appView.classList.remove("hidden");signOutBtn.classList.remove("hidden");await loadWatchlist();}else{loginView.classList.remove("hidden");appView.classList.add("hidden");signOutBtn.classList.add("hidden");}}
loginForm.addEventListener("submit",async(e)=>{e.preventDefault();setMessage(el("loginMessage"),"Signing in...");const {error}=await db.auth.signInWithPassword({email:el("email").value.trim(),password:el("password").value});if(error){setMessage(el("loginMessage"),error.message,"error");return;}el("password").value="";setMessage(el("loginMessage"),"");await refreshSession();});
signOutBtn.addEventListener("click",async()=>{await db.auth.signOut();currentUser=null;items=[];watchlist.innerHTML="";await refreshSession();});

async function loadWatchlist(){setMessage(appMessage,"Loading...");const {data,error}=await db.from("watchlist_items").select("*").order("search_started_at",{ascending:true});if(error){setMessage(appMessage,error.message,"error");return;}items=data||[];renderWatchlist();setMessage(appMessage,"");}

function updateFilterButtons(){document.querySelectorAll(".status-filter").forEach(btn=>{const active=btn.dataset.status===selectedStatus;btn.classList.toggle("primary",active);btn.classList.toggle("ghost",!active);});}

document.querySelectorAll(".status-filter").forEach(btn=>btn.addEventListener("click",()=>{selectedStatus=btn.dataset.status;updateFilterButtons();renderWatchlist();}));

function renderWatchlist(){
  const watching=items.filter(i=>i.status==="watching");
  const paused=items.filter(i=>i.status==="paused");
  const purchased=items.filter(i=>i.status==="purchased");
  el("activeCount").textContent=watching.length;
  el("pausedCount").textContent=paused.length;
  el("purchasedCount").textContent=purchased.length;

  const shown=items.filter(i=>(i.status||"watching")===selectedStatus);
  if(!shown.length){watchlist.innerHTML="";emptyState.classList.remove("hidden");return;}
  emptyState.classList.add("hidden");

  watchlist.innerHTML=shown.map(item=>{
    const d=daysSince(item.search_started_at);
    const subtitle=[item.brand,item.model].filter(Boolean).join(" ")||item.category||"";
    const methods=[item.local_pickup_allowed!==false?"Pickup":null,item.shipping_allowed!==false?"Shipping":null].filter(Boolean).join(" + ");
    const priceBits=[];
    if(item.buy_now_price!=null) priceBits.push(`<span class="price-pill buy">Buy now ${money(item.buy_now_price)}</span>`);
    if(item.target_price!=null) priceBits.push(`<span class="price-pill target">Target ${money(item.target_price)}</span>`);
    if(item.maximum_price!=null) priceBits.push(`<span class="price-pill max">Max ${money(item.maximum_price)}</span>`);
    return `<article class="item-card"><div><h3>${escapeHtml(item.item_name)}</h3><div class="item-meta">${escapeHtml(subtitle)}${item.condition_preference?` · ${escapeHtml(item.condition_preference)}`:""}${item.urgency?` · ${escapeHtml(prettyUrgency(item.urgency))}`:""}${methods?` · ${escapeHtml(methods)}`:""} · ${escapeHtml(prettyStatus(item.status||"watching"))}</div><div class="price-row">${priceBits.join("")}</div></div><div class="item-side"><div class="days"><strong>${d??"—"}</strong>days since started</div><button class="ghost" onclick="editItem('${item.id}')">Edit</button></div></article>`;
  }).join("");
}

function resetForm(){itemForm.reset();el("itemId").value="";el("dialogTitle").textContent="Add item";archiveItemBtn.classList.add("hidden");el("status").value="watching";el("localPickupAllowed").checked=true;el("shippingAllowed").checked=true;el("localRadius").value="300";el("conditionPreference").value="used";el("urgency").value="can_wait";el("searchStartedAt").value=new Date().toISOString().slice(0,10);setMessage(el("dialogMessage"),"");}
el("addItemBtn").addEventListener("click",()=>{resetForm();itemDialog.showModal();});el("closeDialogBtn").addEventListener("click",()=>itemDialog.close());el("cancelBtn").addEventListener("click",()=>itemDialog.close());
window.editItem=(id)=>{const item=items.find(x=>x.id===id);if(!item)return;el("itemId").value=item.id;el("dialogTitle").textContent="Edit item";el("itemName").value=item.item_name||"";el("brand").value=item.brand||"";el("model").value=item.model||"";el("searchKeywords").value=item.search_keywords||"";el("category").value=item.category||"";el("conditionPreference").value=item.condition_preference||"used";el("buyNowPrice").value=item.buy_now_price??"";el("targetPrice").value=item.target_price??"";el("maximumPrice").value=item.maximum_price??"";el("urgency").value=item.urgency||"can_wait";el("localRadius").value=item.local_search_radius_miles??300;el("status").value=item.status||"watching";el("localPickupAllowed").checked=item.local_pickup_allowed!==false;el("shippingAllowed").checked=item.shipping_allowed!==false;el("notes").value=item.notes||"";el("searchStartedAt").value=item.search_started_at||"";archiveItemBtn.classList.toggle("hidden",item.status==="archived");setMessage(el("dialogMessage"),"");itemDialog.showModal();};
function numericOrNull(id){const value=el(id).value.trim();return value===""?null:Number(value);}
itemForm.addEventListener("submit",async(e)=>{e.preventDefault();if(!currentUser){setMessage(el("dialogMessage"),"You are not signed in.","error");return;}if(!el("localPickupAllowed").checked&&!el("shippingAllowed").checked){setMessage(el("dialogMessage"),"Choose at least one way to get the item: local pickup or shipping.","error");return;}const id=el("itemId").value;const record={user_id:currentUser.id,item_name:el("itemName").value.trim(),brand:el("brand").value.trim()||null,model:el("model").value.trim()||null,search_keywords:el("searchKeywords").value.trim()||null,category:el("category").value.trim()||null,condition_preference:el("conditionPreference").value,buy_now_price:numericOrNull("buyNowPrice"),target_price:numericOrNull("targetPrice"),maximum_price:numericOrNull("maximumPrice"),urgency:el("urgency").value,local_search_radius_miles:numericOrNull("localRadius")??300,local_pickup_allowed:el("localPickupAllowed").checked,shipping_allowed:el("shippingAllowed").checked,notes:el("notes").value.trim()||null,search_started_at:el("searchStartedAt").value||new Date().toISOString().slice(0,10),status:el("status").value};setMessage(el("dialogMessage"),"Saving...");const result=id?await db.from("watchlist_items").update(record).eq("id",id):await db.from("watchlist_items").insert(record);if(result.error){setMessage(el("dialogMessage"),result.error.message,"error");return;}itemDialog.close();selectedStatus=record.status;updateFilterButtons();await loadWatchlist();});
archiveItemBtn.addEventListener("click",async()=>{const id=el("itemId").value;if(!id)return;const item=items.find(x=>x.id===id),name=item?.item_name||"this item";if(!confirm(`Archive "${name}"? Nothing will be deleted and its history will be kept.`))return;const {error}=await db.from("watchlist_items").update({status:"archived"}).eq("id",id);if(error){setMessage(el("dialogMessage"),error.message,"error");return;}itemDialog.close();selectedStatus="archived";updateFilterButtons();await loadWatchlist();});

db.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;});
if("serviceWorker" in navigator){window.addEventListener("load",()=>{navigator.serviceWorker.register("./service-worker.js").catch(()=>{});});}
updateFilterButtons();
refreshSession();
