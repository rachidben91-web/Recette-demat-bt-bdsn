/* js/ui/modal.js — DEMAT-BT v11.0.0 — 16/02/2026
   Modal viewer : affichage page PDF, navigation et styles dynamiques
*/

// Ouvre la modal avec le BT et la page demandée
function openModal(bt, pageNum) {
  state.modal.open = true;
  state.modal.currentBT = bt;
  state.modal.currentPage = pageNum;

  const modal = $("modal");
  if (modal) {
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("modal--active"); // Assure la visibilité CSS
  }

  renderPage(pageNum);
  updateModalUI();
}

// Ferme la modal
function closeModal() {
  state.modal.open = false;
  state.modal.currentBT = null;

  const modal = $("modal");
  if (modal) {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("modal--active");
  }
}

// Met à jour les titres, boutons et infos selon le document affiché
function updateModalUI() {
  const bt = state.modal.currentBT;
  if (!bt) return;

  const currentPage = state.modal.currentPage;
  // On récupère tous les numéros de pages associés à ce BT, triés
  const sortedPages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  
  // Navigation
  const btnPrev = $("btnPrevPage");
  const btnNext = $("btnNextPage");
  const currentIndex = sortedPages.indexOf(currentPage);
  
  if (btnPrev) btnPrev.disabled = currentIndex <= 0;
  if (btnNext) btnNext.disabled = currentIndex >= sortedPages.length - 1;

  // Infos du document courant (Type, Couleur, Icone)
  const currentDoc = bt.docs.find(d => d.page === currentPage);
  // Fallback sur DOC si type inconnu
  const config = currentDoc ? (DOC_TYPES_CONFIG[currentDoc.type] || DOC_TYPES_CONFIG.DOC) : DOC_TYPES_CONFIG.DOC;

  // Mise à jour du Titre avec le style (Couleur/Icône)
  const title = $("modalTitle");
  if (title) {
    // Utilisation de innerHTML pour colorer le type de doc
    title.innerHTML = `
      <span style="opacity:0.6">${bt.id}</span>
      <span style="margin:0 8px; opacity:0.3">/</span>
      <span style="color:${config.color}; font-weight:700;">
        ${config.icon} ${config.label}
      </span>
    `;
  }

  // Sous-titre (Objet du BT)
  const subtitle = $("modalSubtitle");
  if (subtitle) subtitle.textContent = bt.objet || "";

  // Info pagination en bas
  const info = $("modalInfo");
  if (info) {
    info.textContent = `Page ${currentIndex + 1} sur ${sortedPages.length} — ${config.desc}`;
  }
}

// Page précédente
function prevPage() {
  const bt = state.modal.currentBT;
  if (!bt) return;
  
  const sortedPages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const idx = sortedPages.indexOf(state.modal.currentPage);
  
  if (idx > 0) {
    state.modal.currentPage = sortedPages[idx - 1];
    renderPage(state.modal.currentPage);
    updateModalUI();
  }
}

// Page suivante
function nextPage() {
  const bt = state.modal.currentBT;
  if (!bt) return;
  
  const sortedPages = bt.docs.map(d => d.page).sort((a, b) => a - b);
  const idx = sortedPages.indexOf(state.modal.currentPage);
  
  if (idx < sortedPages.length - 1) {
    state.modal.currentPage = sortedPages[idx + 1];
    renderPage(state.modal.currentPage);
    updateModalUI();
  }
}

// Rendu PDF via Canvas
async function renderPage(pageNum) {
  const bt = state.modal.currentBT;
  if (!bt) return;
  try {
    const pdfDoc = (typeof window.getPdfDocumentForBt === "function")
      ? await window.getPdfDocumentForBt(bt)
      : state.pdf;
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    // Scale 1.5 est souvent suffisant et plus performant que 2, mais tu peux garder 2
    const viewport = page.getViewport({ scale: 2 });
    const canvas = $("canvas"); // Vérifie si l'ID est bien "canvas" ou "pdfCanvas" dans ton HTML
    if (!canvas) return;

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");

    await page.render({ canvasContext: ctx, viewport }).promise;
  } catch (e) {
    console.error("[MODAL] Erreur rendu page", pageNum, e);
  }
}

// Export PDF (Nécessite export.js chargé)
async function exportBTPDF() {
  const bt = state.modal.currentBT;
  if (!bt) return;
  if (typeof window.generateSingleBTPDF === "function") {
    await window.generateSingleBTPDF(bt);
  } else {
    alert("Fonction d'export non chargée.");
  }
}
