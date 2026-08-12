const SUPABASE_URL = "https://uxtpwtverjwceekkrrzo.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3bFWc3DG2by4XXVu1qe6FA_8Z3NAst6";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const el = (id) => document.getElementById(id);
const loginView = el("loginView"), appView = el("appView"), loginForm = el("loginForm"), signOutBtn = el("signOutBtn"), watchlist = el("watchlist"), emptyState = el("emptyState"), appMessage = el("appMessage");
const itemDialog = el("itemDialog"), itemForm = el("itemForm"), archiveItemBtn = el("archiveItemBtn"), dealsDialog = el("dealsDialog"), dealsList = el("dealsList");
let currentUser = null, items = [], listingCounts = {}, selectedStatus = "watching";

function money(value) { if (value === null || value === undefined || value === "") return "—"; return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", maximumFractionDigits:2 }).format(Number(value)); }
function prettyUrgency(value) { return ({can_wait:"Can wait",normal:"Normal",buy_soon:"Buy soon",buy_now:"Buy now"})[value] || value || "—"; }
function prettyStatus(value) { return ({watching:"Watching",paused:"Paused",purchased:"Purchased",stopped:"Stopped",archived:"Archived"})[value] || value || "—"; }
function prettyRating(value) { return ({buy_now:"BUY NOW",target:"Target hit",acceptable:"In range",above_range:"Above range"})[value] || "Price unknown"; }
function daysSince(dateString) { if (!dateString) return null; const start = new Date(dateString + "T00:00:00"), now = new Date(); return Math.max(0, Math.floor((now-start)/86400000)); }
function setMessage(node,text="",type="") { node.textContent=text; node.className="message"+(type?` ${type}`:""); }
function escapeHtml(value="") { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function numericOrNull(id){const value=el(id).value.trim();return value===""?null:Number(value);}

async function refreshSession(){
  const {data,error}=await db.auth.getSession();
  if(error){setMessage(el("loginMessage"),error.message,"error");return;}
  currentUser=data.session?.user||null;
  if(currentUser){loginView.classList.add("hidden");appView.classList.remove("hidden");signOutBtn.classList.remove("hidden");await loadWatchlist();}
  else{loginView.classList.remove("hidden");appView.classList.add("hidden");signOutBtn.classList.add("hidden");}
}

loginForm.addEventListener("submit",async(e)=>{
  e.preventDefault();setMessage(el("loginMessage"),"Signing in...");
  const {error}=await db.auth.signInWithPassword({email:el("email").value.trim(),password:el("password").value});
  if(error){setMessage(el("loginMessage"),error.message,"error");return;}
  el("password").value="";setMessage(el("loginMessage"),"");await refreshSession();
});
signOutBtn.addEventListener("click",async()=>{await db.auth.signOut();currentUser=null;items=[];watchlist.innerHTML="";await refreshSession();});

async function loadWatchlist(){
  setMessage(appMessage,"Loading...");
  const [{data,error},{data:listings,error:listError}] = await Promise.all([
    db.from("watchlist_items").select("*").order("search_started_at",{ascending:true}),
    db.from("listings").select("watchlist_item_id, deal_rating").eq("available",true)
  ]);
  if(error){setMessage(appMessage,error.message,"error");return;}
  if(listError){setMessage(appMessage,listError.message,"error");return;}
  items=data||[];
  listingCounts={};
  for(const row of listings||[]){
    const id=row.watchlist_item_id;
    if(!id) continue;
    listingCounts[id] ||= {all:0, deals:0};
    listingCounts[id].all++;
    if(["buy_now","target","acceptable"].includes(row.deal_rating)) listingCounts[id].deals++;
  }
  renderWatchlist();setMessage(appMessage,"");
}

function updateFilterButtons(){document.querySelectorAll(".status-filter").forEach(btn=>{const active=btn.dataset.status===selectedStatus;btn.classList.toggle("primary",active);btn.classList.toggle("ghost",!active);});}
document.querySelectorAll(".status-filter").forEach(btn=>btn.addEventListener("click",()=>{selectedStatus=btn.dataset.status;updateFilterButtons();renderWatchlist();}));

function renderWatchlist(){
  const watching=items.filter(i=>i.status==="watching");
  const purchased=items.filter(i=>i.status==="purchased");
  const dealTotal=Object.values(listingCounts).reduce((sum,x)=>sum+(x.deals||0),0);
  el("activeCount").textContent=watching.length;
  el("dealCount").textContent=dealTotal;
  el("purchasedCount").textContent=purchased.length;

  const shown=items.filter(i=>(i.status||"watching")===selectedStatus);
  if(!shown.length){watchlist.innerHTML="";emptyState.classList.remove("hidden");return;}
  emptyState.classList.add("hidden");

  watchlist.innerHTML=shown.map(item=>{
    const d=daysSince(item.search_started_at);
    const subtitle=[item.brand,item.model].filter(Boolean).join(" ")||item.category||"";
    const methods=[item.local_pickup_allowed!==false?"Pickup":null,item.shipping_allowed!==false?"Shipping":null].filter(Boolean).join(" + ");
    const priceBits=[];
    if(item.hoped_for_price!=null) priceBits.push(`<span class="price-pill hoped">Hope ${money(item.hoped_for_price)}</span>`);
    if(item.buy_now_price!=null) priceBits.push(`<span class="price-pill buy">Buy now ${money(item.buy_now_price)}</span>`);
    if(item.target_price!=null) priceBits.push(`<span class="price-pill target">Target ${money(item.target_price)}</span>`);
    if(item.maximum_price!=null) priceBits.push(`<span class="price-pill max">Max ${money(item.maximum_price)}</span>`);
    const counts=listingCounts[item.id]||{all:0,deals:0};
    const searchButton=item.status==="watching"?`<button class="primary compact" onclick="searchItem('${item.id}', this)">Search now</button>`:"";
    const resultsLabel=counts.all?(counts.deals?`${counts.deals} deal${counts.deals===1?"":"s"}`:`${counts.all} result${counts.all===1?"":"s"}`):"Results";
    const dealsButton=`<button class="ghost compact" onclick="viewDeals('${item.id}')">${resultsLabel}</button>`;
    return `<article class="item-card"><div><h3>${escapeHtml(item.item_name)}</h3><div class="item-meta">${escapeHtml(subtitle)}${item.condition_preference?` · ${escapeHtml(item.condition_preference)}`:""}${item.urgency?` · ${escapeHtml(prettyUrgency(item.urgency))}`:""}${methods?` · ${escapeHtml(methods)}`:""} · ${escapeHtml(prettyStatus(item.status||"watching"))}</div><div class="price-row">${priceBits.join("")}</div>${item.market_assessment?`<p class="market-note">${escapeHtml(item.market_assessment)}</p>`:""}</div><div class="item-side"><div class="days"><strong>${d??"—"}</strong>days hunting</div><div class="card-actions">${searchButton}${dealsButton}<button class="ghost compact" onclick="editItem('${item.id}')">Edit</button></div></div></article>`;
  }).join("");
}

async function invokeSearch(itemId){
  const {data,error}=await db.functions.invoke("search-deals",{body:{item_id:itemId}});
  if(error) throw error;
  if(data?.error) throw new Error(data.error);
  return data;
}

window.searchItem=async(id,button)=>{
  const item=items.find(x=>x.id===id); if(!item)return;
  const old=button?.textContent;
  if(button){button.disabled=true;button.textContent="Searching…";}
  setMessage(appMessage,`Searching for ${item.item_name}…`);
  try{
    const result=await invokeSearch(id);
    setMessage(appMessage,`Search complete: ${result.found||0} matching listing${result.found===1?"":"s"} found; ${result.new_results||0} new.`,"success");
    await loadWatchlist();
    await viewDeals(id);
  }catch(err){setMessage(appMessage,err.message||String(err),"error");}
  finally{if(button){button.disabled=false;button.textContent=old;}}
};

el("searchAllBtn").addEventListener("click",async()=>{
  const watching=items.filter(x=>x.status==="watching");
  if(!watching.length){setMessage(appMessage,"Nothing is currently being watched.");return;}
  const btn=el("searchAllBtn"), old=btn.textContent; btn.disabled=true;
  let total=0, failures=0;
  for(let i=0;i<watching.length;i++){
    btn.textContent=`Searching ${i+1}/${watching.length}`;
    setMessage(appMessage,`Searching for ${watching[i].item_name}…`);
    try{const result=await invokeSearch(watching[i].id);total+=result.found||0;}catch{failures++;}
  }
  btn.disabled=false;btn.textContent=old;
  await loadWatchlist();
  setMessage(appMessage,`Search complete: ${total} matching listing${total===1?"":"s"}${failures?`; ${failures} search${failures===1?"":"es"} had an error`:""}.`,failures?"":"success");
});

window.viewDeals=async(id)=>{
  const item=items.find(x=>x.id===id); if(!item)return;
  el("dealsTitle").textContent=item.item_name;
  dealsList.innerHTML="";setMessage(el("dealsMessage"),"Loading search details...");dealsDialog.showModal();
  const [{data:listings,error:listError},{data:runs,error:runError},{data:snapshots,error:snapError}] = await Promise.all([
    db.from("listings").select("*").eq("watchlist_item_id",id).eq("available",true).order("total_price",{ascending:true,nullsFirst:false}).order("discovered_at",{ascending:false}).limit(60),
    db.from("search_runs").select("*").eq("watchlist_item_id",id).order("searched_at",{ascending:false}).limit(1),
    db.from("market_snapshots").select("*").eq("watchlist_item_id",id).order("snapshot_date",{ascending:false}).limit(90)
  ]);
  if(listError||runError||snapError){setMessage(el("dealsMessage"),(listError||runError||snapError).message,"error");return;}
  const latest=runs?.[0]||null;
  const stats=latest?.source_stats||{};
  const sources=latest?.sources_searched||Object.keys(stats);
  const bestSeen=(snapshots||[]).map(x=>x.low_price).filter(x=>x!=null).map(Number).sort((a,b)=>a-b)[0]??null;
  const currentBest=(listings||[]).map(x=>x.total_price??x.item_price).filter(x=>x!=null).map(Number).sort((a,b)=>a-b)[0]??null;
  const sourceRows=sources.map(source=>{
    const s=stats[source]||{};
    const suffix=s.error?` · error: ${escapeHtml(s.error)}`:"";
    return `<div class="item-meta"><strong>${escapeHtml(source)}</strong> — ${Number(s.relevant||0)} match${Number(s.relevant||0)===1?"":"es"} from ${Number(s.examined||0)} candidate${Number(s.examined||0)===1?"":"s"}${suffix}</div>`;
  }).join("");
  let summary="";
  if(latest){
    summary=`<article class="deal-row"><div class="deal-main"><div class="deal-source">LATEST SEARCH</div><h3>Search completed — ${Number(latest.relevant_found||0)} matching listing${Number(latest.relevant_found||0)===1?"":"s"}</h3><p>${Number(latest.candidates_examined||0)} search candidates examined. Legitimate listings are saved; rejected search-engine noise is not stored.</p>${sourceRows}<div class="deal-meta">Searched ${new Date(latest.searched_at).toLocaleString()}</div></div><div class="deal-side"><strong>${currentBest!=null?money(currentBest):"No current match"}</strong><span class="deal-rating">Current best</span>${bestSeen!=null?`<span class="deal-rating">Best seen ${money(bestSeen)}</span>`:""}</div></article>`;
    setMessage(el("dealsMessage"),(listings||[]).length?`${listings.length} saved matching listing${listings.length===1?"":"s"}`:`Search completed. No matching listings are currently saved.`);
  }else{
    summary=`<article class="deal-row"><div class="deal-main"><div class="deal-source">SEARCH HISTORY</div><h3>No search has been run yet</h3><p>Run a search to see source-by-source coverage and market history here.</p></div></article>`;
    setMessage(el("dealsMessage"),"No search history yet.");
  }
  const listingHtml=(listings||[]).map(row=>{
    const price=row.total_price??row.item_price;
    const rating=row.deal_rating||null;
    const cls=rating?` rating-${rating}`:"";
    return `<article class="deal-row${cls}"><div class="deal-main"><div class="deal-source">${escapeHtml(row.source||"Web")}</div><h3>${escapeHtml(row.title)}</h3>${row.notes?`<p>${escapeHtml(row.notes)}</p>`:""}<div class="deal-meta">Found ${new Date(row.discovered_at||row.created_at).toLocaleString()}</div></div><div class="deal-side"><strong>${money(price)}</strong><span class="deal-rating">${escapeHtml(prettyRating(rating))}</span>${row.listing_url?`<a class="primary compact" href="${escapeHtml(row.listing_url)}" target="_blank" rel="noopener">Open listing</a>`:""}</div></article>`;
  }).join("");
  dealsList.innerHTML=summary+listingHtml;
};
el("closeDealsBtn").addEventListener("click",()=>dealsDialog.close());

function resetForm(){
  itemForm.reset();el("itemId").value="";el("dialogTitle").textContent="Add item";archiveItemBtn.classList.add("hidden");el("status").value="watching";el("localPickupAllowed").checked=true;el("shippingAllowed").checked=true;el("localRadius").value="300";el("conditionPreference").value="used";el("urgency").value="can_wait";el("huntType").value="best_price";el("searchStartedAt").value=new Date().toISOString().slice(0,10);setMessage(el("dialogMessage"),"");
}
el("addItemBtn").addEventListener("click",()=>{resetForm();itemDialog.showModal();});el("closeDialogBtn").addEventListener("click",()=>itemDialog.close());el("cancelBtn").addEventListener("click",()=>itemDialog.close());
window.editItem=(id)=>{
  const item=items.find(x=>x.id===id);if(!item)return;
  el("itemId").value=item.id;el("dialogTitle").textContent="Edit item";el("itemName").value=item.item_name||"";el("brand").value=item.brand||"";el("model").value=item.model||"";el("searchKeywords").value=item.search_keywords||"";el("category").value=item.category||"";el("conditionPreference").value=item.condition_preference||"used";el("huntType").value=item.hunt_type||"best_price";el("hopedForPrice").value=item.hoped_for_price??"";el("buyNowPrice").value=item.buy_now_price??"";el("targetPrice").value=item.target_price??"";el("maximumPrice").value=item.maximum_price??"";el("urgency").value=item.urgency||"can_wait";el("localRadius").value=item.local_search_radius_miles??300;el("status").value=item.status||"watching";el("localPickupAllowed").checked=item.local_pickup_allowed!==false;el("shippingAllowed").checked=item.shipping_allowed!==false;el("fallbackStrategy").value=item.fallback_strategy||"";el("notes").value=item.notes||"";el("searchStartedAt").value=item.search_started_at||"";archiveItemBtn.classList.toggle("hidden",item.status==="archived");setMessage(el("dialogMessage"),"");itemDialog.showModal();
};

itemForm.addEventListener("submit",async(e)=>{
  e.preventDefault();
  if(!currentUser){setMessage(el("dialogMessage"),"You are not signed in.","error");return;}
  if(!el("localPickupAllowed").checked&&!el("shippingAllowed").checked){setMessage(el("dialogMessage"),"Choose at least one way to get the item: local pickup or shipping.","error");return;}
  const id=el("itemId").value;
  const record={user_id:currentUser.id,item_name:el("itemName").value.trim(),brand:el("brand").value.trim()||null,model:el("model").value.trim()||null,search_keywords:el("searchKeywords").value.trim()||null,category:el("category").value.trim()||null,condition_preference:el("conditionPreference").value,hunt_type:el("huntType").value,hoped_for_price:numericOrNull("hopedForPrice"),buy_now_price:numericOrNull("buyNowPrice"),target_price:numericOrNull("targetPrice"),maximum_price:numericOrNull("maximumPrice"),urgency:el("urgency").value,local_search_radius_miles:numericOrNull("localRadius")??300,local_pickup_allowed:el("localPickupAllowed").checked,shipping_allowed:el("shippingAllowed").checked,fallback_strategy:el("fallbackStrategy").value.trim()||null,notes:el("notes").value.trim()||null,search_started_at:el("searchStartedAt").value||new Date().toISOString().slice(0,10),status:el("status").value};
  setMessage(el("dialogMessage"),"Saving...");
  const result=id?await db.from("watchlist_items").update(record).eq("id",id):await db.from("watchlist_items").insert(record);
  if(result.error){setMessage(el("dialogMessage"),result.error.message,"error");return;}
  itemDialog.close();selectedStatus=record.status;updateFilterButtons();await loadWatchlist();
});
archiveItemBtn.addEventListener("click",async()=>{
  const id=el("itemId").value;if(!id)return;const item=items.find(x=>x.id===id),name=item?.item_name||"this item";
  if(!confirm(`Archive "${name}"? Nothing will be deleted and its history will be kept.`))return;
  const {error}=await db.from("watchlist_items").update({status:"archived"}).eq("id",id);
  if(error){setMessage(el("dialogMessage"),error.message,"error");return;}
  itemDialog.close();selectedStatus="archived";updateFilterButtons();await loadWatchlist();
});

db.auth.onAuthStateChange((_event,session)=>{currentUser=session?.user||null;});
if("serviceWorker" in navigator){window.addEventListener("load",()=>{navigator.serviceWorker.register("./service-worker.js").catch(()=>{});});}
updateFilterButtons();
refreshSession();