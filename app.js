/* app.js — DEMAT-BT V10.0
   - Amélioration majeure: Détection avancée des pièces jointes (AT, PROC, PLAN, PHOTO, STREET)
   - Ajout: Analyse du contenu des pages (détection d'images pour PHOTO)
   - Ajout: Filtres visuels avec icônes et compteurs pour types de documents
   - Ajout: Badges colorés avec icônes pour chaque type de document
   - Amélioration: Patterns de reconnaissance multiples et robustes
   - Amélioration: Interface utilisateur avec couleurs et icônes distinctives
   - Baseline: V9.3
*/

const APP_VERSION = "V10.0";
const DOC_TYPES_CONFIG = {
  "BT": { label: "BT", icon: "📋", color: "#1e293b", desc: "Bon de Travail" },
  "AT": { label: "AT", icon: "✅", color: "#059669", desc: "Autorisation de Travail" },
  "PROC": { label: "PROC", icon: "📝", color: "#2563eb", desc: "Procédure d'exécution" },
  "PLAN": { label: "PLAN", icon: "🗺️", color: "#7c3aed", desc: "Plan de situation" },
  "PHOTO": { label: "PHOTO", icon: "📷", color: "#dc2626", desc: "Photos/Images" },
  "STREET": { label: "STREET", icon: "🌍", color: "#ea580c", desc: "Street View" },
  "DOC": { label: "DOC", icon: "📄", color: "#64748b", desc: "Document générique" }
};
const DOC_TYPES = Object.keys(DOC_TYPES_CONFIG);
let ZONES = null;

// -------------------------
// Badges métier (pastilles) — config JSON
// -------------------------
let BADGE_RULES = null;

async function loadBadgeRules() {
  try {
    const res = await fetch("./config/badges-rules.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    BADGE_RULES = await res.json();
    console.log("[BADGES] Règles chargées ✅", BADGE_RULES?.version || "");
  } catch (e) {
    console.warn("[BADGES] Impossible de charger ./config/badges-rules.json — pastilles métier désactivées.", e);
    BADGE_RULES = null;
  }
}

function normalizeBadgeText(str = "") {
  // Normalisation robuste pour matching par mots (réduit fortement les faux positifs)
  // - majuscules + suppression accents
  // - ponctuation -> espaces
  // - espaces multiples -> 1 espace
  // - padding espaces début/fin pour matcher des mots entiers via includes(" MOT ")
  const s = String(str)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${s} `;
}

function buildBTBadgeText(bt) {
  // Détection sur objet + precisionObjet UNIQUEMENT (les autres champs polluent la détection)
  return normalizeBadgeText([
    bt.objet,
    bt.precisionObjet
  ].filter(Boolean).join(" | "));
}

function normalizeBadgeKey(k = "") {
  // même normalisation que le texte BT, pour aligner les comparaisons
  const s = String(k)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return ` ${s} `;
}

function ruleMatches(text, rule) {
  if (!rule) return false;

  const has = (k) => text.includes(normalizeBadgeKey(k));

  const anyOk = !rule.any || rule.any.some(has);
  const allOk = !rule.all || rule.all.every(has);
  // Compat: any2 = groupe "au moins un" supplémentaire
  const any2Ok = !rule.any2 || rule.any2.some(has);

  return anyOk && any2Ok && allOk;
}

function detectBadgesForBT(bt) {
  if (!BADGE_RULES?.badges?.length) return [];

  const text = buildBTBadgeText(bt);
  const badges = [];

  // Tri par priorité (desc)
  const ordered = [...BADGE_RULES.badges].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const badge of ordered) {
    const excludes = badge.exclude || [];
    if (excludes.some(ex => text.includes(normalizeBadgeKey(ex)))) continue;

    const rules = badge.rules || [];
    const matched = rules.some(r => ruleMatches(text, r));
    if (matched) badges.push(badge.id);
  }

  // Appliquer l'ordre d'empilement si défini + maxBadgesPerBT
  const stackOrder = BADGE_RULES?.notes?.ui?.display?.stackOrder || [];
  const max = BADGE_RULES?.notes?.ui?.display?.maxBadgesPerBT || 2;

  const byOrder = (id) => {
    const idx = stackOrder.indexOf(id);
    return idx === -1 ? 9999 : idx;
  };

  const unique = [...new Set(badges)];
  unique.sort((a, b) => byOrder(a) - byOrder(b));
  return unique.slice(0, max);
}

function getBadgeCfg(id) {
  if (!BADGE_RULES?.badges) return null;
  return BADGE_RULES.badges.find(b => b.id === id) || null;
}

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
  const badge = $("zonesBadge");
  if (el) el.textContent = msg;
  
  // Ajouter classe CSS si OK
  if (badge) {
    if (msg === "OK") {
      badge.classList.add("status--ok");
    } else {
      badge.classList.remove("status--ok");
    }
  }
}

function setPdfStatus(msg) {
  const el = $("pdfStatus");
  const badge = $("pdfBadge");
  if (el) {
    // Afficher nom court du fichier
    if (msg.includes(".pdf")) {
      const shortName = msg.length > 30 ? msg.substring(0, 27) + "..." : msg;
      el.textContent = shortName;
    } else {
      el.textContent = msg;
    }
  }
  
  // Ajouter classe CSS si PDF chargé
  if (badge) {
    if (msg !== "Aucun PDF chargé" && msg !== "Erreur PDF" && msg.includes("pdf")) {
      badge.classList.add("status--loaded");
    } else {
      badge.classList.remove("status--loaded");
    }
  }
}

function setProgress(pct, msg) {
  const bar = $("progBar");
  const m = $("progMsg");
  const badge = $("progressBadge");
  
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (m && msg != null) m.textContent = msg;
  
  // Gérer les classes CSS du badge
  if (badge) {
    // Extraction en cours
    if (msg && (msg.includes("Analyse") || msg.includes("Extraction"))) {
      badge.classList.add("status--active");
      badge.classList.remove("status--complete");
    }
    // Terminé
    else if (msg && (msg.includes("Terminé") || msg.includes("BT détectés") || msg.includes("BT chargés"))) {
      badge.classList.add("status--complete");
      badge.classList.remove("status--active");
    }
    // État normal
    else {
      badge.classList.remove("status--active", "status--complete");
    }
  }
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
async function detectDocTypeFromHeader(page, headerText) {
  const up = safeUpper(headerText);
  
  // AT - Autorisation de Travail (patterns multiples)
  if (up.includes("AUTORISATION DE TRAVAIL") || 
      up.includes("AUTORISATION TRAVAIL") ||
      /AT\s*N[°O]?\s*\d+/i.test(up) ||
      /AT\d{3,}/i.test(up) ||
      up.includes("AT N") ||
      up.includes("A.T.") ||
      up.includes("AUTORISATION SPECIFIQUE")) {
    return "AT";
  }
  
  // PROC - Procédure d'exécution
  if (up.includes("PROCEDURE D EXECUTION") ||
      up.includes("PROCEDURE D'EXECUTION") ||
      up.includes("PROCEDURE EXECUTION") ||
      up.includes("PE N") ||
      /PE\s*\d{3,}/i.test(up) ||
      up.includes("ORDONNANCEMENT") ||
      up.includes("MODE OPERATOIRE") ||
      up.includes("CONSIGNES") ||
      up.includes("INSTRUCTIONS TECHNIQUES")) {
    return "PROC";
  }
  
  // PLAN - Plans et schémas
  if (up.includes("PLAN DE SITUATION") ||
      up.includes("PLAN DE RECOLLEMENT") ||
      up.includes("PLAN DE MASSE") ||
      up.includes("PLAN DU SITE") ||
      up.includes("SCHEMA") ||
      up.includes("COUPE") ||
      up.includes("PLAN D IMPLANTATION") ||
      up.includes("PLAN ") || // Plan suivi d'un espace
      up.includes("PLANS") ||
      up.includes("CARTOGRAPHIE")) {
    return "PLAN";
  }
  
  // PHOTO - Détection d'images/photos
  // Vérifier si la page contient beaucoup d'images
  try {
    const ops = await page.getOperatorList();
    const imageCount = ops.fnArray.filter(fn => 
      fn === window.pdfjsLib.OPS.paintImageXObject || 
      fn === window.pdfjsLib.OPS.paintJpegXObject
    ).length;
    
    if (imageCount > 2 || // Plus de 2 images = probablement des photos
        up.includes("PHOTO") ||
        up.includes("PHOTOS") ||
        up.includes("CLICHE") ||
        up.includes("IMAGE") ||
        up.includes("VUE GENERALE") ||
        up.includes("VUE SUR SITE") ||
        up.includes("REPORTAGE PHOTO")) {
      return "PHOTO";
    }
  } catch (e) {
    // Fallback sur texte uniquement si erreur
    if (up.includes("PHOTO") || up.includes("PHOTOS") || up.includes("CLICHE")) {
      return "PHOTO";
    }
  }
  
  // STREET VIEW - Google Street View
  if (up.includes("STREET VIEW") ||
      up.includes("STREET-VIEW") ||
      up.includes("GOOGLE STREET") ||
      up.includes("VUE STREET") ||
      up.includes("LOCALISATION STREET")) {
    return "STREET";
  }
  
  // DOC - Documents génériques
  if (up.includes("DOCUMENT") ||
      up.includes("ANNEXE") ||
      up.includes("PIECE JOINTE") ||
      up.includes("COMPLEMENT")) {
    return "DOC";
  }
  
  // Pas de match spécifique = DOC
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
  const bbANALYSE = getZoneBBox("ANALYSE_DES_RISQUES"); // Analyse des risques
  const bbOBS = getZoneBBox("OBSERVATIONS"); // Observations

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
      const analyseTxt = norm(await extractTextInBBox(page, bbANALYSE)); // Analyse des risques
      const obsTxt = norm(await extractTextInBBox(page, bbOBS)); // Observations

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
        analyseDesRisques: analyseTxt, // Stocker l'analyse des risques
        observations: obsTxt, // Stocker les observations
        docs: [{ page: p, type: "BT" }],
        badges: []
      };

      currentBT.badges = detectBadgesForBT(currentBT);

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
      const type = await detectDocTypeFromHeader(page, header);
      currentBT.docs.push({ page: p, type });
      // Recalculer les pastilles métier si des docs supplémentaires influencent la détection
      currentBT.badges = detectBadgesForBT(currentBT);
    }
  }

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  console.log("[DEMAT-BT] Extraction OK ✅", state.bts.length, "BT");
  
  // Sauvegarder dans localStorage + IndexedDB
  await saveToCache();
  
  renderAll();
}

// -------------------------
// IndexedDB pour stocker le PDF
// -------------------------
const DB_NAME = 'dematbt_db';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function savePDFToIndexedDB(pdfArrayBuffer, filename) {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.put({
        data: pdfArrayBuffer,
        filename: filename,
        timestamp: Date.now()
      }, 'current_pdf');
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log("[IndexedDB] PDF sauvegardé ✅", filename);
    return true;
  } catch (err) {
    console.error("[IndexedDB] Erreur sauvegarde PDF:", err);
    return false;
  }
}

async function loadPDFFromIndexedDB() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const result = await new Promise((resolve, reject) => {
      const request = store.get('current_pdf');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (result && result.data) {
      console.log("[IndexedDB] PDF chargé ✅", result.filename);
      return result;
    }
    return null;
  } catch (err) {
    console.error("[IndexedDB] Erreur chargement PDF:", err);
    return null;
  }
}

async function clearPDFFromIndexedDB() {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const request = store.delete('current_pdf');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    
    console.log("[IndexedDB] PDF supprimé");
    return true;
  } catch (err) {
    console.error("[IndexedDB] Erreur suppression PDF:", err);
    return false;
  }
}

// -------------------------
// Système de cache localStorage
// -------------------------
async function saveToCache() {
  try {
    const cacheData = {
      timestamp: Date.now(),
      pdfName: state.pdfName,
      totalPages: state.totalPages,
      bts: state.bts,
      countsByTechId: Array.from(state.countsByTechId.entries())
    };
    
    // Sauvegarder les métadonnées dans localStorage
    localStorage.setItem('dematbt_cache', JSON.stringify(cacheData));
    console.log("[CACHE] Données sauvegardées ✅", state.bts.length, "BT");
    
    // Sauvegarder le PDF dans IndexedDB si disponible
    if (state.pdfFile) {
      const arrayBuffer = await state.pdfFile.arrayBuffer();
      await savePDFToIndexedDB(arrayBuffer, state.pdfName);
      console.log("[CACHE] PDF sauvegardé dans IndexedDB ✅");
    }
    
    // Afficher un message de confirmation
    const msg = $("progMsg");
    if (msg) {
      const oldText = msg.textContent;
      msg.textContent = "💾 Données + PDF sauvegardés (disponibles après rechargement)";
      setTimeout(() => {
        msg.textContent = oldText;
      }, 3000);
    }
  } catch (err) {
    console.error("[CACHE] Erreur sauvegarde:", err);
  }
}

async function loadFromCache() {
  try {
    const cached = localStorage.getItem('dematbt_cache');
    if (!cached) return false;
    
    const cacheData = JSON.parse(cached);
    
    // Vérifier que les données ne sont pas trop anciennes (24h max)
    const age = Date.now() - cacheData.timestamp;
    const maxAge = 24 * 60 * 60 * 1000; // 24 heures
    
    if (age > maxAge) {
      console.log("[CACHE] Données expirées (>24h), suppression");
      await clearCache();
      return false;
    }
    
    // Restaurer l'état
    state.pdfName = cacheData.pdfName;
    state.totalPages = cacheData.totalPages;
    state.bts = cacheData.bts;
    state.countsByTechId = new Map(cacheData.countsByTechId);
    
    // Charger le PDF depuis IndexedDB
    await ensurePdfJs();
    const pdfData = await loadPDFFromIndexedDB();
    
    if (pdfData && pdfData.data) {
      try {
        const loadingTask = window.pdfjsLib.getDocument({ data: pdfData.data, stopAtErrors: false, disableAutoFetch: true });
        state.pdf = await loadingTask.promise;
        console.log("[CACHE] PDF restauré depuis IndexedDB ✅");
      } catch (err) {
        console.error("[CACHE] Erreur chargement PDF depuis IndexedDB:", err);
        state.pdf = null;
      }
    }
    
    // Mettre à jour l'interface
    setPdfStatus(`📦 ${cacheData.pdfName} (chargé depuis cache)`);
    setProgress(100, `Cache: ${state.bts.length} BT chargés`);
    
    console.log("[CACHE] Données restaurées ✅", state.bts.length, "BT");
    
    // Afficher un message d'info
    const msg = $("progMsg");
    if (msg) {
      const pdfStatus = state.pdf ? "✅ PDF disponible" : "⚠️ PDF non disponible";
      msg.innerHTML = `💾 Cache restauré : ${state.bts.length} BT ${pdfStatus}<br/><small style="font-size:10px;opacity:0.7;">Dernière extraction: ${new Date(cacheData.timestamp).toLocaleString('fr-FR')}</small>`;
    }
    
    renderAll();
    return true;
  } catch (err) {
    console.error("[CACHE] Erreur chargement:", err);
    await clearCache();
    return false;
  }
}

async function clearCache() {
  localStorage.removeItem('dematbt_cache');
  await clearPDFFromIndexedDB();
  console.log("[CACHE] Cache vidé (localStorage + IndexedDB)");
}

function getCacheInfo() {
  try {
    const cached = localStorage.getItem('dematbt_cache');
    if (!cached) return null;
    
    const cacheData = JSON.parse(cached);
    const age = Date.now() - cacheData.timestamp;
    const ageHours = Math.floor(age / (60 * 60 * 1000));
    const ageMinutes = Math.floor((age % (60 * 60 * 1000)) / (60 * 1000));
    
    return {
      pdfName: cacheData.pdfName,
      btCount: cacheData.bts.length,
      timestamp: cacheData.timestamp,
      age: `${ageHours}h ${ageMinutes}min`
    };
  } catch {
    return null;
  }
}

// -------------------------
// UI: chips types (avec icônes et compteurs)
// -------------------------
function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;

  // Compter les documents par type
  const docCounts = new Map();
  for (const bt of state.bts) {
    for (const doc of bt.docs || []) {
      const type = doc.type;
      docCounts.set(type, (docCounts.get(type) || 0) + 1);
    }
  }

  root.innerHTML = "";
  for (const t of DOC_TYPES) {
    const config = DOC_TYPES_CONFIG[t];
    const count = docCounts.get(t) || 0;
    
    // Ne pas afficher les types sans documents (sauf BT qui est toujours présent)
    if (count === 0 && t !== "BT") continue;
    
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.title = config.desc;
    
    // Contenu avec icône et compteur
    btn.innerHTML = `
      <span style="margin-right: 4px;">${config.icon}</span>
      <span style="font-weight: 700;">${config.label}</span>
      <span style="opacity: 0.7; margin-left: 4px; font-size: 10px;">(${count})</span>
    `;
    
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
  [...root.querySelectorAll(".chip")].forEach((chip, idx) => {
    const t = DOC_TYPES.find((type, i) => {
      const config = DOC_TYPES_CONFIG[type];
      return chip.innerHTML.includes(config.label);
    });
    if (t) {
      chip.classList.toggle("chip--active", state.filters.types.has(t));
      
      // Appliquer la couleur du type
      if (state.filters.types.has(t)) {
        const config = DOC_TYPES_CONFIG[t];
        chip.style.backgroundColor = config.color;
        chip.style.borderColor = config.color;
        chip.style.color = "#fff";
      } else {
        chip.style.backgroundColor = "";
        chip.style.borderColor = "";
        chip.style.color = "";
      }
    }
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
    
    // Debug: vérifier les propriétés
    if (cnt === withBt[0] && cnt > 0) {
      console.log("[DEBUG] Premier technicien:", t.name, "PTC:", t.ptc, "PTD:", t.ptd);
    }
    
    // Construire le texte avec badges PTC/PTD
    let displayText = `${t.name} (${cnt} BT)`;
    
    if (t.ptc && t.ptd) {
      displayText += " [PTC+PTD]";
    } else if (t.ptc) {
      displayText += " [PTC]";
    } else if (t.ptd) {
      displayText += " [PTD]";
    }
    
    opt.textContent = displayText;
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
    // Compter les docs par type
    const counts = {};
    for (const d of bt.docs || []) counts[d.type] = (counts[d.type] || 0) + 1;

    // Classification de l'intervention
    const classification = classifyIntervention(bt);

    // Pastilles métier (issues du badges-rules.json)
    const metierIds = Array.isArray(bt.badges) ? bt.badges : [];
    const primaryMetier = metierIds.length ? getBadgeCfg(metierIds[0]) : null;

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
      background: ${(primaryMetier && primaryMetier.color) ? primaryMetier.color : classification.color};
      color: #fff;
      box-shadow: 0 2px 8px ${((primaryMetier && primaryMetier.color) ? primaryMetier.color : classification.color)}40;
    `;
    categoryBadge.textContent = primaryMetier ? `${primaryMetier.icon} ${primaryMetier.label}` : classification.label;
    
    leftSection.appendChild(idDiv);
    leftSection.appendChild(categoryBadge);


    // Pastille métier unique (1 seul badge par BT)
    
    const badgesDiv = document.createElement("div");
    badgesDiv.className = "badges";
    
    // Créer des badges pour chaque type de doc avec icônes
    for (const [type, count] of Object.entries(counts)) {
      const config = DOC_TYPES_CONFIG[type];
      const badge = document.createElement("span");
      badge.className = type === "BT" ? "badge badge--strong" : "badge";
      badge.title = config.desc;
      badge.style.cssText = `
        background: ${type === "BT" ? "var(--bg)" : config.color + "15"};
        color: ${type === "BT" ? "var(--txt)" : config.color};
        border: 1.5px solid ${type === "BT" ? "var(--line-strong)" : config.color};
        font-weight: 700;
        padding: 4px 8px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
      `;
      badge.innerHTML = `
        <span>${config.icon}</span>
        <span>${type}</span>
        <span style="opacity: 0.7;">×${count}</span>
      `;
      badgesDiv.appendChild(badge);
    }
    
    topDiv.appendChild(leftSection);
    topDiv.appendChild(badgesDiv);
    
    // Meta info
    const metaDiv = document.createElement("div");
    metaDiv.className = "btMeta";
    const dureeFormatted = formatDuree(bt.duree);
    
    // Créer la ligne d'équipe avec badges PTC/PTD
    const teamLine = document.createElement("div");
    teamLine.style.display = "flex";
    teamLine.style.alignItems = "center";
    teamLine.style.gap = "6px";
    teamLine.style.flexWrap = "wrap";
    
    const teamIcon = document.createElement("span");
    teamIcon.textContent = "👥 ";
    teamLine.appendChild(teamIcon);
    
    if (bt.team && bt.team.length > 0) {
      bt.team.forEach((m, idx) => {
        const tech = mapTechByNni(m.nni);
        
        // Nom du technicien
        const nameSpan = document.createElement("span");
        if (tech) {
          nameSpan.textContent = tech.name;
        } else {
          // Technicien non trouvé - afficher le NNI en italique avec icône
          nameSpan.style.fontStyle = "italic";
          nameSpan.style.opacity = "0.7";
          nameSpan.textContent = `${m.nni}`;
          nameSpan.title = "Technicien non répertorié dans la base";
        }
        teamLine.appendChild(nameSpan);
        
        // Badge PTC/PTD si applicable
        if (tech && (tech.ptc || tech.ptd)) {
          const badge = document.createElement("span");
          badge.style.cssText = `
            display: inline-block;
            padding: 2px 6px;
            border-radius: 999px;
            font-size: 9px;
            font-weight: 700;
            margin-left: 3px;
          `;
          
          if (tech.ptc && tech.ptd) {
            badge.style.background = "#10b98115";
            badge.style.color = "#10b981";
            badge.style.border = "1px solid #10b981";
            badge.textContent = "PTC+PTD";
          } else if (tech.ptc) {
            badge.style.background = "#3b82f615";
            badge.style.color = "#3b82f6";
            badge.style.border = "1px solid #3b82f6";
            badge.textContent = "PTC";
          } else if (tech.ptd) {
            badge.style.background = "#f59e0b15";
            badge.style.color = "#f59e0b";
            badge.style.border = "1px solid #f59e0b";
            badge.textContent = "PTD";
          }
          
          teamLine.appendChild(badge);
        }
        
        // Ajouter séparateur si pas le dernier
        if (idx < bt.team.length - 1) {
          const sep = document.createElement("span");
          sep.textContent = " • ";
          sep.style.color = "var(--muted)";
          teamLine.appendChild(sep);
        }
      });
    } else {
      const emptySpan = document.createElement("span");
      emptySpan.textContent = "—";
      teamLine.appendChild(emptySpan);
    }
    
    // Construire le reste des métadonnées
    metaDiv.innerHTML = `
      <div>📅 ${bt.datePrevue || "—"}</div>
      ${dureeFormatted ? `<div>⏱️ ${dureeFormatted}</div>` : ""}
      <div>📋 ${bt.objet || "—"}</div>
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;
    
    // Insérer la ligne d'équipe dans metaDiv
    const teamContainer = document.createElement("div");
    teamContainer.appendChild(teamLine);
    metaDiv.appendChild(teamContainer);
    
    // Actions (boutons pour voir les docs)
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "btActions";
    
    // Créer un bouton pour chaque document avec icône
    for (const doc of bt.docs || []) {
      const config = DOC_TYPES_CONFIG[doc.type];
      const btn = document.createElement("button");
      btn.className = "btn btn--secondary";
      btn.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-color: ${config.color};
        color: ${config.color};
      `;
      btn.innerHTML = `
        <span>${config.icon}</span>
        <span style="font-weight: 700;">${doc.type}</span>
        <span style="opacity: 0.7; font-size: 11px;">(p.${doc.page})</span>
      `;
      btn.title = config.desc;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      btn.addEventListener("mouseenter", () => {
        btn.style.background = config.color + "15";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "";
      });
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
    titleDiv.style.flexWrap = "wrap";
    
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
      background: ${(primaryMetier && primaryMetier.color) ? primaryMetier.color : classification.color};
      color: #fff;
      box-shadow: 0 2px 8px ${((primaryMetier && primaryMetier.color) ? primaryMetier.color : classification.color)}40;
    `;
    categoryBadge.textContent = primaryMetier ? `${primaryMetier.icon} ${primaryMetier.label}` : classification.label;
    
    titleDiv.appendChild(idSpan);
    titleDiv.appendChild(categoryBadge);
    
    // Ajouter les badges PTC/PTD si le technicien a une convention
    if (bt.team && bt.team.length > 0) {
      bt.team.forEach(member => {
        const tech = mapTechByNni(member.nni);
        if (tech && (tech.ptc || tech.ptd)) {
          const conventionBadge = document.createElement("div");
          let badgeText = "";
          let badgeColor = "";
          
          if (tech.ptc && tech.ptd) {
            badgeText = "PTC + PTD";
            badgeColor = "#10b981"; // Vert
          } else if (tech.ptc) {
            badgeText = "PTC";
            badgeColor = "#3b82f6"; // Bleu
          } else if (tech.ptd) {
            badgeText = "PTD";
            badgeColor = "#f59e0b"; // Orange
          }
          
          conventionBadge.style.cssText = `
            display: inline-block;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            background: ${badgeColor}15;
            color: ${badgeColor};
            border: 1.5px solid ${badgeColor};
          `;
          conventionBadge.textContent = badgeText;
          conventionBadge.title = tech.ptc && tech.ptd 
            ? "Prise de Travail à Distance + Prise de Travail sur Chantier" 
            : tech.ptc 
              ? "Prise de Travail à Distance"
              : "Prise de Travail sur Chantier";
          
          titleDiv.appendChild(conventionBadge);
        }
      });
    }

    const subDiv = document.createElement("div");
    subDiv.className = "briefSub";
    const dureeFormatted = formatDuree(bt.duree);
    
    // Informations principales en haut
    const mainInfoDiv = document.createElement("div");
    mainInfoDiv.className = "briefSub__main";
    mainInfoDiv.innerHTML = `
      <div>📋 ${bt.objet || "—"}</div>
      <div>📅 ${bt.datePrevue || "—"}</div>
      ${dureeFormatted ? `<div>⏱️ ${dureeFormatted}</div>` : ""}
      <div>👤 ${bt.client || "—"}</div>
      <div>📍 ${bt.localisation || "—"}</div>
      ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
    `;
    
    subDiv.appendChild(mainInfoDiv);
    
    // Analyse des risques et observations en bas côte à côte
    if (bt.analyseDesRisques || bt.observations) {
      const bottomBlocksDiv = document.createElement("div");
      bottomBlocksDiv.className = "briefSub__bottom";
      
      if (bt.analyseDesRisques) {
        const analyseDiv = document.createElement("div");
        analyseDiv.className = "briefSub__block briefSub__block--warning";
        analyseDiv.innerHTML = `
          <div class="briefSub__block-title">⚠️ Analyse des risques</div>
          <div class="briefSub__block-content">${bt.analyseDesRisques}</div>
        `;
        bottomBlocksDiv.appendChild(analyseDiv);
      }
      
      if (bt.observations) {
        const obsDiv = document.createElement("div");
        obsDiv.className = "briefSub__block briefSub__block--info";
        obsDiv.innerHTML = `
          <div class="briefSub__block-title">💬 Observations</div>
          <div class="briefSub__block-content">${bt.observations}</div>
        `;
        bottomBlocksDiv.appendChild(obsDiv);
      }
      
      subDiv.appendChild(bottomBlocksDiv);
    }

    const docsDiv = document.createElement("div");
    docsDiv.className = "briefDocs";

    // Créer un bouton pour chaque document avec icône
    for (const doc of bt.docs || []) {
      const config = DOC_TYPES_CONFIG[doc.type];
      const btn = document.createElement("button");
      btn.className = "docBtn";
      btn.style.cssText = `
        border-color: ${config.color};
        color: ${config.color};
        display: inline-flex;
        align-items: center;
        gap: 6px;
      `;
      btn.innerHTML = `
        <span>${config.icon}</span>
        <span style="font-weight: 700;">${doc.type}</span>
        <span style="opacity: 0.7; font-size: 11px;">(p.${doc.page})</span>
      `;
      btn.title = config.desc;
      btn.addEventListener("click", () => openModal(bt, doc.page));
      btn.addEventListener("mouseenter", () => {
        btn.style.background = config.color + "15";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.background = "";
      });
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


// Export "Journée Technicien" (PDF unique : tous les BT + docs associés pour le technicien sélectionné)
function formatLocalDateYYYYMMDD(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function exportDayPDF() {
  if (!state.pdfFile || !state.pdf || !window.PDFLib) {
    alert("Impossible de générer : PDF ou pdf-lib non chargé.");
    return;
  }

  const techId = state.filters.techId;
  if (!techId) {
    alert("Sélectionne d'abord un technicien (dans le menu).");
    return;
  }

  // Récupérer le technicien (nom lisible)
  const tech = (window.TECHNICIANS || []).find(t => (t.id || t.nni) === techId);
  const techLabel = tech ? tech.name : techId;

  // BT affectés à ce technicien
  const btsForTech = state.bts
    .filter(bt => (bt.team || []).some(m => {
      const t = mapTechByNni(m.nni);
      return techKey(t) === techId;
    }))
    .sort((a, b) => (a.pageStart || 0) - (b.pageStart || 0));

  if (btsForTech.length === 0) {
    alert("Aucun BT trouvé pour ce technicien avec le PDF chargé.");
    return;
  }

  try {
    setProgress(0, `Génération PDF journée (${techLabel})…`);

    // Charger le PDF original
    const arrayBuf = await state.pdfFile.arrayBuffer();
    const srcPdf = await window.PDFLib.PDFDocument.load(arrayBuf);

    // Nouveau PDF
    const outPdf = await window.PDFLib.PDFDocument.create();

    // Pages à copier, dans l'ordre BT -> docs, sans doublons
    const orderedPages = [];
    const seen = new Set();

    for (const bt of btsForTech) {
      const pages = (bt.docs || [])
        .map(d => d.page)
        .filter(Boolean)
        .sort((a, b) => a - b);

      for (const p of pages) {
        if (!seen.has(p)) {
          seen.add(p);
          orderedPages.push(p);
        }
      }
    }

    // Copier pages
    for (let i = 0; i < orderedPages.length; i++) {
      const pageNum = orderedPages[i];
      const [copied] = await outPdf.copyPages(srcPdf, [pageNum - 1]);
      outPdf.addPage(copied);

      if (i % 5 === 0) {
        const pct = Math.round((i / orderedPages.length) * 100);
        setProgress(pct, `Assemblage pages… (${i + 1}/${orderedPages.length})`);
      }
    }

    const pdfBytes = await outPdf.save();
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const safeName = String(techLabel)
      .replace(/[^\w\d\- ]+/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 40);

    const fileName = `JOURNEE_${formatLocalDateYYYYMMDD()}_${safeName || techId}.pdf`;

    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();

    URL.revokeObjectURL(url);

    setProgress(100, `✅ Journée générée : ${btsForTech.length} BT / ${orderedPages.length} pages`);
  } catch (e) {
    console.error("Erreur export journée:", e);
    setProgress(0, "Erreur génération journée (voir console).");
    alert("Erreur lors de la génération du PDF journée.");
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
        const loadingTask = window.pdfjsLib.getDocument({ data: buf, stopAtErrors: false, disableAutoFetch: true });
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

  // Export journée technicien (Brief)
  const btnExportDay = $("btnExportDay");
  if (btnExportDay) btnExportDay.addEventListener("click", exportDayPDF);

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

  // Clear cache
  const btnClearCache = $("btnClearCache");
  if (btnClearCache) {
    btnClearCache.addEventListener("click", async () => {
      const cacheInfo = getCacheInfo();
      if (!cacheInfo) {
        alert("Aucun cache à vider.");
        return;
      }
      
      const confirmMsg = `Vider le cache ?\n\n` +
        `PDF: ${cacheInfo.pdfName}\n` +
        `BT: ${cacheInfo.btCount}\n` +
        `Âge: ${cacheInfo.age}\n\n` +
        `Cette action est irréversible.`;
      
      if (confirm(confirmMsg)) {
        await clearCache();
        
        // Réinitialiser l'état
        state.bts = [];
        state.countsByTechId = new Map();
        state.pdf = null;
        state.pdfFile = null;
        state.pdfName = "";
        state.totalPages = 0;
        
        // Mettre à jour l'interface
        setPdfStatus("Aucun PDF chargé");
        setProgress(0, "Cache vidé.");
        renderAll();
        
        alert("✅ Cache vidé avec succès (données + PDF) !");
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
// Date/Heure et Météo
// -------------------------
function updateDateTime() {
  const now = new Date();
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };
  const dateStr = now.toLocaleDateString('fr-FR', options);
  const el = $("topDatetime");
  if (el) {
    el.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }
}

async function updateWeather() {
  const communes = [
    { name: "Ermont", lat: 48.9897, lon: 2.2578 },
    { name: "La Garenne-Colombes", lat: 48.9064, lon: 2.2428 },
    { name: "Villeneuve-la-Garenne", lat: 48.9369, lon: 2.3253 },
    { name: "Groslay", lat: 49.0128, lon: 2.3464 }
  ];
  
  const el = $("topWeather");
  if (!el) return;
  
  try {
    el.innerHTML = '<span style="opacity:0.6;">Chargement météo...</span>';
    
    // API OpenWeatherMap gratuite (pas de clé nécessaire pour wttr.in)
    const weatherPromises = communes.map(async (commune) => {
      try {
        // Utilisation de l'API wttr.in qui ne nécessite pas de clé
        const response = await fetch(`https://wttr.in/${commune.name.replace(/\s+/g, '_')}?format=j1&lang=fr`);
        const data = await response.json();
        
        const current = data.current_condition[0];
        const temp = current.temp_C;
        const desc = current.lang_fr[0].value;
        const icon = getWeatherIcon(current.weatherCode);
        
        return { name: commune.name, temp, desc, icon };
      } catch (err) {
        console.error(`Erreur météo pour ${commune.name}:`, err);
        return { name: commune.name, temp: "—", desc: "—", icon: "🌡️" };
      }
    });
    
    const results = await Promise.all(weatherPromises);
    
    // Affichage compact avec température moyenne et icône dominante
    const avgTemp = Math.round(
      results.reduce((sum, r) => sum + (parseFloat(r.temp) || 0), 0) / results.length
    );
    
    const weatherHTML = results
      .map(r => `<span style="white-space:nowrap;">${r.icon} ${r.name.split('-')[0]}: ${r.temp}°C</span>`)
      .join('<span style="margin:0 8px; opacity:0.3;">|</span>');
    
    el.innerHTML = weatherHTML;
    
  } catch (err) {
    console.error("Erreur météo globale:", err);
    el.innerHTML = '<span style="opacity:0.6;">Météo indisponible</span>';
  }
}

function getWeatherIcon(code) {
  // Codes météo wttr.in
  const weatherIcons = {
    113: "☀️", // Clear/Sunny
    116: "⛅", // Partly cloudy
    119: "☁️", // Cloudy
    122: "☁️", // Overcast
    143: "🌫️", // Mist
    176: "🌦️", // Patchy rain possible
    179: "🌨️", // Patchy snow possible
    182: "🌧️", // Patchy sleet possible
    185: "🌧️", // Patchy freezing drizzle possible
    200: "⛈️", // Thundery outbreaks possible
    227: "🌨️", // Blowing snow
    230: "❄️", // Blizzard
    248: "🌫️", // Fog
    260: "🌫️", // Freezing fog
    263: "🌦️", // Patchy light drizzle
    266: "🌧️", // Light drizzle
    281: "🌧️", // Freezing drizzle
    284: "🌧️", // Heavy freezing drizzle
    293: "🌦️", // Patchy light rain
    296: "🌧️", // Light rain
    299: "🌧️", // Moderate rain at times
    302: "🌧️", // Moderate rain
    305: "🌧️", // Heavy rain at times
    308: "🌧️", // Heavy rain
    311: "🌧️", // Light freezing rain
    314: "🌧️", // Moderate or heavy freezing rain
    317: "🌨️", // Light sleet
    320: "🌨️", // Moderate or heavy sleet
    323: "🌨️", // Patchy light snow
    326: "🌨️", // Light snow
    329: "🌨️", // Patchy moderate snow
    332: "❄️", // Moderate snow
    335: "❄️", // Patchy heavy snow
    338: "❄️", // Heavy snow
    350: "🌧️", // Ice pellets
    353: "🌦️", // Light rain shower
    356: "🌧️", // Moderate or heavy rain shower
    359: "🌧️", // Torrential rain shower
    362: "🌨️", // Light sleet showers
    365: "🌨️", // Moderate or heavy sleet showers
    368: "🌨️", // Light snow showers
    371: "❄️", // Moderate or heavy snow showers
    374: "🌧️", // Light showers of ice pellets
    377: "🌧️", // Moderate or heavy showers of ice pellets
    386: "⛈️", // Patchy light rain with thunder
    389: "⛈️", // Moderate or heavy rain with thunder
    392: "⛈️", // Patchy light snow with thunder
    395: "⛈️"  // Moderate or heavy snow with thunder
  };
  return weatherIcons[code] || "🌡️";
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

    // Charger les règles de pastilles métier
    await loadBadgeRules();

    // Mise à jour date/heure
    updateDateTime();
    setInterval(updateDateTime, 1000); // MAJ chaque seconde
    
    // Mise à jour météo
    updateWeather();
    setInterval(updateWeather, 600000); // MAJ toutes les 10 minutes

    // Tenter de charger le cache
    const cacheLoaded = await loadFromCache();
    
    if (cacheLoaded) {
      console.log("[INIT] Données chargées depuis le cache ✅");
      // Activer le bouton Extract si le PDF est chargé
      if (state.pdf) {
        setExtractEnabled(true);
      }
    } else {
      console.log("[INIT] Aucun cache disponible");
    }

    // vue par défaut
    setView("referent");
  } catch (e) {
    console.error(e);
    setZonesStatus("Erreur");
    setProgress(0, "Erreur init (voir console).");
  }
}

document.addEventListener("DOMContentLoaded", init);
