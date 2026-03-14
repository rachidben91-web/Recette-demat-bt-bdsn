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

async function savePDFToIndexedDB(pdfArrayBuffer, filename) {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const req = store.put({ data: pdfArrayBuffer, filename, timestamp: Date.now() }, 'current_pdf');
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
    console.log("[CACHE] PDF sauvegardé dans IndexedDB ✅");
  } catch (err) {
    console.error("[CACHE] Erreur sauvegarde PDF:", err);
  }
}

async function loadPDFFromIndexedDB() {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const req = store.get('current_pdf');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[CACHE] Erreur lecture PDF:", err);
    return null;
  }
}

async function clearPDFFromIndexedDB() {
  try {
    const db = await openDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
      const req = store.delete('current_pdf');
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[CACHE] Erreur suppression PDF:", err);
  }
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
