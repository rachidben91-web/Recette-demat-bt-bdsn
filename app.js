/* ==== Compat: techniciens data ==== */
(function normalizeTechnicians(){
  // On accepte plusieurs noms de variables selon l'historique du repo.
  // But: exposer TOUJOURS un tableau dans window.TECHNICIANS
  const candidates = [
    window.TECHNICIANS,
    window.TECHNICIENS,
    window.technicians,
    window.techniciens,
  ].filter(Boolean);

  if (!window.TECHNICIANS) {
    const first = candidates[0];
    if (Array.isArray(first)) {
      window.TECHNICIANS = first;
    } else if (first && typeof first === "object") {
      // si c'est un objet { list: [...] } ou { data: [...] }
      const arr = first.list || first.data || first.items || first.technicians || first.techniciens;
      window.TECHNICIANS = Array.isArray(arr) ? arr : [];
    } else {
      window.TECHNICIANS = [];
    }
  }

  // Normalisation légère: champs attendus (nni, name) si existants
  window.TECHNICIANS = (window.TECHNICIANS || []).map(t => ({
    ...t,
    nni: (t.nni || t.NNI || t.id || t.code || "").toString(),
    name: (t.name || t.nom || t.fullName || t.display || "").toString() || (t.prenom ? `${t.prenom} ${t.nom||""}`.trim() : (t.nom||"")),
    manager: t.manager || t.Manager || t.referent || t.responsable || ""
  }));
})();

/* app.js — DEMAT-BT v2.0 (Version avec modal + viewer)
   Compatible avec TON index.html :
   - Référent:  #viewReferent + #btGrid + #kpis
   - Brief:     #viewBrief + #briefList + #briefMeta
   - Import PDF: input#pdfFile
   - Extraire:   button#btnExtract
   - Modal viewer: #modal avec canvas
*/

const DOC_TYPES = ["BT", "AT", "PROC", "PLAN", "PHOTO", "STREET", "DOC"];
let ZONES = null;

// ---- Version ----
const APP_VERSION = "v1.4.0";

const state = {
  pdf: null,
  pdfFile: null,
  pdfName: "",
  totalPages: 0,
  bts: [],
  view: "referent", // referent | brief
  layout: "grid", // grid | timeline
  filters: {
    q: "",
    types: new Set(),
    techId: ""
  },
  countsByTechId: new Map(),
  // modal viewer state
  modal: {
    open: false,
    currentBT: null,
    currentPage: 1
  }
};

// -------------------------
// Helpers DOM
// -------------------------
const $ = (id) => document.getElementById(id);

function setZonesStatus(msg) {


function catClass(raw){
  const s = (raw||"").toString().toLowerCase();
  if (s.includes("client")) return "clientele";
  if (s.includes("maint")) return "maintenance";
  if (s.includes("surv")) return "surveillance";
  if (s.includes("admin")) return "administratif";
  return "autre";
}

function escapeHtml(input) {
  const s = (input ?? "").toString();
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

  const el = $("zonesStatus");
  if (el) el.textContent = msg;
}
function setPdfStatus(msg) {
  const el = $("pdfStatus");
  if (el) el.textContent = msg;
}

function setVersionBadge(){
  const el = $("appVersion");
  if (el) el.textContent = APP_VERSION;
}

function setProgress(pct, msg) {
  const bar = $("progBar");
  const m = $("progMsg");
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (m && msg != null) m.textContent = msg;
}
function setExtractEnabled(enabled) {
  const btn = $("btnExtract");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("btn--disabled", !enabled);
}

function norm(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[']/g, "'")
    .trim();
}

function safeUpper(s) {
  return norm(s).toUpperCase();
}



// -------------------------
// Topbar clock + status (Temps réel)
// -------------------------
const TOPBAR_STATUS = {
  WAIT:  { cls: "tbDot--wait",  label: "En attente du PDF" },
  LOADED:{ cls: "tbDot--loaded",label: "PDF chargé" },
  DONE:  { cls: "tbDot--done",  label: "BT extraits" },
  ERROR: { cls: "tbDot--error", label: "Erreur" }
};

function formatDateFR(d) {
  // Ex: "lundi 26 janvier 2026"
  try {
    return d.toLocaleDateString("fr-FR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch {
    // fallback
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
  }
}

function formatTimeFR(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setTopbarStatus(kind, titleOverride) {
  const dot = $("tbDot");
  if (!dot) return;

  // remove known classes
  dot.classList.remove(
    TOPBAR_STATUS.WAIT.cls,
    TOPBAR_STATUS.LOADED.cls,
    TOPBAR_STATUS.DONE.cls,
    TOPBAR_STATUS.ERROR.cls
  );

  const entry = TOPBAR_STATUS[kind] || TOPBAR_STATUS.WAIT;
  dot.classList.add(entry.cls);
  dot.title = titleOverride || entry.label;
}

function setTopbarMeta(text) {
  const meta = $("tbMeta");
  if (meta) meta.textContent = text || "";
}

function updateTopbarClock() {
  const main = $("tbDateTime");
  if (!main) return;
  const now = new Date();
  main.textContent = `${formatDateFR(now)} — ${formatTimeFR(now)}`;
  // meta stays whatever status message is
}

function startTopbarClock() {
  updateTopbarClock();
  // refresh every minute (align to minute boundary)
  const now = new Date();
  const msToNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(() => {
    updateTopbarClock();
    setInterval(updateTopbarClock, 60 * 1000);
  }, Math.max(250, msToNextMinute));
}
// -------------------------
// Load zones.json
// -------------------------
async function loadZones() {
  setZonesStatus("Chargement…");
  const res = await fetch(`./zones.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("zones.json introuvable (404). Vérifie emplacement/nom.");
  ZONES = await res.json();
  setZonesStatus("OK");
  console.log("[DEMAT-BT] zones.json chargé ✅", ZONES);
}

function getZoneBBox(label) {
  if (!ZONES) return null;
  try {
    const bb = ZONES.pages?.BT?.[label]?.bbox;
    if (bb) return bb;
  } catch {}
  return null;
}

// -------------------------
// PDF.js via script tag
// -------------------------
async function ensurePdfJs() {
  if (window.pdfjsLib) return;

  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger pdf.js"));
    document.head.appendChild(s);
  });

  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// -------------------------
// Extraction texte dans bbox
// -------------------------
async function extractTextInBBox(page, bbox) {
  if (!bbox) return "";
  const tc = await page.getTextContent();
  const items = tc.items || [];
  const { x0, y0, x1, y1 } = bbox;

  const picked = [];
  for (const it of items) {
    const t = it.transform;
    if (!t) continue;
    const x = t[4];
    const y = t[5];
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const str = (it.str || "").trim();
      if (str) picked.push({ str, x, y });
    }
  }

  // tri approx lecture
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// -------------------------
// Détection BT / types docs
// -------------------------
function isBTNumber(text) {
  return /BT\d{8,14}/i.test(text || "");
}
function pickBTId(text) {
  return ((text || "").match(/BT\d{8,14}/i) || [""])[0].toUpperCase();
}
function pickATId(text) {
  return ((text || "").match(/AT\d{3,}/i) || [""])[0].toUpperCase();
}
function detectDocTypeFromHeader(text) {
  const up = safeUpper(text);
  if (up.includes("AUTORISATION") || up.includes("AT N")) return "AT";
  if (up.includes("PROCEDURE") || up.includes("PROC") || up.includes("ORDONNANCEMENT")) return "PROC";
  if (up.includes("PLAN") || up.includes("PLANS")) return "PLAN";
  if (up.includes("PHOTO") || up.includes("PHOTOS")) return "PHOTO";
  if (up.includes("STREET")) return "STREET";
  return "DOC";
}

// -------------------------
// Classification des interventions
// -------------------------
function classifyIntervention(bt) {
  const objet = safeUpper(bt.objet || "");
  
  // Clientèle (bleu)
  if (objet.includes("MISE EN SERVICE") || 
      objet.includes("MISE OU REMISE EN SERVICE") ||
      objet.includes("REMISE EN SERVICE") ||
      objet.includes("MISE HORS SERVICE") ||
      objet.includes("MHS") ||
      objet.includes("MES") ||
      objet.includes("COMPTEUR") ||
      objet.includes("POSTE CLIENT")) {
    return { category: "CLIENTELE", label: "MHS/MES", color: "#2563eb", icon: "🟦" };
  }
  
  // Maintenance (vert)
  if (objet.includes("MAINTENANCE") ||
      objet.includes("CI-CM") ||
      objet.includes("CICM") ||
      objet.includes("ROBINET") ||
      objet.includes("PREVENTIF")) {
    return { category: "MAINTENANCE", label: "MAINT CI-CM", color: "#10b981", icon: "🟩" };
  }
  
  // Surveillance (orange)
  if (objet.includes("SURVEILLANCE") ||
      objet.includes("ADF") ||
      objet.includes("SUIVI") ||
      objet.includes("ALERTE") ||
      objet.includes("FUITE")) {
    return { category: "SURVEILLANCE", label: "SURVEILLANCE", color: "#f59e0b", icon: "🟧" };
  }
  
  // Localisation (orange foncé)
  if (objet.includes("LOCALISATION")) {
    return { category: "LOCALISATION", label: "LOCALISATION", color: "#ea580c", icon: "🟧" };
  }
  
  // Administratif (violet)
  if (objet.includes("REUNION") ||
      objet.includes("DIVERS") ||
      objet.includes("ADMINISTRATIF") ||
      objet.includes("FORMATION")) {
    return { category: "ADMINISTRATIF", label: "ADMINISTRATIF", color: "#a855f7", icon: "🟪" };
  }
  
  // Autre (gris)
  return { category: "AUTRE", label: "AUTRE", color: "#64748b", icon: "⬛" };
}

// -------------------------
// Formater la durée pour l'affichage
// -------------------------
function formatDuree(dureeText) {
  if (!dureeText) return null;
  
  // Format GRDF : "DUREE 01h00 13h00 - 14h00"
  // Extraire juste la durée et les horaires
  const grdfPattern = /DUREE\s+(\d{1,2}h\d{2})\s+(\d{1,2}h\d{2}\s*[-–]\s*\d{1,2}h\d{2})/i;
  const match = dureeText.match(grdfPattern);
  
  if (match) {
    return `${match[2]} (${match[1]})`;
  }
  
  // Sinon retourner tel quel nettoyé
  return dureeText.replace(/^DUREE\s+/i, '');
}

// -------------------------
// Extraction des heures de début et fin
// -------------------------
function extractTimeSlot(bt) {
  const duree = bt.duree || "";
  const desi = bt.designation || "";
  
  // Format GRDF : "DUREE 01h00 13h00 - 14h00" ou "DUREE 04h00 08h00 - 12h00"
  // Pattern : DUREE [durée] [heure_début] - [heure_fin]
  const grdfPattern = /DUREE\s+\d{1,2}h\d{2}\s+(\d{1,2})h(\d{2})\s*[-–]\s*(\d{1,2})h(\d{2})/i;
  const grdfMatch = duree.match(grdfPattern);
  
  if (grdfMatch) {
    const startHour = parseInt(grdfMatch[1]);
    const startMin = parseInt(grdfMatch[2]);
    const endHour = parseInt(grdfMatch[3]);
    const endMin = parseInt(grdfMatch[4]);
    let startTotal = startHour*60 + startMin;
    let endTotal = endHour*60 + endMin;
    if (endTotal <= startTotal) endTotal += 24*60;
    
    return {
      startMin: startTotal,
      endMin: endTotal,
      start: startHour + startMin / 60,
      end: endHour + endMin / 60,
      text: `${grdfMatch[1]}h${grdfMatch[2]} - ${grdfMatch[3]}h${grdfMatch[4]}`
    };
  }
  
  // Essayer le format simple dans DUREE : "08h00 - 12h00"
  const simplePattern = /(\d{1,2})h(\d{2})\s*[-–]\s*(\d{1,2})h(\d{2})/i;
  const simpleMatch = duree.match(simplePattern);
  
  if (simpleMatch) {
    const startHour = parseInt(simpleMatch[1]);
    const startMin = parseInt(simpleMatch[2]);
    const endHour = parseInt(simpleMatch[3]);
    const endMin = parseInt(simpleMatch[4]);
    let startTotal = startHour*60 + startMin;
    let endTotal = endHour*60 + endMin;
    if (endTotal <= startTotal) endTotal += 24*60;
    
    return {
      startMin: startTotal,
      endMin: endTotal,
      start: startHour + startMin / 60,
      end: endHour + endMin / 60,
      text: `${simpleMatch[1]}h${simpleMatch[2]} - ${simpleMatch[3]}h${simpleMatch[4]}`
    };
  }
  
  // Essayer dans DESIGNATION
  const desiMatch = desi.match(simplePattern);
  if (desiMatch) {
    const startHour = parseInt(desiMatch[1]);
    const startMin = parseInt(desiMatch[2]);
    const endHour = parseInt(desiMatch[3]);
    const endMin = parseInt(desiMatch[4]);
    
    return {
      startMin: startTotal,
      endMin: endTotal,
      start: startHour + startMin / 60,
      end: endHour + endMin / 60,
      text: `${desiMatch[1]}h${desiMatch[2]} - ${desiMatch[3]}h${desiMatch[4]}`
    };
  }
  
  // Sinon, retourner null
  return null;
}

// -------------------------
// Team parsing depuis REALISATION (NNI + nom)
// Pattern NNI: 1 lettre + 5 chiffres (A94073)
// -------------------------
function parseTeamFromRealisation(text) {
  const t = safeUpper(text);
  const re = /([A-Z]\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]{2,60})/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = m[1];
    const name = norm(m[2]);
    if (!out.some(x => x.nni === nni)) out.push({ nni, name });
  }
  return out;
}

function mapTechByNni(nni) {
  const techs = window.TECHNICIANS || [];
  return techs.find(t => (t.nni || "").toUpperCase() === (nni || "").toUpperCase()) || null;
}
function techKey(tech) {
  return tech ? (tech.id || tech.nni) : "";
}

// -------------------------
// Extraction principale
// -------------------------
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("Zones non chargées.");

  const bbBTNUM = getZoneBBox("BT_NUM");
  const bbOBJ = getZoneBBox("OBJET");
  const bbDATE = getZoneBBox("DATE_PREVUE") || getZoneBBox("DATE_PREVU");
  const bbLOC = getZoneBBox("LOCALISATION");
  const bbCLIENT = getZoneBBox("CLIENT_NOM");
  const bbAT = getZoneBBox("AT_NUM");
  const bbREAL = getZoneBBox("REALISATION");
  const bbDESI = getZoneBBox("DESIGNATION");
  const bbDUREE = getZoneBBox("DUREE"); // Nouveau: durée prévue

  state.bts = [];
  state.countsByTechId = new Map();

  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    const btNumTxt = norm(await extractTextInBBox(page, bbBTNUM));
    const isBtPage = isBTNumber(btNumTxt);

    if (isBtPage) {
      const id = pickBTId(btNumTxt);
      const objet = norm(await extractTextInBBox(page, bbOBJ));
      const datePrevue = norm(await extractTextInBBox(page, bbDATE));
      const client = norm(await extractTextInBBox(page, bbCLIENT));
      const loc = norm(await extractTextInBBox(page, bbLOC));
      const atNumTxt = norm(await extractTextInBBox(page, bbAT));
      const atNum = pickATId(atNumTxt);
      const realTxt = norm(await extractTextInBBox(page, bbREAL));
      const desiTxt = norm(await extractTextInBBox(page, bbDESI));
      const dureeTxt = norm(await extractTextInBBox(page, bbDUREE)); // Durée prévue

      const team = parseTeamFromRealisation(realTxt);

      currentBT = {
        id,
        pageStart: p,
        objet,
        datePrevue,
        client,
        localisation: loc,
        atNum,
        team,
        designation: desiTxt,
        duree: dureeTxt, // Stocker la durée
        docs: [{ page: p, type: "BT" }]
      };

      state.bts.push(currentBT);

      // compteur BT par technicien (si équipe trouvée)
      for (const m of team) {
        const tech = mapTechByNni(m.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }

      continue;
    }

    // pages suivantes rattachées au dernier BT
    if (currentBT) {
      const header = norm(await extractTextInBBox(page, bbOBJ));
      const type = detectDocTypeFromHeader(header);
      currentBT.docs.push({ page: p, type });
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  console.log("[DEMAT-BT] Extraction OK ✅", state.bts.length, "BT");
  // Statut topbar
  setTopbarStatus('DONE');
  setTopbarMeta(`BT extraits : ${state.bts.length}`);
  renderAll();
}

// -------------------------
// UI: chips types
// -------------------------
function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;

  root.innerHTML = "";
  for (const t of DOC_TYPES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = t;
    btn.addEventListener("click", () => {
      if (state.filters.types.has(t)) state.filters.types.delete(t);
      else state.filters.types.add(t);
      syncTypeChipsUI();
      renderAll();
    });
    root.appendChild(btn);
  }
  syncTypeChipsUI();
}

function syncTypeChipsUI() {
  const root = $("typeChips");
  if (!root) return;
  [...root.querySelectorAll(".chip")].forEach(chip => {
    const t = chip.textContent.trim();
    chip.classList.toggle("chip--active", state.filters.types.has(t));
  });
}

// -------------------------
// Tech select (avec compteurs)
// -------------------------
function buildTechSelectWithCounts() {
  const sel = $("techSelect");
  if (!sel) return;

  const current = sel.value;
  sel.innerHTML = '<option value="">— Tous —</option>';

  const techs = window.TECHNICIANS || [];
  const withBt = techs.filter(t => {
    const cnt = state.countsByTechId.get(techKey(t)) || 0;
    return cnt > 0;
  });

  // tri alpha
  withBt.sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  for (const t of withBt) {
    const cnt = state.countsByTechId.get(techKey(t)) || 0;
    const opt = document.createElement("option");
    opt.value = techKey(t);
    opt.textContent = `${t.name} (${cnt} BT)`;
    sel.appendChild(opt);
  }

  // restore selection si encore valide
  if (current && withBt.some(t => techKey(t) === current)) {
    sel.value = current;
  } else {
    sel.value = "";
  }
}

// -------------------------
// Filtrage
// -------------------------
function matchesFilters(bt) {
  const q = safeUpper(state.filters.q);
  if (q) {
    const hay = safeUpper([bt.id, bt.objet, bt.client, bt.localisation, bt.datePrevue].join(" "));
    if (!hay.includes(q)) return false;
  }

  if (state.filters.types.size > 0) {
    const typesInBt = new Set(bt.docs.map(d => d.type));
    let ok = false;
    for (const t of state.filters.types) {
      if (typesInBt.has(t)) { ok = true; break; }
    }
    if (!ok) return false;
  }

  if (state.filters.techId) {
    const wanted = state.filters.techId;
    const has = (bt.team || []).some(m => {
      const tech = mapTechByNni(m.nni);
      return techKey(tech) === wanted;
    });
    if (!has) return false;
  }

  return true;
}

// -------------------------
// Render KPI
// -------------------------
function renderKpis(filtered) {
  const kpis = $("kpis");
  if (!kpis) return;

  const totalBT = filtered.length;
  const docsCount = filtered.reduce((acc, bt) => acc + (bt.docs?.length || 0), 0);

  kpis.innerHTML = `
    <div class="kpi"><b>${totalBT}</b> BT</div>
    <div class="kpi"><b>${docsCount}</b> Pages liées</div>
  `;
}

// -------------------------
// Render Référent (grid)
// -------------------------
function renderReferent(filtered) {
  const grid = $("btGrid");
  const timeline = $("btTimeline");
  
  if (!grid || !timeline) return;

  // Show/hide based on layout mode
  if (state.layout === "grid") {
    grid.style.display = "grid";
    timeline.style.display = "none";
    renderGrid(filtered, grid);
  } else {
    grid.style.display = "none";
    timeline.style.display = "flex";
    renderTimeline(filtered, timeline);
  }
}

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const teamTxt = (bt.team || []).map(m => {
      const tech = mapTechByNni(m.nni);
      return tech ? tech.name : m.nni;
    }).join(" • ") || "—";

    // Compter les docs par type
    const counts = {};
    for (const d of bt.docs || []) counts[d.type] = (counts[d.type] || 0) + 1;

    // Classification de l'intervention
    const classification = classifyIntervention(bt);

    const card = document.createElement("div");
    card.className = "card btCard";
    
    // Top section avec ID et badges
    const topDiv = document.createElement("div");
    topDiv.className = "btTop";
    
    const leftSection = document.createElement("div");
    leftSection.style.display = "flex";
    leftSection.style.flexDirection = "column";
    leftSection.style.gap = "6px";
    
    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";
    
    // Badge de catégorie bien visible
    const categoryBadge = document.createElement("div");
    categoryBadge.className = "category-label";
    categoryBadge.style.cssText = `
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: ${classification.color};
      color: #fff;
      box-shadow: 0 2px 8px ${classification.color}40;
    `;
    categoryBadge.textContent = classification.label;
    
    leftSection.appendChild(idDiv);
    leftSection.appendChild(categoryBadge);
    
    const badgesDiv = document.createElement("div");
    badgesDiv.className = "badges";
    
    // Créer des badges pour chaque type de doc
    for (const [type, count] of Object.entries(counts)) {
      const badge = document.createElement("span");
      badge.className = type === "BT" ? "badge badge--strong" : "badge";
      badge.textContent = `${type}:${count}`;
      badgesDiv.appendChild(badge);
    }
    
    topDiv.appendChild(leftSection);
    topDiv.appendChild(badgesDiv);
    
    // Meta info
    const metaDiv = document.createElement("div");
    metaDiv.className = "btMeta";
    const dureeFormatted = formatDuree(bt.duree);
    metaDiv.innerHTML = `
      <div>📅 ${bt.datePrevue || "—"}</div>
      ${dureeFormatted ? `<div>⏱️ ${dureeFormatted}</div>` : ""}
      <div>📋 ${bt.objet || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      <div>👥 ${teamTxt}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;
    
    // Actions (boutons pour voir les docs)
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "btActions";
    
    // Créer un bouton pour chaque document
    for (const doc of bt.docs || []) {
      const btn = document.createElement("button");
      btn.className = "btn btn--secondary";
      btn.textContent = `${doc.type} (p.${doc.page})`;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      actionsDiv.appendChild(btn);
    }
    
    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    card.appendChild(actionsDiv);
    grid.appendChild(card);
  }
}

function renderTimeline(filtered, hostEl){
  const host = hostEl || $("btTimeline");
  if (!host) return;

  // Keep legend if present; render content inside a dedicated canvas container
  let canvas = host.querySelector(".timelineCanvas");
  if (!canvas){
    canvas = document.createElement("div");
    canvas.className = "timelineCanvas";
    host.appendChild(canvas);
  }
  canvas.innerHTML = "";

  if (!filtered || !filtered.length){
    canvas.innerHTML = `<div class="emptyHint">Aucun BT à afficher.</div>`;
    return;
  }

  const DAY_START = 7*60 + 30;  // 07h30
  const DAY_END   = 17*60;      // 17h00
  const SPAN = Math.max(1, DAY_END - DAY_START);

  // Ticks: 07h30 then every hour
  const ticks = [];
  ticks.push({t: DAY_START, label: "07h30"});
  for (let t = 8*60; t <= DAY_END; t += 60){
    const hh = Math.floor(t/60);
    ticks.push({t, label: `${hh}h`});
  }

  // Group by technician (first in team) for Referent view
  const byTech = new Map();
  for (const bt of filtered){
    const team = Array.isArray(bt.team) ? bt.team : [];
    const tech = team[0];
    if (!tech) continue;
    const key = (tech.nni || tech.NNI || tech.id || tech.code || tech.name || "UNK").toString();
    if (!byTech.has(key)) byTech.set(key, { tech, bts: [] });
    byTech.get(key).bts.push(bt);
  }

  const groups = Array.from(byTech.values());
  if (!groups.length){
    canvas.innerHTML = `<div class="emptyHint">Aucun technicien trouvé pour ces BT.</div>`;
    return;
  }

  // Build grid
  const grid = document.createElement("div");
  grid.className = "timelineGrid";
  canvas.appendChild(grid);

  // Header row
  const head = document.createElement("div");
  head.className = "tlHead";
  grid.appendChild(head);

  const headLeft = document.createElement("div");
  headLeft.className = "tlHeadLeft";
  headLeft.textContent = "Techniciens";
  head.appendChild(headLeft);

  const headRight = document.createElement("div");
  headRight.className = "tlHeadRight";
  head.appendChild(headRight);

  for (const tk of ticks){
    const el = document.createElement("div");
    el.className = "tlTick";
    el.textContent = tk.label;
    // position using CSS grid; we’ll rely on flex with equal columns
    headRight.appendChild(el);
  }

  // Rows
  for (const g of groups){
    const row = document.createElement("div");
    row.className = "tlRow";
    grid.appendChild(row);

    const left = document.createElement("div");
    left.className = "tlLeft";
    left.innerHTML = `<span class="tlAvatar">${(g.tech.name||"?").slice(0,2).toUpperCase()}</span><span class="tlName">${escapeHtml(g.tech.name||"Sans nom")}</span>`;
    row.appendChild(left);

    const right = document.createElement("div");
    right.className = "tlRight";
    row.appendChild(right);

    // Background tick columns
    for (let i=0;i<ticks.length;i++){
      const col = document.createElement("div");
      col.className = "tlCol";
      right.appendChild(col);
    }

    // Place BT blocks with minute-precise positioning
    const blocks = document.createElement("div");
    blocks.className = "tlBlocks";
    right.appendChild(blocks);

    const items = (g.bts||[]).slice().sort((a,b)=>{
      const sa = (extractTimeSlot(a)?.start ?? 1e9);
      const sb = (extractTimeSlot(b)?.start ?? 1e9);
      return sa - sb;
    });

    // Lane packing to avoid overlap
    const lanes = []; // lastEnd per lane
    for (const bt of items){
      const slot = extractTimeSlot(bt);
      if (!slot) continue;
      const s = Math.max(DAY_START, Math.min(DAY_END, slot.start));
      const e = Math.max(DAY_START, Math.min(DAY_END, slot.end));
      if (e <= s) continue;

      let lane = 0;
      while (lane < lanes.length && s < lanes[lane]) lane++;
      if (lane === lanes.length) lanes.push(0);
      lanes[lane] = e;

      const leftPct = ((s - DAY_START) / SPAN) * 100;
      const widthPct = ((e - s) / SPAN) * 100;

      const card = document.createElement("div");
      card.className = `tlBlock cat-${catClass(bt.categorie || bt.cat || bt.type || "")}`;
      card.style.left = `${leftPct}%`;
      card.style.width = `${widthPct}%`;
      card.style.top = `${lane * 26}px`;

      const code = escapeHtml(bt.id || bt.bt || bt.numero || "BT");
      const cat = escapeHtml(bt.categorie || bt.cat || "");
      const time = `${formatTime(s)}–${formatTime(e)}`;

      card.innerHTML = `<div class="tlBlockTop">${code}</div><div class="tlBlockMid">${cat}</div><div class="tlBlockBot">${time}</div>`;
      card.title = `${code} • ${cat} • ${time}`;
      card.addEventListener("click", ()=>openBtModal(bt));
      blocks.appendChild(card);
    }

    // Adjust row height according to lanes (min 1)
    const lanesCount = Math.max(1, lanes.length);
    row.style.setProperty("--lanes", lanesCount);
  }
}

function renderBriefTimeline(filtered, tech) {
  const host = $("briefTimeline");
  if (!host) return;
  host.innerHTML = "";

  const DAY_START = 7 * 60 + 30; // 07:30
  const DAY_END   = 17 * 60;     // 17:00
  const TOTAL_MIN = DAY_END - DAY_START;

  // Collect slots
  const items = filtered
    .map(bt => {
      const s = extractTimeSlot(bt);
      if (!s) return null;
      const startMin = Math.max(DAY_START, Math.min(DAY_END, s.startMin));
      const endMin   = Math.max(DAY_START, Math.min(DAY_END, s.endMin));
      if (endMin <= startMin) return null;
      return { bt, slot: { ...s, startMin, endMin } };
    })
    .filter(Boolean)
    .sort((a,b) => a.slot.startMin - b.slot.startMin);

  if (!items.length) {
    host.innerHTML = `<div class="hint">Aucun horaire détecté pour ce technicien.</div>`;
    return;
  }

  // Wrapper
  const wrap = document.createElement("div");
  wrap.className = "briefTimelineWrap";

  // Hours rail
  const rail = document.createElement("div");
  rail.className = "briefTimelineRail";
  wrap.appendChild(rail);

  for (let h = 8; h <= 17; h++) {
    const x = ((h*60 - DAY_START) / TOTAL_MIN) * 100;
    const tick = document.createElement("div");
    tick.className = "briefTick";
    tick.style.left = `${x}%`;

    const lab = document.createElement("div");
    lab.className = "briefTickLabel";
    lab.textContent = `${String(h).padStart(2,"0")}h`;
    tick.appendChild(lab);

    rail.appendChild(tick);
  }

  // Lane allocation
  const lanes = [];
  for (const it of items) {
    let lane = 0;
    while (lane < lanes.length) {
      const last = lanes[lane][lanes[lane].length-1];
      if (it.slot.startMin >= last.slot.endMin) break;
      lane++;
    }
    if (!lanes[lane]) lanes[lane] = [];
    lanes[lane].push(it);
  }

  // Lane container
  const laneBox = document.createElement("div");
  laneBox.className = "briefLanes";
  wrap.appendChild(laneBox);

  lanes.forEach((laneItems, li) => {
    const laneRow = document.createElement("div");
    laneRow.className = "briefLaneRow";
    laneRow.style.height = "54px";

    laneItems.forEach(({bt, slot}) => {
      const left = ((slot.startMin - DAY_START) / TOTAL_MIN) * 100;
      const width = ((slot.endMin - slot.startMin) / TOTAL_MIN) * 100;

      const block = document.createElement("div");
      block.className = `briefBlock ${classificationColorClass(bt)}`;
      block.style.left = `${left}%`;
      block.style.width = `${Math.max(2, width)}%`;

      const t = document.createElement("div");
      t.className = "briefBlockId";
      t.textContent = bt.id;

      const s = document.createElement("div");
      s.className = "briefBlockSub";
      s.textContent = slot.text || "";

      block.appendChild(t);
      block.appendChild(s);

      block.addEventListener("click", () => openBtModal(bt));
      laneRow.appendChild(block);
    });

    laneBox.appendChild(laneRow);
  });

  host.appendChild(wrap);
}


// -------------------------
// Render Brief (list)
// -------------------------
function renderBrief(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  const tlHost = $("briefTimeline");
  if (!list) return;

  // brief => doit avoir un technicien sélectionné
  if (!state.filters.techId) {
    if (meta) meta.textContent = "";
    if (tlHost) tlHost.innerHTML = `<div class="hint" style="padding:16px;">Sélectionne un technicien pour afficher la timeline.</div>`;
    list.innerHTML = `<div class="hint" style="padding:16px;">
      Mode <b>Brief</b> : sélectionne un technicien à gauche.
    </div>`;
    return;
  }

  const techs = window.TECHNICIANS || [];
  const t = techs.find(x => techKey(x) === state.filters.techId);
  if (meta) meta.textContent = t ? `${t.name} — ${filtered.length} BT` : "";

  renderBriefTimeline(filtered);

  list.innerHTML = "";
  if (filtered.length === 0) {
    if (tlHost) tlHost.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher sur la timeline.</div>`;
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const classification = classifyIntervention(bt);
    
    const card = document.createElement("div");
    card.className = "card briefCard";
    card.id = `briefCard-${bt.id}`;

    const titleDiv = document.createElement("div");
    titleDiv.style.display = "flex";
    titleDiv.style.alignItems = "center";
    titleDiv.style.gap = "12px";
    titleDiv.style.marginBottom = "10px";
    
    const idSpan = document.createElement("div");
    idSpan.className = "briefTitle";
    idSpan.style.margin = "0";
    idSpan.textContent = bt.id;
    
    const categoryBadge = document.createElement("div");
    categoryBadge.style.cssText = `
      display: inline-block;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      background: ${classification.color};
      color: #fff;
      box-shadow: 0 2px 8px ${classification.color}40;
    `;
    categoryBadge.textContent = classification.label;
    
    titleDiv.appendChild(idSpan);
    titleDiv.appendChild(categoryBadge);

    const subDiv = document.createElement("div");
    subDiv.className = "briefSub";
    const dureeFormatted = formatDuree(bt.duree);
    subDiv.innerHTML = `
      <div>📋 ${bt.objet || "—"}</div>
      <div>📅 ${bt.datePrevue || "—"}</div>
      ${dureeFormatted ? `<div>⏱️ ${dureeFormatted}</div>` : ""}
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;

    const docsDiv = document.createElement("div");
    docsDiv.className = "briefDocs";

    // Créer un bouton pour chaque document
    for (const doc of bt.docs || []) {
      const btn = document.createElement("button");
      btn.className = "docBtn";
      btn.textContent = `${doc.type} (p.${doc.page})`;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      docsDiv.appendChild(btn);
    }

    card.appendChild(titleDiv);
    card.appendChild(subDiv);
    card.appendChild(docsDiv);
    list.appendChild(card);
  }
}

// -------------------------
// Modal viewer
// -------------------------
function openModal(bt, pageNum) {
  state.modal.open = true;
  state.modal.currentBT = bt;
  state.modal.currentPage = pageNum;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "false");

  const title = $("modalTitle");
  if (title) title.textContent = `${bt.id} — Page ${pageNum}`;

  const subtitle = $("modalSubtitle");
  if (subtitle) subtitle.textContent = bt.objet || "";

  renderPage(pageNum);
  updateModalNavigation();
}

function closeModal() {
  state.modal.open = false;
  state.modal.currentBT = null;

  const modal = $("modal");
  if (modal) modal.setAttribute("aria-hidden", "true");
}

function updateModalNavigation() {
  const bt = state.modal.currentBT;
  if (!bt) return;

  const currentPage = state.modal.currentPage;
  const btPages = bt.docs.map(d => d.page);
  const minPage = Math.min(...btPages);
  const maxPage = Math.max(...btPages);

  const btnPrev = $("btnPrevPage");
  const btnNext = $("btnNextPage");

  if (btnPrev) {
    btnPrev.disabled = currentPage <= minPage;
  }

  if (btnNext) {
    btnNext.disabled = currentPage >= maxPage;
  }

  const info = $("modalInfo");
  if (info) {
    const pageIdx = btPages.indexOf(currentPage);
    info.textContent = `Page ${currentPage} (${pageIdx + 1}/${btPages.length} du BT)`;
  }
}

async function renderPage(pageNum) {
  if (!state.pdf || pageNum < 1 || pageNum > state.totalPages) return;

  const canvas = $("canvas");
  if (!canvas) return;

  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 2.0 });

  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: ctx, viewport }).promise;

  const title = $("modalTitle");
  if (title && state.modal.currentBT) {
    title.textContent = `${state.modal.currentBT.id} — Page ${pageNum}`;
  }

  state.modal.currentPage = pageNum;
  updateModalNavigation();
}

function nextPage() {
  if (!state.modal.open || !state.modal.currentBT) return;
  
  const bt = state.modal.currentBT;
  const btPages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const currentIdx = btPages.indexOf(state.modal.currentPage);
  
  if (currentIdx < btPages.length - 1) {
    renderPage(btPages[currentIdx + 1]);
  }
}

function prevPage() {
  if (!state.modal.open || !state.modal.currentBT) return;
  
  const bt = state.modal.currentBT;
  const btPages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const currentIdx = btPages.indexOf(state.modal.currentPage);
  
  if (currentIdx > 0) {
    renderPage(btPages[currentIdx - 1]);
  }
}

// Export BT complet en PDF
async function exportBTPDF() {
  if (!state.modal.currentBT || !window.PDFLib) {
    alert("Impossible d'exporter : pdf-lib non chargé");
    return;
  }

  try {
    const bt = state.modal.currentBT;
    const pages = bt.docs.map(d => d.page);

    // Charger le PDF original
    const arrayBuf = await state.pdfFile.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.load(arrayBuf);

    // Créer un nouveau PDF
    const newPdf = await window.PDFLib.PDFDocument.create();

    // Copier les pages du BT
    for (const pageNum of pages) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    }

    // Sauvegarder
    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `${bt.id}_export.pdf`;
    a.click();

    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Erreur export PDF:", e);
    alert("Erreur lors de l'export PDF");
  }
}

// -------------------------
// Render global + switch vues
// -------------------------
function setView(view) {
  state.view = view;

  const vRef = $("viewReferent");
  const vBrief = $("viewBrief");

  if (vRef) vRef.classList.toggle("view--active", view === "referent");
  if (vBrief) vBrief.classList.toggle("view--active", view === "brief");

  // boutons seg
  document.querySelectorAll(".seg__btn[data-view]").forEach(b => {
    b.classList.toggle("seg__btn--active", b.getAttribute("data-view") === view);
  });

  // Toggle flip mode for brief
  if (view === "brief") {
    document.body.classList.add("flip");
  } else {
    document.body.classList.remove("flip");
  }

  renderAll();
}

function renderAll() {
  buildTechSelectWithCounts();

  const filtered = state.bts.filter(matchesFilters);

  renderKpis(filtered);

  if (state.view === "referent") {
    renderReferent(filtered);
  } else {
    // en brief : filtrage tech obligatoire (sinon message)
    renderBrief(filtered);
  }
}

// -------------------------
// Wiring events
// -------------------------
function wireEvents() {
  // Search
  const search = $("searchInput");
  if (search) {
    search.addEventListener("input", () => {
      state.filters.q = search.value || "";
      renderAll();
    });
  }

  // Tech select
  const sel = $("techSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      state.filters.techId = sel.value || "";
      renderAll();
    });
  }

  // View switch
  document.querySelectorAll(".seg__btn[data-view]").forEach(b => {
    b.addEventListener("click", () => {
      setView(b.getAttribute("data-view"));
    });
  });

  // Layout switch (grid/timeline)
  document.querySelectorAll(".seg__btn[data-layout]").forEach(b => {
    b.addEventListener("click", () => {
      const layout = b.getAttribute("data-layout");
      state.layout = layout;
      
      // Update button states
      document.querySelectorAll(".seg__btn[data-layout]").forEach(btn => {
        btn.classList.toggle("seg__btn--active", btn.getAttribute("data-layout") === layout);
      });
      
      renderAll();
    });
  });

  // Import PDF
  const input = $("pdfFile");
  if (input) {
    input.addEventListener("change", async () => {
      const f = input.files && input.files[0];
      if (!f) return;

      try {
        setExtractEnabled(false);
        setPdfStatus(f.name);
        setProgress(0, "Chargement PDF…");

        await ensurePdfJs();

        state.pdfFile = f;
        state.pdfName = f.name;

        const buf = await f.arrayBuffer();
        const loadingTask = window.pdfjsLib.getDocument({ data: buf });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;

        console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
        setProgress(0, `PDF chargé (${state.totalPages} pages).`);
        setExtractEnabled(true);

        // Statut topbar
        setTopbarStatus('LOADED', f.name);
        setTopbarMeta('PDF chargé — prêt à extraire');
      } catch (e) {
        console.error(e);
        setPdfStatus("Erreur PDF");
        setTopbarStatus('ERROR', "Erreur chargement PDF");
        setTopbarMeta("Erreur PDF");
        setProgress(0, "Erreur chargement PDF (voir console).");
        setExtractEnabled(false);
      }
    });
  }

  // Extract
  const btn = $("btnExtract");
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        if (!state.pdf) { setProgress(0, "Choisis d'abord un PDF."); return; }
        setExtractEnabled(false);
        setProgress(0, "Extraction en cours…");
        await extractAll();
      } catch (e) {
        console.error(e);
        setProgress(0, "Erreur extraction (voir console).");
      } finally {
        setExtractEnabled(!!state.pdf);
      }
    });
  }

  // Modal close
  const modal = $("modal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.hasAttribute("data-close") || e.target.classList.contains("modal__backdrop")) {
        closeModal();
      }
    });
  }

  // Modal navigation
  const btnPrev = $("btnPrevPage");
  if (btnPrev) btnPrev.addEventListener("click", prevPage);

  const btnNext = $("btnNextPage");
  if (btnNext) btnNext.addEventListener("click", nextPage);

  // Modal export
  const btnExport = $("btnExportBt");
  if (btnExport) btnExport.addEventListener("click", exportBTPDF);

  // Fullscreen
  const btnFS = $("btnFullscreen");
  if (btnFS) {
    btnFS.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    });
  }

  // Keyboard navigation dans modal
  document.addEventListener("keydown", (e) => {
    if (!state.modal.open) return;
    
    if (e.key === "ArrowLeft") prevPage();
    if (e.key === "ArrowRight") nextPage();
    if (e.key === "Escape") closeModal();
  });
}

// -------------------------
// Init
// -------------------------
async function init() {
  setVersionBadge();
  try {
    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");
    setExtractEnabled(false);

    // Temps réel (topbar) + statut
    startTopbarClock();
    setTopbarStatus('WAIT');
    setTopbarMeta('En attente du PDF');

    buildTypeChips();
    wireEvents();

    await loadZones();

    // vue par défaut
    setView("referent");
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    setProgress(0, "Erreur init (voir console).");
  }
}

document.addEventListener("DOMContentLoaded", init);
