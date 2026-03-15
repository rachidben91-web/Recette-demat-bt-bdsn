/* js/cache.js — DEMAT-BT v11.0.0 — 15/02/2026
   Gestion du cache : localStorage (métadonnées) + IndexedDB (PDF binaire)
*/

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

async function savePDFToIndexedDB(pdfArrayBuffer, filename, storageKey = 'current_pdf') {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const req = store.put({ data: pdfArrayBuffer, filename, timestamp: Date.now() }, storageKey);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
    console.log("[CACHE] PDF sauvegardé dans IndexedDB ✅");
  } catch (err) {
    console.error("[CACHE] Erreur sauvegarde PDF:", err);
  }
}

async function loadPDFFromIndexedDB(storageKey = 'current_pdf') {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.get(storageKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[CACHE] Erreur lecture PDF:", err);
    return null;
  }
}

async function clearPDFFromIndexedDB(storageKey = null) {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const req = storageKey ? store.delete(storageKey) : store.clear();
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[CACHE] Erreur suppression PDF:", err);
  }
}

async function ensurePdfDocumentFromBuffer(data) {
  await ensurePdfJs();
  const loadingTask = window.pdfjsLib.getDocument({ data, stopAtErrors: false });
  return loadingTask.promise;
}

async function loadPdfDocumentByStorageKey(storageKey = 'current_pdf') {
  if (storageKey === 'current_pdf' && state.pdf) {
    return state.pdf;
  }

  if (!(state.pdfSourceCache instanceof Map)) {
    state.pdfSourceCache = new Map();
  }

  if (state.pdfSourceCache.has(storageKey)) {
    return state.pdfSourceCache.get(storageKey);
  }

  const pdfData = await loadPDFFromIndexedDB(storageKey);
  if (!pdfData?.data) return null;

  const pdfDoc = await ensurePdfDocumentFromBuffer(pdfData.data);
  state.pdfSourceCache.set(storageKey, pdfDoc);
  return pdfDoc;
}

async function getPdfDocumentForBt(bt) {
  const sourceKey = String(bt?.sourcePdf?.storageKey || '').trim();
  if (!sourceKey) return state.pdf || null;
  return loadPdfDocumentByStorageKey(sourceKey);
}

// -------------------------
// Sauvegarde état complet
// -------------------------
async function saveToCache() {
  try {
    const cacheData = {
      version: APP_VERSION,
      timestamp: Date.now(),
      pdfName: state.pdfName,
      journee: state.journee || null,
      bts: state.bts.map(bt => ({
        ...bt,
        team: bt.team || [],
        docs: bt.docs || [],
        badges: bt.badges || []
      }))
    };
    const json = JSON.stringify(cacheData);
    const sizeMB = (new Blob([json])).size / (1024 * 1024);
    if (sizeMB > 4) {
      console.warn(`[CACHE] ⚠️ Taille cache élevée: ${sizeMB.toFixed(1)} Mo — risque de dépassement localStorage`);
    }
    localStorage.setItem('dematbt_cache', json);

    // Sauvegarder le PDF dans IndexedDB si disponible
    if (state.pdfFile) {
      const buf = await state.pdfFile.arrayBuffer();
      await savePDFToIndexedDB(buf, state.pdfName);
    }

    console.log("[CACHE] État sauvegardé ✅", cacheData.bts.length, "BT");
  } catch (err) {
    console.error("[CACHE] Erreur sauvegarde:", err);
    if (err && err.name === "QuotaExceededError") {
      alert("⚠️ Cache trop volumineux. Les données seront rechargées au prochain lancement.");
    }
  }
}

// -------------------------
// Chargement depuis cache
// -------------------------
async function loadFromCache() {
  try {
    const cached = localStorage.getItem('dematbt_cache');
    if (!cached) return false;

    const cacheData = JSON.parse(cached);
    if (!cacheData.bts || !cacheData.bts.length) return false;

    // Restaurer les BT (+ fusion prudente des doublons multi-pages si la fonction est disponible)
    state.bts = (typeof window.mergeDuplicateBTs === "function")
      ? window.mergeDuplicateBTs(cacheData.bts)
      : cacheData.bts;
    state.pdfName = cacheData.pdfName || "";
    state.journee = cacheData.journee || state.journee;
    state.countsByTechId = new Map();

    for (const bt of state.bts) {
      for (const m of bt.team || []) {
        const tech = mapTechByNni(m.nni);
        if (!tech) continue;
        const key = techKey(tech);
        state.countsByTechId.set(key, (state.countsByTechId.get(key) || 0) + 1);
      }
    }

    // Tenter de recharger le PDF depuis IndexedDB
    const pdfData = await loadPDFFromIndexedDB();
    let pdfStatus = "⚠️ PDF non disponible";

    if (pdfData && pdfData.data) {
      try {
        await ensurePdfJs();
        const loadingTask = window.pdfjsLib.getDocument({ data: pdfData.data, stopAtErrors: false });
        state.pdf = await loadingTask.promise;
        state.totalPages = state.pdf.numPages;
        pdfStatus = "✅ PDF disponible";
      } catch (e) {
        console.warn("[CACHE] PDF IndexedDB invalide:", e);
      }
    }

    // Mettre à jour l'UI
    if (state.pdfName) setPdfStatus(state.pdfName);
    setProgress(0, `💾 Cache restauré : ${state.bts.length} BT ${pdfStatus}`);

    console.log("[CACHE] Restauré ✅", state.bts.length, "BT");
    return true;
  } catch (err) {
    console.error("[CACHE] Erreur chargement:", err);
    await clearCache();
    return false;
  }
}

async function clearCache() {
  localStorage.removeItem('dematbt_cache');
  state.pdfSourceCache = new Map();
  await clearPDFFromIndexedDB();
  console.log("[CACHE] Cache vidé (localStorage + IndexedDB)");
}

function resetInMemoryAppState() {
  state.pdf = null;
  state.pdfFile = null;
  state.pdfName = "";
  state.totalPages = 0;
  state.pdfSourceCache = new Map();
  state.bts = [];
  state.view = "referent";
  state.layout = "grid";
  state.referentDisplayMode = "large";
  state.filters = {
    q: "",
    types: new Set(),
    techId: "",
    o2Status: "all"
  };
  state.countsByTechId = new Map();
  state.techDailyStatusByNni = new Map();
  state.techDailyStatusJour = "";
  state.journee = {
    jour: "",
    site: "VLG",
    status: "draft",
    source: {
      pdfName: "",
      importedAt: null
    },
    remote: {
      id: null,
      updatedAt: null,
      updatedBy: null,
      loadedAt: null
    }
  };
  state.modal = {
    open: false,
    currentBT: null,
    currentPage: 1
  };
}

async function purgeLocalSessionData() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i) || "";
    if (key.startsWith("demat_") || key.startsWith("dematbt_")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  await clearCache();
  resetInMemoryAppState();
  console.log("[CACHE] Données locales de session purgées ✅");
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

window.loadPdfDocumentByStorageKey = loadPdfDocumentByStorageKey;
window.getPdfDocumentForBt = getPdfDocumentForBt;
window.savePDFToIndexedDB = savePDFToIndexedDB;
window.purgeLocalSessionData = purgeLocalSessionData;
