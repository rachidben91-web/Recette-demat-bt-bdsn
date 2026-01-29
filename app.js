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
  const el = $("zonesStatus");
  if (el) el.textContent = msg;
}
function setPdfStatus(msg) {
  const el = $("pdfStatus");
  if (el) el.textContent = msg;
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
    
    return {
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
    
    return {
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

function renderTimeline(filtered, timeline) {
  timeline.innerHTML = "";
  
  if (filtered.length === 0) {
    timeline.innerHTML = `<div class="timeline-empty">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  // Définir les quarts d'heure (7h30 à 17h00) - une colonne toutes les 15 minutes
  const timeSlots = [];
  
  // Commencer à 7h30
  timeSlots.push({ time: 7.5, label: "7h30", isHour: false });
  timeSlots.push({ time: 7.75, label: "45", isHour: false });
  
  // Puis de 8h à 16h (heures complètes)
  for (let h = 8; h <= 16; h++) {
    for (let m = 0; m < 60; m += 15) {
      const time = h + m / 60;
      let label = "";
      if (m === 0) {
        label = `${h}h`;
      } else {
        label = `${m}`;
      }
      timeSlots.push({ time, label, isHour: m === 0 });
    }
  }
  
  // Terminer à 17h00
  timeSlots.push({ time: 17, label: "17h", isHour: true });

  // Récupérer tous les techniciens qui ont des BT
  const techSet = new Map();
  for (const bt of filtered) {
    for (const member of bt.team || []) {
      const tech = mapTechByNni(member.nni);
      if (tech) {
        const key = techKey(tech);
        if (!techSet.has(key)) {
          techSet.set(key, tech.name);
        }
      }
    }
  }

  if (techSet.size === 0) {
    timeline.innerHTML = `<div class="timeline-empty">Aucun technicien trouvé pour ces BT.</div>`;
    return;
  }

  // Trier les techniciens par nom
  const techs = Array.from(techSet.entries()).sort((a, b) => 
    a[1].localeCompare(b[1])
  );

  // Créer une map BT par technicien
  const btsByTech = new Map();
  for (const bt of filtered) {
    for (const member of bt.team || []) {
      const tech = mapTechByNni(member.nni);
      if (tech) {
        const key = techKey(tech);
        if (!btsByTech.has(key)) {
          btsByTech.set(key, []);
        }
        btsByTech.get(key).push(bt);
      }
    }
  }

  // Créer la grille - 1 ligne par technicien, 1 colonne toutes les 15min
  const container = document.createElement("div");
  container.style.cssText = "position:relative; overflow-x:auto; background:#fff; border-radius:var(--radius); border:1.5px solid var(--line); box-shadow:var(--shadow);";

  const grid = document.createElement("div");
  grid.className = "timeline-grid";
  grid.style.gridTemplateColumns = `180px repeat(${timeSlots.length}, minmax(50px, 1fr))`;
  grid.style.gridTemplateRows = `50px repeat(${techs.length}, 70px)`;
  grid.style.position = "relative";

  // Header
  const header = document.createElement("div");
  header.className = "timeline-header";

  const corner = document.createElement("div");
  corner.className = "timeline-corner";
  corner.textContent = "Techniciens";
  header.appendChild(corner);

  for (let i = 0; i < timeSlots.length; i++) {
    const slot = timeSlots[i];
    const hourCell = document.createElement("div");
    hourCell.className = "timeline-hour";
    hourCell.style.gridColumn = i + 2;
    hourCell.style.fontSize = slot.isHour ? "11px" : "9px";
    hourCell.style.fontWeight = slot.isHour ? "700" : "600";
    hourCell.style.color = slot.isHour ? "var(--txt)" : "var(--muted)";
    hourCell.textContent = slot.label; // Afficher tous les labels
    header.appendChild(hourCell);
  }

  grid.appendChild(header);

  // Lignes: techniciens + cellules + BT
  techs.forEach(([techId, techName], techIdx) => {
    const rowNum = techIdx + 2;
    
    // Nom du technicien
    const techCell = document.createElement("div");
    techCell.className = "timeline-tech";
    techCell.style.gridRow = rowNum;
    
    const avatar = document.createElement("div");
    avatar.className = "timeline-tech-avatar";
    avatar.textContent = techName.substring(0, 2).toUpperCase();
    
    const nameDiv = document.createElement("div");
    nameDiv.style.fontSize = "12px";
    nameDiv.style.lineHeight = "1.3";
    nameDiv.textContent = techName;
    
    techCell.appendChild(avatar);
    techCell.appendChild(nameDiv);
    grid.appendChild(techCell);

    // Cellules vides pour chaque quart d'heure
    for (let slotIdx = 0; slotIdx < timeSlots.length; slotIdx++) {
      const cell = document.createElement("div");
      cell.className = "timeline-cell";
      cell.style.gridRow = rowNum;
      cell.style.gridColumn = slotIdx + 2;
      // Bordure plus épaisse toutes les heures
      if (timeSlots[slotIdx].isHour) {
        cell.style.borderLeft = "2px solid var(--line-strong)";
      }
      grid.appendChild(cell);
    }

    // Ajouter les BT pour ce technicien
    const techBTs = btsByTech.get(techId) || [];
    
    techBTs.forEach((bt, btIndex) => {
      const timeSlot = extractTimeSlot(bt);
      const classification = classifyIntervention(bt);
      
      // Debug pour le premier BT
      if (btIndex === 0) {
        console.log(`[${techName}] BT ${bt.id}:`, {
          designation: bt.designation,
          duree: bt.duree,
          timeSlot
        });
      }
      
      let startCol, colSpan;
      
      if (timeSlot) {
        // Utiliser les heures réelles avec précision au quart d'heure
        let startTime = Math.max(7.5, Math.min(17, timeSlot.start));
        let endTime = Math.max(7.5, Math.min(17, timeSlot.end));
        
        // Arrondir au quart d'heure le plus proche
        // 1 quart d'heure = 0.25h
        const roundToQuarter = (time) => Math.round(time * 4) / 4;
        startTime = roundToQuarter(startTime);
        endTime = roundToQuarter(endTime);
        
        // Calculer l'index de colonne (4 colonnes par heure, début à 7h30)
        // 7h30 = index 0 = col 2
        // 7h45 = index 1 = col 3
        // 8h00 = index 2 = col 4
        // 8h15 = index 3 = col 5
        // 9h00 = index 6 = col 8
        const startIdx = Math.round((startTime - 7.5) * 4);
        const endIdx = Math.round((endTime - 7.5) * 4);
        
        startCol = startIdx + 2;
        colSpan = Math.max(1, endIdx - startIdx);
      } else {
        // Pas d'horaire trouvé, placement automatique équilibré
        const slotsPerBT = Math.floor(timeSlots.length / (techBTs.length || 1));
        startCol = btIndex * slotsPerBT + 2;
        colSpan = Math.max(1, slotsPerBT);
        
        // Ne pas dépasser la fin
        if (startCol + colSpan > timeSlots.length + 2) {
          startCol = timeSlots.length + 2 - colSpan;
        }
      }
      
      const btDiv = document.createElement("div");
      btDiv.className = "timeline-bt-block";
      btDiv.style.cssText = `
        grid-row: ${rowNum};
        grid-column: ${startCol} / span ${colSpan};
        background: ${classification.color};
        border: 2px solid ${classification.color};
        border-radius: 8px;
        padding: 8px 10px;
        cursor: pointer;
        transition: var(--transition);
        display: flex;
        flex-direction: column;
        gap: 3px;
        min-height: 50px;
        justify-content: center;
        z-index: 1;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
      `;
      
      const idDiv = document.createElement("div");
      idDiv.style.cssText = `
        font-weight: 800;
        font-size: 11px;
        color: #fff;
        line-height: 1.2;
      `;
      idDiv.textContent = bt.id;
      
      const typeDiv = document.createElement("div");
      typeDiv.style.cssText = `
        font-size: 9px;
        font-weight: 700;
        color: rgba(255,255,255,0.95);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        line-height: 1.2;
      `;
      typeDiv.textContent = classification.label;
      
      btDiv.appendChild(idDiv);
      btDiv.appendChild(typeDiv);
      
      if (timeSlot && colSpan >= 4) {
        const timeDiv = document.createElement("div");
        timeDiv.style.cssText = `
          font-size: 8px;
          color: rgba(255,255,255,0.85);
          margin-top: 2px;
          font-weight: 600;
        `;
        timeDiv.textContent = timeSlot.text;
        btDiv.appendChild(timeDiv);
      }
      
      btDiv.addEventListener("click", () => openModal(bt, bt.pageStart));
      btDiv.addEventListener("mouseenter", () => {
        btDiv.style.transform = "translateY(-2px) scale(1.02)";
        btDiv.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
        btDiv.style.zIndex = "10";
      });
      btDiv.addEventListener("mouseleave", () => {
        btDiv.style.transform = "translateY(0) scale(1)";
        btDiv.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
        btDiv.style.zIndex = "1";
      });
      
      grid.appendChild(btDiv);
    });
  });

  container.appendChild(grid);
  timeline.appendChild(container);
}

// -------------------------
// Render Brief (list)
// -------------------------
function renderBrief(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  if (!list) return;

  // brief => doit avoir un technicien sélectionné
  if (!state.filters.techId) {
    if (meta) meta.textContent = "";
    list.innerHTML = `<div class="hint" style="padding:16px;">
      Mode <b>Brief</b> : sélectionne un technicien à gauche.
    </div>`;
    return;
  }

  const techs = window.TECHNICIANS || [];
  const t = techs.find(x => techKey(x) === state.filters.techId);
  if (meta) meta.textContent = t ? `${t.name} — ${filtered.length} BT` : "";

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien avec ces filtres.</div>`;
    return;
  }

  for (const bt of filtered) {
    const classification = classifyIntervention(bt);
    
    const card = document.createElement("div");
    card.className = "card briefCard";

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
      } catch (e) {
        console.error(e);
        setPdfStatus("Erreur PDF");
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
  try {
    setPdfStatus("Aucun PDF chargé");
    setProgress(0, "Prêt.");
    setExtractEnabled(false);

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
