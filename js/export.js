/* js/export.js — DEMAT-BT v11.1.0 — 16/02/2026
   Génération des exports PDF (Unitaire ou Journée complète)
   
   CORRECTIFS v11.1.0 :
   - Respect des dimensions ORIGINALES de chaque page PDF (A3, A4, paysage, portrait)
   - Les plans A3 paysage sont exportés en A3 paysage (plus écrasés en A4 portrait)
   - Les photos portrait restent en portrait avec leur ratio d'aspect
   - Qualité d'image adaptative : scale 2.0 pour les pages normales, 1.5 pour les très grandes
   - Header/tatouage ajusté selon l'orientation de la page
*/

// Chargeur automatique de la librairie jsPDF si elle est manquante
async function ensureJsPDF() {
  if (window.jspdf) return window.jspdf;

  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Impossible de charger la librairie jsPDF."));
    document.head.appendChild(script);
  });

  return window.jspdf;
}

/**
 * Récupère les dimensions et l'orientation d'une page du PDF source.
 * Retourne { widthPt, heightPt, widthMm, heightMm, orientation, format }
 */
async function getPageDimensions(pageNum) {
  const page = await state.pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 }); // échelle 1:1 = points PDF natifs

  const widthPt = viewport.width;
  const heightPt = viewport.height;

  // Conversion points → mm (1 point = 0.3528 mm)
  const widthMm = widthPt * 0.3528;
  const heightMm = heightPt * 0.3528;

  const orientation = widthMm > heightMm ? "l" : "p"; // "l" = landscape, "p" = portrait

  // Détection du format standard le plus proche
  let format = [widthMm, heightMm];
  const isA4 = (Math.abs(widthMm - 210) < 5 && Math.abs(heightMm - 297) < 5) ||
               (Math.abs(widthMm - 297) < 5 && Math.abs(heightMm - 210) < 5);
  const isA3 = (Math.abs(widthMm - 297) < 5 && Math.abs(heightMm - 420) < 5) ||
               (Math.abs(widthMm - 420) < 5 && Math.abs(heightMm - 297) < 5);

  if (isA4) format = "a4";
  else if (isA3) format = "a3";
  // sinon format = dimensions exactes en mm [w, h]

  return { widthPt, heightPt, widthMm, heightMm, orientation, format };
}

/**
 * Convertit une page du PDF source en image Data URL.
 * Adapte le scale selon la taille de la page pour un bon compromis qualité/poids.
 */
async function renderPageToDataURL(pageNum) {
  const page = await state.pdf.getPage(pageNum);
  const baseViewport = page.getViewport({ scale: 1.0 });

  // Scale adaptatif : 2.0 pour A4, 1.5 pour A3+, 1.0 pour très grand
  const maxDim = Math.max(baseViewport.width, baseViewport.height);
  let scale = 2.0;
  if (maxDim > 1200) scale = 1.5;  // Pages A3
  if (maxDim > 1800) scale = 1.0;  // Pages très grandes

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport }).promise;

  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * EXPORT UNITAIRE
 */
async function exportBTPDF(btArg) {
  const bt = (btArg && btArg.id) ? btArg : state.modal.currentBT;

  if (!bt) {
    alert("Aucun BT sélectionné pour l'export.");
    return;
  }
  if (!state.pdf) return;

  try {
    const docName = `BT_${bt.id}.pdf`;
    setProgress(0, `Génération ${docName}...`);

    const jspdfLib = await ensureJsPDF();

    // Récupérer les dimensions de la PREMIÈRE page pour initialiser le PDF
    const sortedDocs = [...bt.docs].sort((a, b) => a.page - b.page);
    const firstDims = await getPageDimensions(sortedDocs[0].page);

    const pdf = new jspdfLib.jsPDF({
      orientation: firstDims.orientation,
      unit: "mm",
      format: firstDims.format
    });

    await addBTToPDF(pdf, bt, true);

    pdf.save(docName);
    setProgress(100, `Export OK : ${docName}`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
  } catch (e) {
    console.error("Erreur export BT:", e);
    setProgress(0, "Erreur export.");
    alert("Erreur lors de la génération du PDF : " + e.message);
  }
}

/**
 * EXPORT JOURNÉE
 */
async function exportDayPDF() {
  const btList = (typeof filterBTs === 'function') ? filterBTs() : state.bts;

  if (!btList || btList.length === 0) {
    alert("Aucun BT à exporter dans la vue actuelle.");
    return false;
  }
  if (!state.pdf) {
    alert("Aucun PDF source chargé.");
    return false;
  }

  if (!confirm(`Confirmez-vous l'export de ${btList.length} BT et de leurs pièces jointes ?`)) {
    return false;
  }

  try {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const docName = `Export_Journee_${dateStr}.pdf`;

    const jspdfLib = await ensureJsPDF();

    // Initialiser avec les dimensions de la première page du premier BT
    const firstBT = btList.find(bt => bt.docs && bt.docs.length > 0);
    const firstDims = firstBT ? await getPageDimensions(firstBT.docs[0].page) : { orientation: "p", format: "a4" };

    const pdf = new jspdfLib.jsPDF({
      orientation: firstDims.orientation,
      unit: "mm",
      format: firstDims.format
    });

    let isFirstPageOfFile = true;

    for (let i = 0; i < btList.length; i++) {
      const bt = btList[i];
      const pct = Math.round((i / btList.length) * 100);
      setProgress(pct, `Fusion BT ${bt.id} (${i + 1}/${btList.length})...`);

      if (bt.docs && bt.docs.length > 0) {
        await addBTToPDF(pdf, bt, isFirstPageOfFile);
        isFirstPageOfFile = false;
      }
    }

    setProgress(100, "Finalisation du fichier...");
    pdf.save(docName);

    setProgress(100, `Terminé : ${btList.length} BT exportés.`);
    setTimeout(() => setProgress(0, "Prêt"), 3000);
    return true;
  } catch (e) {
    console.error("Erreur export Journée:", e);
    setProgress(0, "Erreur export global.");
    alert("Erreur lors de l'export groupé : " + e.message);
    return false;
  }
}

let TECH_EMAILS_CACHE = null;

function normalizeForMatch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-']/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function loadTechnicianEmailsVlg() {
  if (Array.isArray(TECH_EMAILS_CACHE)) return TECH_EMAILS_CACHE;

  const res = await fetch("./data/agents-mails-techniciens-vlg.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Impossible de charger la source emails (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Format invalide pour la source emails techniciens.");
  }

  TECH_EMAILS_CACHE = data;
  return TECH_EMAILS_CACHE;
}

function findTechnicianEmail(tech, emailRows) {
  if (!tech || !Array.isArray(emailRows)) return null;

  const techNni = String(tech.nni || tech.id || "").trim().toUpperCase();
  if (techNni) {
    const byNni = emailRows.find(row => {
      const nniSimple = String(row?.nni_simplifie || "").trim().toUpperCase();
      const nniFull = String(row?.nni || "").trim().toUpperCase().replace(/[A-Z]+$/, "");
      return nniSimple === techNni || nniFull === techNni;
    });
    if (byNni && byNni.mail) return byNni.mail;
  }

  const techLast = normalizeForMatch(tech.lastName);
  const techFirst = normalizeForMatch(tech.firstName);
  if (techLast && techFirst) {
    const byName = emailRows.find(row => {
      const rowLast = normalizeForMatch(row?.nom);
      const rowFirst = normalizeForMatch(row?.prenom);
      return rowLast === techLast && rowFirst === techFirst;
    });
    if (byName && byName.mail) return byName.mail;
  }

  const techFull = normalizeForMatch(tech.name);
  if (techFull) {
    const byFullName = emailRows.find(row => normalizeForMatch(row?.search_salarie || row?.salarie) === techFull);
    if (byFullName && byFullName.mail) return byFullName.mail;
  }

  return null;
}

function getDisplayedBriefDate() {
  const topDatetime = document.getElementById("topDatetime");
  const displayed = String(topDatetime?.textContent || "");
  if (displayed.includes("—")) {
    return displayed.split("—")[0].trim();
  }
  return new Date().toLocaleDateString("fr-FR");
}

function buildMailtoUrl({ to, subject, body }) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function exportDayPdfAndPrepareMail() {
  const techId = state?.filters?.techId || "";
  if (!techId) {
    alert("Sélectionnez un technicien dans le filtre avant de générer le PDF et préparer le mail.");
    return;
  }

  const techs = window.TECHNICIANS || [];
  const tech = techs.find(t => techKey(t) === techId);
  if (!tech) {
    alert("Technicien sélectionné introuvable.");
    return;
  }

  let emailRows;
  try {
    emailRows = await loadTechnicianEmailsVlg();
  } catch (err) {
    console.error("Erreur chargement emails techniciens:", err);
    alert("Impossible de charger la liste des emails techniciens (RECETTE).");
    return;
  }

  const technicianEmail = findTechnicianEmail(tech, emailRows);
  if (!technicianEmail) {
    alert("Aucun email trouvé pour ce technicien dans data/agents-mails-techniciens-vlg.json.");
    return;
  }

  const pdfGenerated = await exportDayPDF();
  if (!pdfGenerated) return;

  const displayedDate = getDisplayedBriefDate();
  const techDisplayName = `${tech.lastName || ""} ${tech.firstName || ""}`.trim() || tech.name || techId;
  const subject = `BT du ${displayedDate} - ${techDisplayName}`;
  const body = `Bonjour,\n\nVeuillez trouver ci-joint votre BT du jour.\n\nCordialement.`;
  const mailtoUrl = buildMailtoUrl({
    to: technicianEmail,
    subject,
    body
  });

  window.location.href = mailtoUrl;
}

/**
 * Fonction interne : Ajoute toutes les pages d'un BT dans l'instance jsPDF.
 * V11.1.0 : Chaque page est ajoutée avec ses dimensions ORIGINALES.
 */
async function addBTToPDF(pdfDoc, bt, isFirstDocOfPdf) {
  const sortedDocs = [...bt.docs].sort((a, b) => a.page - b.page);

  for (let i = 0; i < sortedDocs.length; i++) {
    const doc = sortedDocs[i];

    // Récupérer les dimensions originales de cette page
    const dims = await getPageDimensions(doc.page);

    // Ajouter une nouvelle page avec les bonnes dimensions
    // (sauf si c'est la toute première page du fichier entier)
    if (!isFirstDocOfPdf || i > 0) {
      pdfDoc.addPage(dims.format, dims.orientation);
    } else if (isFirstDocOfPdf && i === 0) {
      // Première page : vérifier si le format initial correspond
      // Si non, on utilise deletePage + addPage pour corriger
      const currentW = pdfDoc.internal.pageSize.getWidth();
      const currentH = pdfDoc.internal.pageSize.getHeight();
      const needW = dims.orientation === "l" ? Math.max(dims.widthMm, dims.heightMm) : Math.min(dims.widthMm, dims.heightMm);
      const needH = dims.orientation === "l" ? Math.min(dims.widthMm, dims.heightMm) : Math.max(dims.widthMm, dims.heightMm);

      if (Math.abs(currentW - needW) > 5 || Math.abs(currentH - needH) > 5) {
        // Le format initial ne correspond pas, on reconfigure
        // jsPDF ne permet pas de changer la première page facilement,
        // mais on peut la redimensionner via les propriétés internes
        pdfDoc.internal.pageSize.setWidth(needW);
        pdfDoc.internal.pageSize.setHeight(needH);
      }
    }

    // 1. Capture de la page PDF originale en image haute qualité
    const imgData = await renderPageToDataURL(doc.page);

    // 2. Insertion image — RESPECT des dimensions originales
    const pageWidth = pdfDoc.internal.pageSize.getWidth();
    const pageHeight = pdfDoc.internal.pageSize.getHeight();
    pdfDoc.addImage(imgData, "JPEG", 0, 0, pageWidth, pageHeight);

    // 3. Ajout du tatouage discret (adapté à l'orientation)
    addPageHeader(pdfDoc, bt, doc, pageWidth);
  }
}

/**
 * Ajoute un petit en-tête texte sur la page PDF générée.
 * V11.1.0 : Adapte la position au format de la page.
 */
function addPageHeader(pdfDoc, bt, doc, pageWidth) {
  const config = (typeof DOC_TYPES_CONFIG !== 'undefined')
    ? (DOC_TYPES_CONFIG[doc.type] || DOC_TYPES_CONFIG.DOC)
    : { label: doc.type, color: "#000" };

  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(80); // Gris

  // En haut à gauche : ID du BT
  pdfDoc.text(`${bt.id}`, 10, 6);

  // En haut à droite : Type de pièce — position adaptée à la largeur de page
  const rightMargin = (pageWidth || 210) - 10;
  pdfDoc.setTextColor(0);
  pdfDoc.setFont("helvetica", "bold");
  pdfDoc.text(`${config.label}`, rightMargin, 6, { align: "right" });
  pdfDoc.setFont("helvetica", "normal"); // Reset
}
