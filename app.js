/* ───────────────── DATA MODEL ───────────────── */
/* Icone: prefisso "ti:" = icona vettoriale curata; senza prefisso = emoji digitata dall'utente */
const DEFAULT_CATEGORIES = [
  { name: "Spesa", icon: "ti:shopping-cart", color: "#7C9473" },
  { name: "Farmacia", icon: "ti:pill", color: "#BD6E7A" },
  { name: "Bollette", icon: "ti:bolt", color: "#C99A3E" },
  { name: "Casa", icon: "ti:home", color: "#7B93AE" },
  { name: "Visite mediche", icon: "ti:stethoscope", color: "#9C8AA5" },
  { name: "Assistenza", icon: "ti:heart-handshake", color: "#6FA08C" },
  { name: "Trasporti", icon: "ti:car", color: "#D69A6B" },
  { name: "Altro", icon: "ti:package", color: "#B0A296" },
];
let EXPENSE_CATEGORIES = [...DEFAULT_CATEGORIES];
const CAT_PALETTE = ["#7C9473","#BD6E7A","#C99A3E","#7B93AE","#9C8AA5","#6FA08C","#D69A6B","#B0A296","#9089B8","#8C6E5E","#A8927E","#C1786F"];
const DEADLINE_CATEGORIES = [
  { name: "Visita di controllo", icon: "ti:stethoscope", color: "#7B93AE" },
  { name: "Rinnovo ricetta", icon: "ti:file-text", color: "#C99A3E" },
  { name: "Vaccino", icon: "ti:vaccine", color: "#BD6E7A" },
  { name: "Esenzione ticket", icon: "ti:shield-check", color: "#6FA08C" },
  { name: "Altro", icon: "ti:pin", color: "#8C6E5E" },
];
const ICON_INCOME = { icon: "ti:wallet", color: "#7C9473" };
const ICON_TRANSFER = { icon: "ti:arrows-exchange", color: "#7B93AE" };
const ICON_OTHER = { icon: "ti:package", color: "#B0A296" };
/* Renderizza un'icona: vettoriale se prefissata "ti:", altrimenti emoji testuale digitata dall'utente */
function catIconHtml(icon) {
  return icon && icon.startsWith("ti:") ? `<i class="ti ti-${icon.slice(3)}"></i>` : (icon || "🏷️");
}
/* Tinta chiara calcolata al volo da un colore esadecimale, per lo sfondo del cerchietto icona */
function tintOf(hex) {
  const h = (hex || "#B0A296").replace("#", "");
  const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
  const mix = (c) => Math.round(c + (255 - c) * 0.82);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}
function iconWrap(icon, color) {
  const inner = icon && icon.startsWith("ti:")
    ? `<i class="ti ti-${icon.slice(3)}" style="color:${color}"></i>`
    : `<span style="font-size:15px">${icon || "🏷️"}</span>`;
  return `<span class="movement-icon-wrap" style="background:${tintOf(color)}">${inner}</span>`;
}
function addMonthsISO(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  const today = new Date(todayISO());
  const due = new Date(dateStr);
  return Math.round((due - today) / 86400000);
}
const INCOME_TYPES = ["Pensione", "Indennità di accompagnamento", "Rimborso", "Altro"];
let ACCOUNTS = [];
const MONTHS = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"];

function eur(n) {
  n = Number(n || 0);
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(2);
  let [intPart, decPart] = fixed.split(".");
  intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return "€" + (neg ? "-" : "") + intPart + "," + decPart;
}
/* Interpreta un importo scritto in qualsiasi formato comune: "50", "50,00",
   "50,20", "50.20", con o senza simbolo €, con o senza spazi. Se compaiono
   sia virgola che punto, l'ultimo dei due è considerato separatore decimale. */
function parseAmount(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/[^0-9.,-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    s = s.replace(",", ".");
  }
  return parseFloat(s);
}
function monthKey(d) { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}`; }
function monthLabel(k) { const [y, m] = k.split("-"); return `${MONTHS[parseInt(m)]} ${y}`; }
function todayISO() { return new Date().toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ───────────────── STATE ───────────────── */
let expenses = [];
let incomes = [];
let transfers = [];
let deadlines = [];
let balances = {};
let db = null;
let firebaseReady = false;

/* ═══════════════════════════════════════════════════════════════
   ACCESSO AUTORIZZATO — deve coincidere con le regole Firestore
   ═══════════════════════════════════════════════════════════════ */
const ALLOWED_EMAILS = ["claudia.cameli67@gmail.com"];

/* ───────────────── FIREBASE ───────────────── */
function initFirebase() {
  if (typeof firebaseConfig === "undefined" || !firebaseConfig.apiKey || firebaseConfig.apiKey.includes("INSERISCI")) {
    showError("Configura firebase-config.js con le chiavi del tuo progetto Firebase.");
    document.getElementById("loadingBox").style.display = "none";
    document.getElementById("page-dashboard").classList.add("active");
    return;
  }
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();

  firebase.auth().onAuthStateChanged((user) => {
    if (!user) { showLogin(); return; }
    if (!ALLOWED_EMAILS.includes((user.email || "").toLowerCase())) {
      firebase.auth().signOut();
      showLogin("L'account " + (user.email || "") + " non e' autorizzato per questo libro.");
      return;
    }
    hideLogin();
    document.getElementById("userBadge").textContent = (user.displayName || user.email || "").split(" ")[0];
    if (firebaseReady) return;
    firebaseReady = true;
    attachListeners();
  });

  firebase.auth().getRedirectResult().catch((err) => {
    showLogin("Accesso non riuscito: " + err.message);
  });
}

/* ───────────────── LOGIN GOOGLE ───────────────── */
function showLogin(msg) {
  document.getElementById("loadingBox").style.display = "none";
  document.getElementById("loginOverlay").style.display = "flex";
  const box = document.getElementById("loginMsg");
  if (msg) { box.textContent = msg; box.style.display = "block"; }
  else { box.style.display = "none"; }
}

function hideLogin() {
  document.getElementById("loginOverlay").style.display = "none";
}

function doGoogleLogin() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  document.getElementById("loginMsg").style.display = "none";
  firebase.auth().signInWithPopup(provider).catch((err) => {
    if (["auth/popup-blocked", "auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/operation-not-supported-in-this-environment"].includes(err.code)) {
      firebase.auth().signInWithRedirect(provider).catch((e2) => showLogin("Accesso non riuscito: " + e2.message));
    } else {
      showLogin("Accesso non riuscito: " + err.message);
    }
  });
}

function doLogout() {
  if (!confirm("Uscire dal libro di casa su questo dispositivo?")) return;
  firebase.auth().signOut().then(() => location.reload());
}

function attachListeners() {
  db.collection("ledger").doc("expenses").onSnapshot((doc) => {
    expenses = doc.exists ? (doc.data().items || []) : [];
    render();
  }, (err) => showError("Errore lettura spese: " + err.message));

  db.collection("ledger").doc("incomes").onSnapshot((doc) => {
    incomes = doc.exists ? (doc.data().items || []) : [];
    render();
  }, (err) => showError("Errore lettura entrate: " + err.message));

  db.collection("ledger").doc("balances").onSnapshot((doc) => {
    if (doc.exists) balances = doc.data();
    render();
    document.getElementById("loadingBox").style.display = "none";
    document.getElementById("page-dashboard").classList.add("active");
  }, (err) => showError("Errore lettura conti: " + err.message));

  db.collection("ledger").doc("transfers").onSnapshot((doc) => {
    transfers = doc.exists ? (doc.data().items || []) : [];
    render();
  }, (err) => showError("Errore lettura giroconti: " + err.message));

  db.collection("ledger").doc("deadlines").onSnapshot((doc) => {
    deadlines = doc.exists ? (doc.data().items || []) : [];
    render();
  }, (err) => showError("Errore lettura scadenze: " + err.message));

  db.collection("ledger").doc("medicines").onSnapshot((doc) => {
    medicines = doc.exists ? (doc.data().items || []) : [];
    render();
  }, (err) => showError("Errore lettura medicine: " + err.message));

  db.collection("ledger").doc("categories").onSnapshot((doc) => {
    if (doc.exists && Array.isArray(doc.data().list) && doc.data().list.length) {
      EXPENSE_CATEGORIES = doc.data().list;
    } else {
      persist("categories", { list: EXPENSE_CATEGORIES });
    }
    render();
  }, (err) => showError("Errore lettura categorie: " + err.message));

  db.collection("ledger").doc("accounts").onSnapshot((doc) => {
    if (doc.exists && Array.isArray(doc.data().list)) {
      ACCOUNTS = doc.data().list;
    }
    render();
  }, (err) => showError("Errore lettura conti: " + err.message));
}

function setSyncing(v) {
  const el = document.getElementById("syncStatus");
  el.innerHTML = v
    ? '<span class="dot" style="background:#C1786F"></span>salvo…'
    : '<span class="dot" style="background:#7c9473"></span>ok';
}
function showError(msg) {
  const box = document.getElementById("errBox");
  box.style.display = "block";
  box.textContent = "⚠ " + msg;
}
function clearError() { document.getElementById("errBox").style.display = "none"; }

async function persist(docName, payload) {
  if (!firebaseReady) return;
  setSyncing(true);
  try { await db.collection("ledger").doc(docName).set(payload); clearError(); }
  catch (e) { showError("Salvataggio non riuscito: " + e.message); }
  finally { setSyncing(false); }
}

async function persistWithBalances(docName, items, newBalances) {
  if (!firebaseReady) return;
  setSyncing(true);
  try {
    const batch = db.batch();
    batch.set(db.collection("ledger").doc(docName), { items });
    batch.set(db.collection("ledger").doc("balances"), newBalances);
    await batch.commit(); clearError();
  } catch (e) { showError("Salvataggio non riuscito: " + e.message); }
  finally { setSyncing(false); }
}

/* ───────────────── CRUD ───────────────── */
function addExpense(entry) {
  const nb = { ...balances };
  if (entry.account) nb[entry.account] = Number(nb[entry.account] || 0) - entry.amount;
  expenses = [{ ...entry, id: uid() }, ...expenses];
  balances = nb; render();
  persistWithBalances("expenses", expenses, nb);
}
function addIncome(entry) {
  const nb = { ...balances };
  if (entry.account) nb[entry.account] = Number(nb[entry.account] || 0) + entry.amount;
  incomes = [{ ...entry, id: uid() }, ...incomes];
  balances = nb; render();
  persistWithBalances("incomes", incomes, nb);
}
function deleteExpense(id) {
  const e = expenses.find((x) => x.id === id); if (!e) return;
  const nb = { ...balances };
  if (e.account) nb[e.account] = Number(nb[e.account] || 0) + e.amount;
  expenses = expenses.filter((x) => x.id !== id);
  balances = nb; render();
  persistWithBalances("expenses", expenses, nb);
}
function deleteIncome(id) {
  const i = incomes.find((x) => x.id === id); if (!i) return;
  const nb = { ...balances };
  if (i.account) nb[i.account] = Number(nb[i.account] || 0) - i.amount;
  incomes = incomes.filter((x) => x.id !== id);
  balances = nb; render();
  persistWithBalances("incomes", incomes, nb);
}
function updateExpense(id, entry) {
  const old = expenses.find((x) => x.id === id); if (!old) return;
  const nb = { ...balances };
  if (old.account) nb[old.account] = Number(nb[old.account] || 0) + old.amount;
  if (entry.account) nb[entry.account] = Number(nb[entry.account] || 0) - entry.amount;
  expenses = expenses.map((x) => (x.id === id ? { ...entry, id } : x));
  balances = nb; render();
  persistWithBalances("expenses", expenses, nb);
}
function updateIncome(id, entry) {
  const old = incomes.find((x) => x.id === id); if (!old) return;
  const nb = { ...balances };
  if (old.account) nb[old.account] = Number(nb[old.account] || 0) - old.amount;
  if (entry.account) nb[entry.account] = Number(nb[entry.account] || 0) + entry.amount;
  incomes = incomes.map((x) => (x.id === id ? { ...entry, id } : x));
  balances = nb; render();
  persistWithBalances("incomes", incomes, nb);
}
async function updateTransfer(id, entry) {
  const old = transfers.find((x) => x.id === id); if (!old) return;
  const nb = { ...balances };
  nb[old.from] = Number(nb[old.from] || 0) + old.amount;
  nb[old.to] = Number(nb[old.to] || 0) - old.amount;
  nb[entry.from] = Number(nb[entry.from] || 0) - entry.amount;
  nb[entry.to] = Number(nb[entry.to] || 0) + entry.amount;
  const nt = transfers.map((x) => (x.id === id ? { ...entry, id } : x));
  balances = nb; transfers = nt; render();
  if (!firebaseReady) return;
  setSyncing(true);
  try {
    const batch = db.batch();
    batch.set(db.collection("ledger").doc("balances"), nb);
    batch.set(db.collection("ledger").doc("transfers"), { items: nt });
    await batch.commit(); clearError();
  } catch (e) { showError(e.message); } finally { setSyncing(false); }
}
function updateBalance(acc, val) {
  balances = { ...balances, [acc]: val };
  persist("balances", balances); render();
}
function addAccount(name) {
  const clean = name.trim();
  if (!clean) { toast("Inserisci un nome"); return; }
  if (ACCOUNTS.some((a) => a.toLowerCase() === clean.toLowerCase())) { toast("Conto già esistente"); return; }
  ACCOUNTS = [...ACCOUNTS, clean];
  balances = { ...balances, [clean]: 0 };
  persist("accounts", { list: ACCOUNTS });
  persist("balances", balances);
  render(); toast(`Conto "${clean}" aggiunto`);
}
function removeAccount(name) {
  const bal = Number(balances[name] || 0);
  const hasMov = incomes.some((i) => i.account === name) || transfers.some((t) => t.from === name || t.to === name);
  const msg = (hasMov || bal !== 0)
    ? `"${name}" ha saldo ${eur(bal)} e/o movimenti collegati. Eliminare comunque?`
    : `Eliminare il conto "${name}"?`;
  if (!confirm(msg)) return;
  ACCOUNTS = ACCOUNTS.filter((a) => a !== name);
  const nb = { ...balances }; delete nb[name]; balances = nb;
  persist("accounts", { list: ACCOUNTS }); persist("balances", balances);
  render(); toast(`Conto "${name}" eliminato`);
}
async function addTransfer(entry) {
  const nb = { ...balances, [entry.from]: Number(balances[entry.from] || 0) - entry.amount, [entry.to]: Number(balances[entry.to] || 0) + entry.amount };
  const nt = [{ ...entry, id: uid() }, ...transfers];
  balances = nb; transfers = nt; render();
  if (!firebaseReady) return;
  setSyncing(true);
  try {
    const batch = db.batch();
    batch.set(db.collection("ledger").doc("balances"), nb);
    batch.set(db.collection("ledger").doc("transfers"), { items: nt });
    await batch.commit(); clearError();
  } catch (e) { showError(e.message); } finally { setSyncing(false); }
}
function deleteTransfer(id) {
  const t = transfers.find((x) => x.id === id); if (!t) return;
  transfers = transfers.filter((x) => x.id !== id);
  balances = { ...balances, [t.from]: Number(balances[t.from] || 0) + t.amount, [t.to]: Number(balances[t.to] || 0) - t.amount };
  persist("transfers", { items: transfers }); persist("balances", balances); render();
}
function addCategory(name, icon) {
  const clean = name.trim();
  if (!clean) { toast("Inserisci un nome"); return; }
  if (EXPENSE_CATEGORIES.some((c) => c.name.toLowerCase() === clean.toLowerCase())) { toast("Categoria già esistente"); return; }
  const color = CAT_PALETTE[EXPENSE_CATEGORIES.length % CAT_PALETTE.length];
  EXPENSE_CATEGORIES = [...EXPENSE_CATEGORIES, { name: clean, icon: (icon || "").trim() || "🏷️", color }];
  persist("categories", { list: EXPENSE_CATEGORIES }); render(); toast(`Categoria "${clean}" aggiunta`);
}
function removeCategory(name) {
  if (!confirm(`Eliminare la categoria "${name}"?`)) return;
  EXPENSE_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.name !== name);
  if (selCategory === name) selCategory = EXPENSE_CATEGORIES[0]?.name || "";
  persist("categories", { list: EXPENSE_CATEGORIES }); render(); toast(`Categoria "${name}" eliminata`);
}

function addDeadline(entry) {
  deadlines = [{ ...entry, id: uid() }, ...deadlines];
  persist("deadlines", { items: deadlines });
  render();
}
function deleteDeadline(id) {
  deadlines = deadlines.filter((d) => d.id !== id);
  persist("deadlines", { items: deadlines });
  render();
  toast("Scadenza eliminata");
}
function completeDeadline(id) {
  const item = deadlines.find((d) => d.id === id);
  if (!item) return;
  if (item.recurrence && item.recurrence !== "none") {
    const months = item.recurrence === "6m" ? 6 : 12;
    const newDate = addMonthsISO(item.dueDate, months);
    deadlines = deadlines.map((d) => (d.id === id ? { ...d, dueDate: newDate } : d));
    toast(`Rinnovata al ${new Date(newDate).toLocaleDateString("it-IT")}`);
  } else {
    deadlines = deadlines.filter((d) => d.id !== id);
    toast("Scadenza completata");
  }
  persist("deadlines", { items: deadlines });
  render();
}

/* ───────────────── EDIT MODAL ───────────────── */
let editState = null; // { kind: 'spesa'|'entrata'|'giroconto'|'medicina', id, data }

function closeEditModal() {
  document.getElementById("editOverlay").style.display = "none";
  editState = null;
}

function openEditModal(kind, id) {
  let item;
  if (kind === "spesa") item = expenses.find((e) => e.id === id);
  else if (kind === "entrata") item = incomes.find((i) => i.id === id);
  else if (kind === "giroconto") item = transfers.find((t) => t.id === id);
  else item = medicines.find((m) => m.id === id);
  if (!item) return;
  editState = { kind, id, data: { ...item } };
  renderEditModal();
  document.getElementById("editOverlay").style.display = "flex";
}

function syncEditInputs() {
  if (!editState) return;
  const amt = document.getElementById("editAmount");
  const note = document.getElementById("editNote");
  const date = document.getElementById("editDate");
  const medName = document.getElementById("editMedName");
  const medDosage = document.getElementById("editMedDosage");
  if (amt) editState.data.amount = amt.value;
  if (note) editState.data.note = note.value;
  if (date) editState.data.date = date.value;
  if (medName) editState.data.name = medName.value;
  if (medDosage) editState.data.dosage = medDosage.value;
}

function renderEditModal() {
  const card = document.getElementById("editModalCard");
  const { kind, data } = editState;

  if (kind === "medicina") {
    let mhtml = `<div class="modal-title">Modifica medicina<button class="modal-close" id="editCloseBtn"><i class="ti ti-x"></i></button></div>`;
    mhtml += `<div class="field"><div class="field-label">Nome medicina</div><input class="input" id="editMedName" value="${(data.name || "").replace(/"/g, "&quot;")}"></div>`;
    mhtml += `<div class="field"><div class="field-label">Come si prende</div><input class="input" id="editMedDosage" value="${(data.dosage || "").replace(/"/g, "&quot;")}"></div>`;
    mhtml += `<div class="field"><div class="field-label">Nota (opzionale)</div><input class="input" id="editNote" value="${(data.note || "").replace(/"/g, "&quot;")}"></div>`;
    mhtml += `<button class="submit-btn" style="background:#3A332D" id="editSaveBtn">Salva modifiche</button>`;
    mhtml += `<button class="delete-link-btn" id="editDeleteBtn">Elimina medicina</button>`;
    card.innerHTML = mhtml;
    document.getElementById("editCloseBtn").onclick = closeEditModal;
    document.getElementById("editSaveBtn").onclick = () => {
      syncEditInputs();
      const name = (editState.data.name || "").trim();
      if (!name) { toast("Inserisci il nome della medicina"); return; }
      updateMedicine(editState.id, { name, dosage: editState.data.dosage || "", note: editState.data.note || "" });
      toast("Medicina aggiornata");
      closeEditModal();
    };
    document.getElementById("editDeleteBtn").onclick = () => {
      const idNow = editState.id;
      closeEditModal();
      deleteMedicine(idNow);
    };
    return;
  }

  const title = kind === "spesa" ? "Modifica spesa" : kind === "entrata" ? "Modifica entrata" : "Modifica giroconto";

  let html = `<div class="modal-title">${title}<button class="modal-close" id="editCloseBtn"><i class="ti ti-x"></i></button></div>`;
  html += `<div class="field"><div class="field-label">Importo (€)</div><input class="input" id="editAmount" inputmode="decimal" value="${String(data.amount).replace(".", ",")}"></div>`;

  if (kind === "spesa") {
    html += `<div class="field"><div class="field-label">Categoria</div><div class="chip-grid" id="editCategoryGrid"></div></div>`;
    html += `<div class="field"><div class="field-label">Pagato con</div><div class="acc-grid4" id="editAccountGrid"></div></div>`;
  } else if (kind === "entrata") {
    html += `<div class="field"><div class="field-label">Tipo di entrata</div><div class="income-list" id="editIncTypeList"></div></div>`;
    html += `<div class="field"><div class="field-label">Accreditato su</div><div class="acc-grid4" id="editAccountGrid"></div></div>`;
  } else {
    html += `<div class="field"><div class="field-label">Da conto</div><div class="acc-grid4" id="editFromGrid"></div></div>`;
    html += `<div class="field"><div class="field-label">A conto</div><div class="acc-grid4" id="editToGrid"></div></div>`;
  }

  html += `<div class="field"><div class="field-label">Nota (opzionale)</div><input class="input" id="editNote" value="${(data.note || "").replace(/"/g, "&quot;")}"></div>`;
  html += `<div class="field"><div class="field-label">Data</div><input class="input" type="date" id="editDate" value="${data.date}"></div>`;
  html += `<button class="submit-btn" style="background:#3A332D" id="editSaveBtn">Salva modifiche</button>`;
  html += `<button class="delete-link-btn" id="editDeleteBtn">Elimina movimento</button>`;

  card.innerHTML = html;
  document.getElementById("editCloseBtn").onclick = closeEditModal;

  if (kind === "spesa") {
    const catGrid = document.getElementById("editCategoryGrid");
    EXPENSE_CATEGORIES.forEach((c) => {
      const b = document.createElement("button");
      b.className = "chip" + (c.name === data.category ? " active" : "");
      if (c.name === data.category) { b.style.background = c.color; b.style.color = "#fff"; b.style.borderColor = c.color; }
      b.innerHTML = `<span class="ic">${catIconHtml(c.icon)}</span>${c.name}`;
      b.onclick = () => { syncEditInputs(); editState.data.category = c.name; renderEditModal(); };
      catGrid.appendChild(b);
    });
    buildAccGrid("editAccountGrid", data.account, (a) => { syncEditInputs(); editState.data.account = a; renderEditModal(); });
  } else if (kind === "entrata") {
    const incList = document.getElementById("editIncTypeList");
    INCOME_TYPES.forEach((t) => {
      const b = document.createElement("button");
      b.className = t === data.type ? "active" : "";
      b.textContent = t;
      b.onclick = () => { syncEditInputs(); editState.data.type = t; renderEditModal(); };
      incList.appendChild(b);
    });
    buildAccGrid("editAccountGrid", data.account, (a) => { syncEditInputs(); editState.data.account = a; renderEditModal(); });
  } else {
    buildAccGrid("editFromGrid", data.from, (a) => { syncEditInputs(); editState.data.from = a; renderEditModal(); });
    buildAccGrid("editToGrid", data.to, (a) => { syncEditInputs(); editState.data.to = a; renderEditModal(); });
  }

  document.getElementById("editSaveBtn").onclick = () => {
    syncEditInputs();
    const val = parseAmount(editState.data.amount);
    if (!val || val <= 0) { toast("Inserisci un importo valido"); return; }
    const date = editState.data.date || todayISO();
    const note = editState.data.note || "";
    if (editState.kind === "spesa") {
      updateExpense(editState.id, { amount: val, category: editState.data.category, account: editState.data.account, note, date });
    } else if (editState.kind === "entrata") {
      updateIncome(editState.id, { amount: val, type: editState.data.type, account: editState.data.account, note, date });
    } else {
      if (!editState.data.from || !editState.data.to) { toast("Seleziona i conti"); return; }
      if (editState.data.from === editState.data.to) { toast("Scegli due conti diversi"); return; }
      updateTransfer(editState.id, { amount: val, from: editState.data.from, to: editState.data.to, note, date });
    }
    toast("Movimento aggiornato");
    closeEditModal();
  };

  document.getElementById("editDeleteBtn").onclick = () => {
    const kindNow = editState.kind, idNow = editState.id;
    closeEditModal();
    if (kindNow === "spesa") deleteExpense(idNow);
    else if (kindNow === "entrata") deleteIncome(idNow);
    else deleteTransfer(idNow);
    toast("Movimento eliminato");
  };
}

/* ───────────────── TOAST ───────────────── */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ───────────────── NAVIGATION ───────────────── */
document.querySelectorAll(".nav button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav button").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("page-" + btn.dataset.page).classList.add("active");
    if (btn.dataset.page === "history") renderHistory();
    if (btn.dataset.page === "salute") renderMeds();
    if (btn.dataset.page === "scadenze") renderDeadlines();
    if (btn.dataset.page === "stats") renderStats();
  });
});

/* ───────────────── ADD TABS ───────────────── */
document.querySelectorAll("[data-addtab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-addtab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    ["spesa","entrata","giroconto","conto"].forEach((t) => {
      document.getElementById("add-" + t).style.display = btn.dataset.addtab === t ? "block" : "none";
    });
  });
});

/* ───────────────── FORM STATE ───────────────── */
let selCategory = DEFAULT_CATEGORIES[0].name;
let selIncomeType = INCOME_TYPES[0];
let selExpAccount = "";
let selIncomeAccount = "";
let selTrfFrom = "";
let selTrfTo = "";

function buildAddForm() {
  /* categorie */
  const catGrid = document.getElementById("expCategoryGrid");
  catGrid.innerHTML = "";
  EXPENSE_CATEGORIES.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c.name === selCategory ? " active" : "");
    if (c.name === selCategory) { b.style.background = c.color; b.style.color = "#fff"; b.style.borderColor = c.color; }
    b.innerHTML = `<span class="ic">${catIconHtml(c.icon)}</span>${c.name}`;
    b.onclick = () => { selCategory = c.name; buildAddForm(); };
    catGrid.appendChild(b);
  });

  /* gestisci categorie */
  const catDelList = document.getElementById("catDeleteList");
  catDelList.innerHTML = "";
  EXPENSE_CATEGORIES.forEach((c) => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #EFE3D8;font-size:13px";
    row.innerHTML = `<span>${catIconHtml(c.icon)} ${c.name}</span><button style="color:#B65C6B;font-size:15px;padding:0 6px"><i class="ti ti-x"></i></button>`;
    row.querySelector("button").onclick = () => removeCategory(c.name);
    catDelList.appendChild(row);
  });

  /* conto pagante (spesa) */
  buildAccGrid("expAccountGrid", selExpAccount, (a) => { selExpAccount = a; buildAddForm(); });

  /* tipo entrata */
  const incList = document.getElementById("incTypeList");
  incList.innerHTML = "";
  INCOME_TYPES.forEach((t) => {
    const b = document.createElement("button");
    b.className = t === selIncomeType ? "active" : "";
    b.textContent = t;
    b.onclick = () => { selIncomeType = t; buildAddForm(); };
    incList.appendChild(b);
  });

  /* conto accredito entrata */
  buildAccGrid("incAccountGrid", selIncomeAccount, (a) => { selIncomeAccount = a; buildAddForm(); });

  /* giroconti */
  buildAccGrid("trfFromGrid", selTrfFrom, (a) => { selTrfFrom = a; buildAddForm(); });
  buildAccGrid("trfToGrid", selTrfTo, (a) => { selTrfTo = a; buildAddForm(); });

  /* conti — saldi + aggiungi nuovo */
  const balForm = document.getElementById("add-conto");
  balForm.innerHTML = "";
  if (ACCOUNTS.length === 0) {
    balForm.innerHTML = `<div class="empty" style="padding:16px 0">Nessun conto ancora — aggiungine uno qui sotto.</div>`;
  }
  ACCOUNTS.forEach((acc) => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `
      <div class="field-label">${acc}</div>
      <div class="balance-save">
        <input class="input" style="flex:1" id="bal-${acc}" type="text" inputmode="decimal" pattern="[0-9.,-]*" value="${balances[acc] ?? 0}">
        <button class="bal-save-btn">Salva</button>
        <button class="bal-del-btn" style="background:#fff;color:#B65C6B;border:1px solid #EFE3D8;padding:0 12px;border-radius:10px"><i class="ti ti-x"></i></button>
      </div>`;
    balForm.appendChild(wrap);
    wrap.querySelector(".bal-save-btn").onclick = () => {
      const val = parseAmount(document.getElementById(`bal-${acc}`).value) || 0;
      updateBalance(acc, val); toast(`Saldo ${acc} aggiornato`);
    };
    wrap.querySelector(".bal-del-btn").onclick = () => removeAccount(acc);
  });
  const addWrap = document.createElement("div");
  addWrap.className = "field"; addWrap.style.marginTop = "10px";
  addWrap.innerHTML = `
    <div class="field-label">Nuovo conto</div>
    <div class="balance-save">
      <input class="input" style="flex:1" id="newAccName" placeholder="es. Cassa, PayPal…">
      <button id="addAccBtn" style="background:#7c9473;color:#fff;padding:0 16px;border-radius:10px">Aggiungi</button>
    </div>`;
  balForm.appendChild(addWrap);
  addWrap.querySelector("#addAccBtn").onclick = () => {
    addAccount(document.getElementById("newAccName").value);
    document.getElementById("newAccName").value = "";
  };
}

function buildAccGrid(elId, selected, onSelect) {
  const grid = document.getElementById(elId);
  if (!grid) return;
  grid.innerHTML = "";
  if (ACCOUNTS.length === 0) {
    grid.innerHTML = `<div style="font-size:11px;color:#B0A296">Nessun conto — aggiungili dal tab Conti</div>`;
    return;
  }
  ACCOUNTS.forEach((a) => {
    const b = document.createElement("button");
    b.className = a === selected ? "active" : "";
    b.textContent = a;
    b.onclick = () => onSelect(a);
    grid.appendChild(b);
  });
}

document.getElementById("editOverlay").addEventListener("click", (ev) => {
  if (ev.target.id === "editOverlay") closeEditModal();
});

/* ───────────────── DATE DEFAULTS ───────────────── */
document.getElementById("expDate").value = todayISO();
document.getElementById("incDate").value = todayISO();
document.getElementById("trfDate").value = todayISO();
document.getElementById("dlDate").value = todayISO();

let selDlCategory = DEADLINE_CATEGORIES[0].name;
let selDlRecurrence = "none";
const RECURRENCE_OPTIONS = [
  { key: "none", label: "Mai" },
  { key: "6m", label: "6 mesi" },
  { key: "12m", label: "1 anno" },
];

function buildDeadlineForm() {
  const catGrid = document.getElementById("dlCategoryGrid");
  catGrid.innerHTML = "";
  DEADLINE_CATEGORIES.forEach((c) => {
    const b = document.createElement("button");
    b.className = "chip" + (c.name === selDlCategory ? " active" : "");
    if (c.name === selDlCategory) { b.style.background = c.color; b.style.color = "#fff"; b.style.borderColor = c.color; }
    b.innerHTML = `<span class="ic">${catIconHtml(c.icon)}</span>${c.name}`;
    b.onclick = () => { selDlCategory = c.name; buildDeadlineForm(); };
    catGrid.appendChild(b);
  });

  const recRow = document.getElementById("dlRecurrenceRow");
  recRow.innerHTML = "";
  RECURRENCE_OPTIONS.forEach((r) => {
    const b = document.createElement("button");
    b.className = r.key === selDlRecurrence ? "active" : "";
    b.textContent = r.label;
    b.onclick = () => { selDlRecurrence = r.key; buildDeadlineForm(); };
    recRow.appendChild(b);
  });
}

document.getElementById("dlSubmit").onclick = () => {
  const dateVal = document.getElementById("dlDate").value;
  if (!dateVal) { toast("Scegli una data di scadenza"); return; }
  const customTitle = document.getElementById("dlTitle").value.trim();
  const title = selDlCategory === "Altro" && customTitle ? customTitle : (customTitle || selDlCategory);
  addDeadline({
    title, category: selDlCategory, dueDate: dateVal,
    time: document.getElementById("dlTime").value,
    recurrence: selDlRecurrence, note: document.getElementById("dlNote").value,
  });
  toast(`Scadenza "${title}" aggiunta`);
  document.getElementById("dlTitle").value = "";
  document.getElementById("dlNote").value = "";
  document.getElementById("dlTime").value = "";
};

/* ───────────────── TOGGLE GESTISCI CATEGORIE ───────────────── */
document.getElementById("toggleCatEdit").onclick = () => {
  const box = document.getElementById("catEditBox");
  box.style.display = box.style.display === "none" ? "block" : "none";
};
document.getElementById("addCatBtn").onclick = () => {
  addCategory(document.getElementById("newCatName").value, document.getElementById("newCatIcon").value);
  document.getElementById("newCatName").value = "";
  document.getElementById("newCatIcon").value = "";
};

/* ───────────────── ANTEPRIMA IMPORTO IN TEMPO REALE ───────────────── */
function wireAmountHint(inputId, hintId) {
  const input = document.getElementById(inputId);
  const hint = document.getElementById(hintId);
  input.addEventListener("input", () => {
    const raw = input.value.trim();
    if (!raw) { hint.textContent = ""; hint.className = "amount-hint"; return; }
    const val = parseAmount(raw);
    if (!val || val <= 0 || isNaN(val)) {
      hint.textContent = "Importo non riconosciuto";
      hint.className = "amount-hint bad";
    } else {
      hint.textContent = "= " + eur(val);
      hint.className = "amount-hint ok";
    }
  });
}
wireAmountHint("expAmount", "expAmountHint");
wireAmountHint("incAmount", "incAmountHint");
wireAmountHint("trfAmount", "trfAmountHint");

/* ───────────────── SUBMIT HANDLERS ───────────────── */
document.getElementById("expSubmit").onclick = () => {
  const val = parseAmount(document.getElementById("expAmount").value);
  if (!val || val <= 0) { toast("Inserisci un importo valido"); return; }
  addExpense({ amount: val, category: selCategory, account: selExpAccount,
    note: document.getElementById("expNote").value, date: document.getElementById("expDate").value || todayISO() });
  const fromMsg = selExpAccount ? ` scalata da ${selExpAccount}` : "";
  toast(`Spesa di ${eur(val)}${fromMsg} registrata`);
  document.getElementById("expAmount").value = "";
  document.getElementById("expAmountHint").textContent = "";
  document.getElementById("expNote").value = "";
};

document.getElementById("incSubmit").onclick = () => {
  const val = parseAmount(document.getElementById("incAmount").value);
  if (!val || val <= 0) { toast("Inserisci un importo valido"); return; }
  addIncome({ amount: val, type: selIncomeType, account: selIncomeAccount,
    note: document.getElementById("incNote").value, date: document.getElementById("incDate").value || todayISO() });
  toast(`Entrata di ${eur(val)} registrata`);
  document.getElementById("incAmount").value = "";
  document.getElementById("incAmountHint").textContent = "";
  document.getElementById("incNote").value = "";
};

document.getElementById("trfSubmit").onclick = () => {
  const val = parseAmount(document.getElementById("trfAmount").value);
  if (!val || val <= 0) { toast("Inserisci un importo valido"); return; }
  if (!selTrfFrom || !selTrfTo) { toast("Seleziona i conti"); return; }
  if (selTrfFrom === selTrfTo) { toast("Scegli due conti diversi"); return; }
  addTransfer({ amount: val, from: selTrfFrom, to: selTrfTo,
    note: document.getElementById("trfNote").value, date: document.getElementById("trfDate").value || todayISO() });
  toast(`Giroconto di ${eur(val)} da ${selTrfFrom} a ${selTrfTo}`);
  document.getElementById("trfAmount").value = "";
  document.getElementById("trfAmountHint").textContent = "";
  document.getElementById("trfNote").value = "";
};

/* ───────────────── HISTORY ───────────────── */
let histTab = "spese", histMonth = monthKey(todayISO());

document.querySelectorAll("[data-histtab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-histtab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    histTab = btn.dataset.histtab; renderHistory();
  });
});

function renderHistory() {
  const all = [...expenses.map((e) => e.date), ...incomes.map((i) => i.date), ...transfers.map((t) => t.date)];
  let months = Array.from(new Set(all.map(monthKey))).sort().reverse();
  if (!months.length) months = [monthKey(todayISO())];
  if (!months.includes(histMonth)) histMonth = months[0];

  const chipRow = document.getElementById("monthChipRow");
  chipRow.innerHTML = "";
  months.forEach((m) => {
    const b = document.createElement("button");
    b.className = m === histMonth ? "active" : "";
    b.textContent = monthLabel(m);
    b.onclick = () => { histMonth = m; renderHistory(); };
    chipRow.appendChild(b);
  });

  const list = histTab === "spese" ? expenses.filter((e) => monthKey(e.date) === histMonth)
    : histTab === "entrate" ? incomes.filter((i) => monthKey(i.date) === histMonth)
    : transfers.filter((t) => monthKey(t.date) === histMonth);
  const total = list.reduce((s, e) => s + e.amount, 0);
  document.getElementById("histTotalLine").innerHTML = histTab === "giroconti"
    ? `Totale spostato: <strong style="color:#3A332D">${eur(total)}</strong>`
    : `Totale ${histTab}: <strong style="color:#3A332D">${eur(total)}</strong>`;

  const listEl = document.getElementById("histList");
  listEl.innerHTML = "";
  if (!list.length) { listEl.innerHTML = `<div class="empty">Nessun movimento in questo mese.</div>`; return; }

  list.forEach((item) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.name === item.category);
    const row = document.createElement("div");
    row.className = "movement";
    const iconHtml = histTab === "spese" ? iconWrap(cat ? cat.icon : ICON_OTHER.icon, cat ? cat.color : ICON_OTHER.color)
      : histTab === "entrate" ? iconWrap(ICON_INCOME.icon, ICON_INCOME.color)
      : iconWrap(ICON_TRANSFER.icon, ICON_TRANSFER.color);
    const label = histTab === "spese" ? item.category : histTab === "entrate" ? item.type : `${item.from} → ${item.to}`;
    const meta = histTab === "spese" ? (item.account || "")
      : histTab === "entrate" ? (item.account || "")
      : "";
    const amountClass = histTab === "spese" ? "amount-out" : histTab === "entrate" ? "amount-in" : "";
    const amountStyle = histTab === "giroconti" ? "color:#7B93AE;font-weight:600" : "";
    row.innerHTML = `
      <div class="movement-left">
        ${iconHtml}
        <div>
          <div class="movement-cat">${label}</div>
          <div class="movement-meta">${meta ? meta + " · " : ""}${new Date(item.date).toLocaleDateString("it-IT")}${item.note ? " · " + item.note : ""}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div class="mono ${amountClass}" style="${amountStyle}">${eur(item.amount)}</div>
        <button class="del-btn"><i class="ti ti-x"></i></button>
      </div>`;
    row.querySelector(".del-btn").onclick = (ev) => {
      ev.stopPropagation();
      if (histTab === "spese") deleteExpense(item.id);
      else if (histTab === "entrate") deleteIncome(item.id);
      else deleteTransfer(item.id);
      toast("Movimento eliminato"); renderHistory();
    };
    row.onclick = () => {
      const kind = histTab === "spese" ? "spesa" : histTab === "entrate" ? "entrata" : "giroconto";
      openEditModal(kind, item.id);
    };
    listEl.appendChild(row);
  });
}

document.getElementById("exportBtn").onclick = () => {
  const lines = ["Tipo,Data,Categoria,Importo,Conto,Nota"];
  expenses.forEach((e) => lines.push(`Spesa,${e.date},${e.category},${e.amount},${e.account || ""},"${e.note || ""}"`));
  incomes.forEach((i) => lines.push(`Entrata,${i.date},${i.type},${i.amount},${i.account || ""},"${i.note || ""}"`));
  transfers.forEach((t) => lines.push(`Giroconto,${t.date},"${t.from} -> ${t.to}",${t.amount},,"${t.note || ""}"`));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "libro-concetta.csv"; a.click();
  URL.revokeObjectURL(url); toast("CSV esportato");
};

/* ───────────────── DASHBOARD ───────────────── */
function renderDashboard() {
  const thisMonth = monthKey(todayISO());
  document.getElementById("dashMonthLabel").textContent = "Saldo di " + monthLabel(thisMonth);
  const monthExpenses = expenses.filter((e) => monthKey(e.date) === thisMonth);
  const monthIncomes = incomes.filter((i) => monthKey(i.date) === thisMonth);
  const totalOut = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const totalIn = monthIncomes.reduce((s, i) => s + i.amount, 0);
  const net = totalIn - totalOut;
  const netEl = document.getElementById("dashNet");
  netEl.textContent = (net >= 0 ? "+" : "") + eur(net);
  netEl.style.color = net >= 0 ? "#7C9473" : "#C1786F";
  document.getElementById("dashIn").textContent = eur(totalIn);
  document.getElementById("dashOut").textContent = eur(totalOut);

  const totalLiquid = ACCOUNTS.reduce((s, a) => s + Number(balances[a] || 0), 0);
  document.getElementById("dashTotalLiquid").textContent = eur(totalLiquid);
  document.getElementById("dashLiquidLabel").textContent = ACCOUNTS.length ? "Dettaglio conti" : "Nessun conto — aggiungili dal tab +";

  const urgent = deadlines
    .map((d) => ({ ...d, days: daysUntil(d.dueDate) }))
    .filter((d) => d.days <= 30)
    .sort((a, b) => a.days - b.days)
    .slice(0, 3);
  const dashDlWrap = document.getElementById("dashDeadlinesWrap");
  const dashDlEl = document.getElementById("dashDeadlines");
  if (urgent.length === 0) {
    dashDlWrap.style.display = "none";
  } else {
    dashDlWrap.style.display = "block";
    dashDlEl.innerHTML = "";
    urgent.forEach((d) => {
      const cat = DEADLINE_CATEGORIES.find((c) => c.name === d.category);
      const row = document.createElement("div");
      row.className = "dash-deadline";
      row.innerHTML = `
        <div class="movement-left">
          ${iconWrap(cat ? cat.icon : ICON_OTHER.icon, cat ? cat.color : ICON_OTHER.color)}
          <div class="movement-cat">${d.title}</div>
        </div>
        <div class="dl-right">
          ${d.time ? `<div class="dl-time">${d.time}</div>` : ""}
          <span class="dl-days mono" style="color:${dlColor(d.days)}">${dlLabel(d.days)}</span>
        </div>`;
      dashDlEl.appendChild(row);
    });
  }

  const grid = document.getElementById("accountsGrid");
  grid.innerHTML = "";
  ACCOUNTS.forEach((acc) => {
    const el = document.createElement("div"); el.className = "account-card";
    el.innerHTML = `<div class="name">${acc}</div><div class="val">${eur(balances[acc])}</div>`;
    grid.appendChild(el);
  });

  const recent = [
    ...expenses,
    ...incomes.map((i) => ({ ...i, category: i.type, isIncome: true })),
    ...transfers.map((t) => ({ ...t, category: `${t.from} → ${t.to}`, isTransfer: true })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const recentEl = document.getElementById("recentList");
  recentEl.innerHTML = "";
  if (!recent.length) { recentEl.innerHTML = `<div class="empty">Nessun movimento ancora.</div>`; return; }
  recent.forEach((r) => {
    const cat = EXPENSE_CATEGORIES.find((c) => c.name === r.category);
    const row = document.createElement("div"); row.className = "movement";
    const iconHtml = r.isTransfer ? iconWrap(ICON_TRANSFER.icon, ICON_TRANSFER.color)
      : r.isIncome ? iconWrap(ICON_INCOME.icon, ICON_INCOME.color)
      : iconWrap(cat ? cat.icon : ICON_OTHER.icon, cat ? cat.color : ICON_OTHER.color);
    const meta = r.isTransfer ? "" : ((r.account || "") + " · ");
    const amountHtml = r.isTransfer
      ? `<span class="mono" style="color:#7B93AE;font-weight:600">${eur(r.amount)}</span>`
      : `<span class="mono ${r.isIncome ? "amount-in" : "amount-out"}">${r.isIncome ? "+" : "−"}${eur(r.amount)}</span>`;
    row.innerHTML = `
      <div class="movement-left">
        ${iconHtml}
        <div>
          <div class="movement-cat">${r.category}</div>
          <div class="movement-meta">${meta}${new Date(r.date).toLocaleDateString("it-IT")}</div>
        </div>
      </div>${amountHtml}`;
    row.onclick = () => {
      const kind = r.isTransfer ? "giroconto" : r.isIncome ? "entrata" : "spesa";
      openEditModal(kind, r.id);
    };
    recentEl.appendChild(row);
  });
}

/* ───────────────── SCADENZE ───────────────── */
function dlColor(days) {
  if (days < 0) return "#B65C6B";
  if (days <= 30) return "#C99A3E";
  return "#7C9473";
}
function dlLabel(days) {
  if (days < 0) return `Scaduta da ${Math.abs(days)} giorni`;
  if (days === 0) return "Scade oggi";
  return `Tra ${days} giorni`;
}
function renderDeadlines() {
  buildDeadlineForm();
  const sorted = [...deadlines].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const listEl = document.getElementById("deadlinesList");
  listEl.innerHTML = "";
  if (sorted.length === 0) {
    listEl.innerHTML = `<div class="empty">Nessuna scadenza salvata — aggiungine una qui sotto.</div>`;
    return;
  }
  sorted.forEach((item) => {
    const cat = DEADLINE_CATEGORIES.find((c) => c.name === item.category);
    const days = daysUntil(item.dueDate);
    const row = document.createElement("div");
    row.className = "movement";
    row.innerHTML = `
      <div class="movement-left">
        ${iconWrap(cat ? cat.icon : ICON_OTHER.icon, cat ? cat.color : ICON_OTHER.color)}
        <div>
          <div class="movement-cat">${item.title}</div>
          <div class="movement-meta">${new Date(item.dueDate).toLocaleDateString("it-IT")}${item.note ? " · " + item.note : ""}${item.recurrence !== "none" ? " · si ripete" : ""}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="dl-right">
          ${item.time ? `<div class="dl-time">${item.time}</div>` : ""}
          <span class="dl-days mono" style="color:${dlColor(days)}">${dlLabel(days)}</span>
        </div>
        <button class="dl-done" data-id="${item.id}"><i class="ti ti-check"></i></button>
        <button class="del-btn" data-id="${item.id}"><i class="ti ti-x"></i></button>
      </div>`;
    row.querySelector(".dl-done").onclick = () => completeDeadline(item.id);
    row.querySelector(".del-btn").onclick = () => deleteDeadline(item.id);
    listEl.appendChild(row);
  });
}

/* ───────────────── SALUTE: VISITE E MEDICINE ───────────────── */
let medicines = [];

function addMedicine(entry) {
  medicines = [{ ...entry, id: uid() }, ...medicines];
  persist("medicines", { items: medicines });
  render();
}
function updateMedicine(id, entry) {
  medicines = medicines.map((m) => (m.id === id ? { ...entry, id } : m));
  persist("medicines", { items: medicines });
  render();
}
function deleteMedicine(id) {
  medicines = medicines.filter((m) => m.id !== id);
  persist("medicines", { items: medicines });
  render();
  toast("Medicina eliminata");
}

document.getElementById("medSubmit").onclick = () => {
  const name = document.getElementById("medName").value.trim();
  if (!name) { toast("Inserisci il nome della medicina"); return; }
  addMedicine({
    name, dosage: document.getElementById("medDosage").value,
    note: document.getElementById("medNote").value,
  });
  toast(`"${name}" aggiunta`);
  document.getElementById("medName").value = "";
  document.getElementById("medDosage").value = "";
  document.getElementById("medNote").value = "";
};

function renderMeds() {
  const listEl = document.getElementById("medsList");
  listEl.innerHTML = "";
  if (medicines.length === 0) {
    listEl.innerHTML = `<div class="empty">Nessuna medicina registrata.</div>`;
    return;
  }
  medicines.forEach((m) => {
    const row = document.createElement("div");
    row.className = "movement";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div class="movement-left">
        ${iconWrap("ti:pill", "#BD6E7A")}
        <div>
          <div class="movement-cat">${m.name}</div>
          <div class="movement-meta">${m.dosage ? m.dosage : ""}${m.note ? " · " + m.note : ""}</div>
        </div>
      </div>
      <button class="del-btn"><i class="ti ti-x"></i></button>`;
    row.querySelector(".del-btn").onclick = (ev) => {
      ev.stopPropagation();
      deleteMedicine(m.id);
    };
    row.onclick = () => openEditModal("medicina", m.id);
    listEl.appendChild(row);
  });
}

/* ───────────────── GRAFICI ───────────────── */
let expChart = null;
function lastMonthKeys(n) {
  const keys = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    keys.push(`${x.getFullYear()}-${x.getMonth()}`);
  }
  return keys;
}
function renderStats() {
  const content = document.getElementById("statsContent");
  const keys = lastMonthKeys(6);
  const labels = keys.map((k) => monthLabel(k).split(" ")[0]);

  const datasets = EXPENSE_CATEGORIES.map((c) => {
    const data = keys.map((k) => expenses.filter((e) => e.category === c.name && monthKey(e.date) === k).reduce((s, e) => s + e.amount, 0));
    return { name: c.name, color: c.color, data, total: data.reduce((s, v) => s + v, 0) };
  }).filter((d) => d.total > 0);

  if (datasets.length === 0) {
    content.innerHTML = `<div class="empty" style="padding:40px 0;text-align:center">Nessuna spesa negli ultimi 6 mesi — i grafici appariranno appena aggiungi qualcosa.</div>`;
    return;
  }

  content.innerHTML = `
    <div class="section-title">Spese per categoria — ultimi 6 mesi</div>
    <div class="chart-wrap"><canvas id="expChartCanvas"></canvas></div>
    <div class="legend">${datasets.map((d) => `<div class="legend-item"><span class="legend-dot" style="background:${d.color}"></span>${d.name}: ${eur(d.total)}</div>`).join("")}</div>`;

  if (expChart) expChart.destroy();
  expChart = new Chart(document.getElementById("expChartCanvas"), {
    type: "bar",
    data: {
      labels,
      datasets: datasets.map((d) => ({ label: d.name, data: d.data, backgroundColor: d.color, borderRadius: 3 })),
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${eur(ctx.parsed.y)}` } },
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, grid: { color: "#EFE3D8" }, ticks: { callback: (v) => eur(v) } },
      },
    },
  });
}

/* ───────────────── RENDER ───────────────── */
function render() {
  buildAddForm();
  renderDashboard();
  if (document.getElementById("page-history").classList.contains("active")) renderHistory();
  if (document.getElementById("page-salute").classList.contains("active")) renderMeds();
  if (document.getElementById("page-scadenze").classList.contains("active")) renderDeadlines();
  if (document.getElementById("page-stats").classList.contains("active")) renderStats();
}

document.getElementById("loginBtn").onclick = doGoogleLogin;
document.getElementById("logoutBtn").onclick = doLogout;
buildAddForm();
buildDeadlineForm();
initFirebase();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}
