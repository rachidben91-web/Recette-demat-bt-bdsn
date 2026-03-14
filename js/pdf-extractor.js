/* js/pdf-extractor.js — DEMAT-BT v11.1.1 — 16/02/2026
   Extraction PDF : détection intelligente des BT et de leurs pièces jointes
   
   CORRECTIFS v11.1.1 :
   - FIX CRITIQUE : stripAccents() pour fiabiliser les comparaisons texte
     ("PROCÉDURE" → "PROCEDURE", "ÉCHELLE" → "ECHELLE", etc.)
   - Détection PROC, AT, PLAN, PHOTO, STREET par full-page text scan
   - Seuil PHOTO relevé à 150 chars pour tolérer watermarks/overlays
   - Logs console détaillés pour debug
*/

let ZONES = null;

// 1. Chargement des zones de coordonnées depuis le JSON
async function loadZones() {
  setZonesStatus("Chargement…");
  const res = await fetch(`./zones.json?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("zones.json introuvable (404).");
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

// 2. Initialisation de PDF.js
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

// ═══════════════════════════════════════════════════════════
// UTILITAIRE : Suppression des accents pour comparaison fiable
// "Procédure d'Exécution" → "PROCEDURE D'EXECUTION"
// ═══════════════════════════════════════════════════════════
function stripAccents(str) {
  return (str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Combine uppercase + strip accents pour comparaison insensible
function cleanUpper(str) {
  return stripAccents((str || "").toUpperCase());
}

// 3. Extraction de texte dans une zone précise (Bounding Box)
async function extractTextInBBox(page, bbox) {
  if (!bbox) return "";
  const tc = await page.getTextContent();
  const items = tc.items || [];
  const { x0, y0, x1, y1 } = bbox;

  const picked = [];
  for (const it of items) {
    const t = it.transform;
    if (!t) continue;
    const x = t[4], y = t[5];
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      const str = (it.str || "").trim();
      if (str) picked.push({ str, x, y });
    }
  }
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return norm(picked.map(p => p.str).join(" "));
}

// 4. Extraction du texte COMPLET d'une page (pour classification)
async function extractFullPageText(page) {
  const tc = await page.getTextContent();
  const items = tc.items || [];
  const picked = [];
  for (const it of items) {
    const str = (it.str || "").trim();
    if (str) {
      const t = it.transform;
      picked.push({ str, x: t ? t[4] : 0, y: t ? t[5] : 0 });
    }
  }
  picked.sort((a, b) => (b.y - a.y) || (a.x - b.x));
  return picked.map(p => p.str).join(" ");
}

// 5. Comptage des objets images dans une page PDF
async function countPageImages(page) {
  try {
    const ops = await page.getOperatorList();
    return ops.fnArray.filter(fn =>
      fn === window.pdfjsLib.OPS.paintImageXObject ||
      fn === window.pdfjsLib.OPS.paintJpegXObject
    ).length;
  } catch (e) {
    console.warn("[DEMAT-BT] Erreur comptage images:", e);
    return 0;
  }
}

// 6. Détection intelligente du type de document — V11.1.1
async function detectDocType(page) {
  const rawText = await extractFullPageText(page);
  // CRUCIAL : cleanUpper supprime les accents AVANT comparaison
  const up = cleanUpper(rawText);
  const textLen = rawText.replace(/\s+/g, "").length;

  console.log(`[DEMAT-BT] Classification — ${textLen} chars`);
  console.log(`[DEMAT-BT]   Extrait: "${up.substring(0, 300)}"`);

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 1 : PROC — Procédure d'Exécution
  // Après stripAccents : "PROCEDURE D'EXECUTION" (sans accents)
  // ═══════════════════════════════════════════════════════════
  if (up.includes("PROCEDURE D'EXECUTION") || up.includes("PROCEDURE D EXECUTION") ||
      up.includes("PROCEDURE D'EXECUTION") ||
      /PROCEDURE\s+D.?EXECUTION/.test(up) ||
      (up.includes("LISTE DES INTERVENTIONS") && up.includes("OPERATION") && up.includes("ACTEURS"))) {
    console.log("  → PROC ✅");
    return "PROC";
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 2 : FOR-113 — Fiche de préparation et de suivi
  // ═══════════════════════════════════════════════════════════
  if (up.includes("FOR-113") || up.includes("FOR 113") ||
      up.includes("PREPARATION ET DE SUIVI")) {
    console.log("  → FOR113 ✅");
    return "FOR113";
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 3 : AT — Fiche AT / Autorisation de Travail
  // Critères : "FICHE AT" exact, ou "N° D'AT" avec numéro
  // EXCLURE les pages BT (qui contiennent "AT N°" en pied de page)
  // ═══════════════════════════════════════════════════════════
  if (up.includes("FICHE AT") ||
      (up.includes("N° D'AT") || up.includes("NO D'AT") || up.includes("N D'AT")) ||
      (up.includes("AUTORISATION DE TRAVAIL") && !up.includes("BON DE TRAVAIL") && up.includes("DELIVRANCE"))) {
    console.log("  → AT ✅");
    return "AT";
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 4 : STREET VIEW — Google Maps / Street View
  // ═══════════════════════════════════════════════════════════
  if (up.includes("GOOGLE STREET VIEW") || up.includes("STREET VIEW") ||
      (up.includes("GOOGLE MAPS") && !up.includes("BON DE TRAVAIL"))) {
    console.log("  → STREET ✅");
    return "STREET";
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 5 : PLAN — Cartographie GRDF
  // Critères : "Format: A3" + "Paysage", ou "Echelle:" + "GRDF",
  //            ou "Lambert" + "Commune", ou "Code INSEE"
  // ═══════════════════════════════════════════════════════════
  if ((up.includes("FORMAT") && up.includes("PAYSAGE") && (up.includes("A3") || up.includes("A2") || up.includes("A1"))) ||
      (up.includes("ECHELLE") && up.includes("GRDF")) ||
      (up.includes("LAMBERT") && up.includes("COMMUNE")) ||
      (up.includes("CODE INSEE") && (up.includes("GRDF") || up.includes("COMMUNE"))) ||
      up.includes("RECOLLEMENT") ||
      up.includes("CARTOGRAPHIE")) {
    console.log("  → PLAN ✅");
    return "PLAN";
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 6 : PHOTO — Page quasi-exclusivement image
  // Seuil : < 150 caractères de texte ET au moins 1 image lourde
  // (Les vrais photos terrain ont très peu de texte overlay)
  // ═══════════════════════════════════════════════════════════
  if (textLen < 150) {
    const imageCount = await countPageImages(page);
    if (imageCount > 0) {
      console.log(`  → PHOTO ✅ (${textLen} chars, ${imageCount} images)`);
      return "PHOTO";
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIORITE 7 : Détection secondaire élargie
  // ═══════════════════════════════════════════════════════════

  // PLAN secondaire
  if ((up.includes("PLAN DE SITUATION") || up.includes("SCHEMA DE PRINCIPE")) &&
      !up.includes("BON DE TRAVAIL") && !up.includes("PLANS MINUTES")) {
    console.log("  → PLAN ✅ (secondaire)");
    return "PLAN";
  }

  // PROC secondaire — mode opératoire
  if ((up.includes("MODE OPERATOIRE") || up.includes("CONSIGNE OPERATOIRE")) &&
      !up.includes("BON DE TRAVAIL") && !up.includes("METHODE / ORDONNANCEMENT") &&
      !up.includes("METHODE/ORDONNANCEMENT")) {
    console.log("  → PROC ✅ (secondaire)");
    return "PROC";
  }

  // ═══════════════════════════════════════════════════════════
  // DEFAUT : DOC générique
  // ═══════════════════════════════════════════════════════════
  console.log(`  → DOC (défaut, ${textLen} chars, aucune signature trouvée)`);
  return "DOC";
}

// --- FONCTIONS LEGACY (conservées pour compatibilité) ---
async function extractHeaderArea(page) {
  const headerBBox = { x0: 0, y0: 700, x1: 600, y1: 842 };
  return await extractTextInBBox(page, headerBBox);
}

async function detectDocTypeFromHeader(page, headerText) {
  // Redirige vers la nouvelle fonction complète
  return await detectDocType(page);
}

// Utilitaires de détection de numéros
function isBTNumber(text) { return /BT\d{8,14}/i.test(text || ""); }
function pickBTId(text) { return ((text || "").match(/BT\d{8,14}/i) || [""])[0].toUpperCase(); }
function pickATId(text) { return ((text || "").match(/AT\d{3,}/i) || [""])[0].toUpperCase(); }

function parseTeamFromRealisation(text) {
  const t = safeUpper(text);
  const re = /([A-Z]\d{5})\s+([A-ZÀ-Ÿ][A-ZÀ-Ÿ' -]{2,60})/g;
  const out = [];
  let m;
  while ((m = re.exec(t)) !== null) {
    const nni = m[1], name = norm(m[2]);
    if (!out.some(x => x.nni === nni)) out.push({ nni, name });
  }
  return out;
}

function normalizeMergeText(value) {
  return stripAccents(String(value || ""))
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCloseText(a, b) {
  const na = normalizeMergeText(a);
  const nb = normalizeMergeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 8 || nb.length < 8) return false;
  return na.includes(nb) || nb.includes(na);
}

function shouldMergeBT(a, b) {
  if (!a || !b) return false;
  if ((a.id || "") !== (b.id || "")) return false;

  const dateA = normalizeMergeText(a.datePrevue);
  const dateB = normalizeMergeText(b.datePrevue);
  if (dateA && dateB && dateA !== dateB) return false;

  const sameObjet = isCloseText(a.objet, b.objet);
  const sameLoc = isCloseText(a.localisation, b.localisation);
  if (sameObjet || sameLoc) return true;

  const atA = normalizeMergeText(a.atNum);
  const atB = normalizeMergeText(b.atNum);
  if (atA && atB && atA === atB && dateA && dateB && dateA === dateB) return true;

  // Fallback prudent : même id + même date + aucune info objet/localisation exploitable
  if (dateA && dateB && dateA === dateB) {
    const hasObjLocA = normalizeMergeText(a.objet) || normalizeMergeText(a.localisation);
    const hasObjLocB = normalizeMergeText(b.objet) || normalizeMergeText(b.localisation);
    if (!hasObjLocA || !hasObjLocB) return true;
  }

  return false;
}

function pickBestText(a, b) {
  const av = String(a || "").trim();
  const bv = String(b || "").trim();
  if (!av) return bv;
  if (!bv) return av;
  return bv.length > av.length ? bv : av;
}

function mergeTeamLists(baseTeam, extraTeam) {
  const merged = [];
  const seen = new Set();
  for (const m of [...(baseTeam || []), ...(extraTeam || [])]) {
    const nni = String(m?.nni || "").trim().toUpperCase();
    const name = norm(m?.name || "");
    const key = nni || normalizeMergeText(name) || "__EMPTY__";
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({ nni, name });
  }
  return merged;
}

function mergeDocs(baseDocs, extraDocs) {
  const out = [];
  const seen = new Set();
  for (const d of [...(baseDocs || []), ...(extraDocs || [])]) {
    const page = Number(d?.page);
    const type = String(d?.type || "DOC");
    if (!Number.isFinite(page)) continue;
    const key = `${page}|${type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ page, type });
  }
  out.sort((a, b) => a.page - b.page || a.type.localeCompare(b.type));
  return out;
}

function mergeTwoBT(base, incoming) {
  base.pageStart = Math.min(Number(base.pageStart || Infinity), Number(incoming.pageStart || Infinity));
  base.objet = pickBestText(base.objet, incoming.objet);
  base.datePrevue = pickBestText(base.datePrevue, incoming.datePrevue);
  base.client = pickBestText(base.client, incoming.client);
  base.localisation = pickBestText(base.localisation, incoming.localisation);
  base.atNum = pickBestText(base.atNum, incoming.atNum);
  base.designation = pickBestText(base.designation, incoming.designation);
  base.duree = pickBestText(base.duree, incoming.duree);
  base.analyseDesRisques = pickBestText(base.analyseDesRisques, incoming.analyseDesRisques);
  base.observations = pickBestText(base.observations, incoming.observations);
  base.teamOriginal = mergeTeamLists(base.teamOriginal || base.team, incoming.teamOriginal || incoming.team);
  base.teamCurrent = mergeTeamLists(base.teamCurrent || base.team, incoming.teamCurrent || incoming.team);
  base.team = mergeTeamLists(base.teamCurrent, []);
  base.hasManualAssignmentChange = Boolean(base.hasManualAssignmentChange || incoming.hasManualAssignmentChange);
  base.assignmentChangeReason = pickBestText(base.assignmentChangeReason, incoming.assignmentChangeReason);
  base.docs = mergeDocs(base.docs, incoming.docs);
  if (typeof detectBadgesForBT === "function") {
    base.badges = detectBadgesForBT(base);
  }
  return base;
}

function mergeDuplicateBTs(btList) {
  const source = Array.isArray(btList) ? btList : [];
  const byId = new Map();

  for (const bt of source) {
    const id = String(bt?.id || "").trim().toUpperCase();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(bt);
  }

  const mergedAll = [];
  for (const [, items] of byId.entries()) {
    const sorted = [...items].sort((a, b) => Number(a.pageStart || 0) - Number(b.pageStart || 0));
    const acc = [];

    for (const bt of sorted) {
      let target = null;
      for (const existing of acc) {
        if (shouldMergeBT(existing, bt)) {
          target = existing;
          break;
        }
      }
      if (!target) {
        acc.push({
          ...bt,
          teamOriginal: mergeTeamLists(bt.teamOriginal || bt.team, []),
          teamCurrent: mergeTeamLists(bt.teamCurrent || bt.team, []),
          team: mergeTeamLists(bt.teamCurrent || bt.team, []),
          docs: mergeDocs(bt.docs, []),
          badges: Array.isArray(bt.badges) ? [...bt.badges] : [],
          hasManualAssignmentChange: Boolean(bt.hasManualAssignmentChange),
          assignmentChangeReason: bt.assignmentChangeReason || ""
        });
      } else {
        mergeTwoBT(target, bt);
      }
    }

    mergedAll.push(...acc);
  }

  mergedAll.sort((a, b) => Number(a.pageStart || 0) - Number(b.pageStart || 0));
  return mergedAll;
}

function rebuildTechCountsFromBts() {
  state.countsByTechId = new Map();
  for (const bt of state.bts || []) {
    for (const m of bt.team || []) {
      const tech = mapTechByNni(m.nni);
      if (!tech) continue;
      const key = techKey(tech);
      state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
    }
  }
}

// 7. Boucle principale d'extraction
async function extractAll() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) throw new Error("Zones non chargées.");

  const bb = (label) => getZoneBBox(label);

  state.bts = [];
  state.countsByTechId = new Map();
  let currentBT = null;

  for (let p = 1; p <= state.totalPages; p++) {
    setProgress((p - 1) / state.totalPages * 100, `Analyse page ${p}/${state.totalPages}...`);
    const page = await state.pdf.getPage(p);

    // Tentative de détection d'un nouveau BT via sa bbox précise
    const btNumTxt = norm(await extractTextInBBox(page, bb("BT_NUM")));

    if (isBTNumber(btNumTxt)) {
      const id = pickBTId(btNumTxt);
      const team = parseTeamFromRealisation(norm(await extractTextInBBox(page, bb("REALISATION"))));

      currentBT = {
        id,
        pageStart: p,
        objet: norm(await extractTextInBBox(page, bb("OBJET"))),
        datePrevue: norm(await extractTextInBBox(page, bb("DATE_PREVUE"))),
        client: norm(await extractTextInBBox(page, bb("CLIENT_NOM"))),
        localisation: norm(await extractTextInBBox(page, bb("LOCALISATION"))),
        atNum: pickATId(norm(await extractTextInBBox(page, bb("AT_NUM")))),
        team,
        designation: norm(await extractTextInBBox(page, bb("DESIGNATION"))),
        duree: norm(await extractTextInBBox(page, bb("DUREE"))),
        analyseDesRisques: norm(await extractTextInBBox(page, bb("ANALYSE_DES_RISQUES"))),
        observations: norm(await extractTextInBBox(page, bb("OBSERVATIONS"))),
        docs: [{ page: p, type: "BT" }],
        badges: [],
        teamOriginal: mergeTeamLists(team, []),
        teamCurrent: mergeTeamLists(team, []),
        hasManualAssignmentChange: false,
        assignmentChangeReason: ""
      };

      currentBT.team = mergeTeamLists(currentBT.teamCurrent, []);

      currentBT.badges = detectBadgesForBT(currentBT);
      state.bts.push(currentBT);
    }
    // Pièce jointe du BT précédent
    else if (currentBT) {
      console.log(`[DEMAT-BT] Page ${p} : pièce jointe de ${currentBT.id}`);
      const type = await detectDocType(page);
      currentBT.docs.push({ page: p, type });
      currentBT.badges = detectBadgesForBT(currentBT);
    }
  }

  state.bts = mergeDuplicateBTs(state.bts);
  rebuildTechCountsFromBts();

  setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  await saveToCache();
  renderAll();
}

// ============================================================
// Export API (Recette patch) — DEMAT-BT v11.1.2 — 2026-02-19
// Objectif : compatibilité avec main.js (window.PdfExtractor.*)
// ============================================================

// Fallbacks si les helpers UI n'existent pas (évite les ReferenceError)
if (typeof window.setZonesStatus !== "function") window.setZonesStatus = () => {};
if (typeof window.setPdfStatus   !== "function") window.setPdfStatus   = () => {};
if (typeof window.setProgress    !== "function") window.setProgress    = () => {};
if (typeof window.setExtractEnabled !== "function") window.setExtractEnabled = () => {};

// Exposer quelques fonctions utiles en debug
window.loadZones = loadZones;
window.ensurePdfJs = ensurePdfJs;

// API attendue par main.js
async function processFile(file) {
  if (!file) return;
  try {
    window.setExtractEnabled(false);
    window.setPdfStatus(file.name);
    window.setProgress(0, "Chargement PDF…");

    await ensurePdfJs();

    state.pdfFile = file;
    state.pdfName = file.name;
    const importedDayFr = extractDayFromFilename(file.name);
    const importedDayIso = importedDayFr
      ? importedDayFr.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, "$3-$2-$1")
      : "";
    state.journee = {
      ...state.journee,
      jour: importedDayIso || state.journee?.jour || "",
      source: {
        pdfName: file.name,
        importedAt: new Date().toISOString(),
      },
    };

    const buf = await file.arrayBuffer();
    const loadingTask = window.pdfjsLib.getDocument({ data: buf });
    state.pdf = await loadingTask.promise;
    state.totalPages = state.pdf.numPages;

    console.log("[DEMAT-BT] PDF chargé ✅", state.totalPages, "pages");
    window.setProgress(0, `PDF chargé (${state.totalPages} pages).`);
    window.setExtractEnabled(true);
    if (typeof window.updatePreparationControls === "function") {
      window.updatePreparationControls();
    }
  } catch (e) {
    console.error(e);
    window.setPdfStatus("Erreur PDF");
    window.setProgress(0, "Erreur chargement PDF (voir console).");
    window.setExtractEnabled(false);
    state.pdf = null;
    state.totalPages = 0;
    if (typeof window.updatePreparationControls === "function") {
      window.updatePreparationControls();
    }
    throw e;
  }
}

async function runExtraction() {
  if (!state.pdf) throw new Error("PDF non chargé.");
  if (!ZONES) await loadZones();
  try {
    const jour = (window.BriefJournee && typeof window.BriefJournee.getJourneeDate === "function")
      ? window.BriefJournee.getJourneeDate()
      : (state?.journee?.jour || "");
    const site = state?.journee?.site || window.BriefStore?.SITE || "VLG";
    const preservedById = new Map();

    function rememberBts(list) {
      for (const bt of (Array.isArray(list) ? list : [])) {
        const id = String(bt?.id || "").trim().toUpperCase();
        if (!id) continue;
        preservedById.set(id, { ...bt });
      }
    }

    if (window.__SUPPORT_AUTH_CONNECTED === true && window.BriefStore && jour) {
      try {
        const remoteRecord = await window.BriefStore.loadJournee({ jour, site });
        const remoteBts = Array.isArray(remoteRecord?.payload?.bts)
          ? remoteRecord.payload.bts.map((bt) =>
              (window.BriefJournee && typeof window.BriefJournee.hydrateBt === "function")
                ? window.BriefJournee.hydrateBt(bt)
                : bt
            ).filter(Boolean)
          : [];
        rememberBts(remoteBts);
      } catch (err) {
        console.warn("[DEMAT-BT] Impossible de charger la journée distante avant fusion:", err);
      }
    }

    if (state?.journee?.jour === jour) {
      rememberBts(state.bts);
    }

    const preservedBts = [...preservedById.values()];
    window.setExtractEnabled(false);
    window.setProgress(0, "Extraction en cours…");
    await extractAll();
    if (window.BriefJournee && typeof window.BriefJournee.mergeAssignmentsFromExisting === "function") {
      state.bts = window.BriefJournee.mergeAssignmentsFromExisting(state.bts, preservedBts);
      if (typeof rebuildTechCountsFromBts === "function") rebuildTechCountsFromBts();
      if (typeof saveToCache === "function") await saveToCache();
    }
    if (typeof window.saveCurrentBriefJournee === "function") {
      await window.saveCurrentBriefJournee({ silent: true, source: "extraction" });
    }
    window.setProgress(100, `Terminé : ${state.bts.length} BT détectés.`);
  } finally {
    window.setExtractEnabled(!!state.pdf);
    if (typeof window.updatePreparationControls === "function") {
      window.updatePreparationControls();
    }
  }
}

window.PdfExtractor = {
  processFile,
  runExtraction
};

window.mergeDuplicateBTs = mergeDuplicateBTs;
