/* js/ui/sidebar.js — DEMAT-BT v11.7.0 — 14/03/2026
   Sidebar : liste techniciens, filtres par type de document, recherche et KPIs
*/

// -------------------------
// Chips type de document (Filtres dynamiques pour toutes les pièces jointes)
// -------------------------
function buildTypeChips() {
  const root = $("typeChips");
  if (!root) return;

  // Calcul dynamique des compteurs pour chaque type de document extrait
  const docCounts = new Map();
  for (const bt of state.bts) {
    for (const doc of bt.docs || []) {
      docCounts.set(doc.type, (docCounts.get(doc.type) || 0) + 1);
    }
  }

  root.innerHTML = "";
  // On parcourt tous les types configurés (BT, AT, PLAN, PHOTO, STREET, FOR113, etc.)
  for (const t of DOC_TYPES) {
    const config = DOC_TYPES_CONFIG[t];
    const count = docCounts.get(t) || 0;
    
    // On n'affiche le filtre que si des documents de ce type existent (sauf pour le BT)
    if (count === 0 && t !== "BT") continue;

    const chip = document.createElement("button");
    chip.className = "chip" + (state.filters.types.has(t) ? " chip--active" : "");
    chip.innerHTML = `${config.icon} ${t} <span class="chip__count">${count}</span>`;
    
    chip.addEventListener("click", () => {
      if (state.filters.types.has(t)) {
        state.filters.types.delete(t);
      } else {
        state.filters.types.add(t);
      }
      buildTypeChips();
      renderAll();
    });
    root.appendChild(chip);
  }
}

// -------------------------
// Liste techniciens (Menu déroulant synchronisé)
// -------------------------
function renderTechList() {
  const sel = $("techSelect");
  if (!sel) return;

  const techs = window.TECHNICIANS || [];
  const currentVal = sel.value || state.filters.techId || "";

  sel.innerHTML = `<option value="">— Tous les techniciens —</option>`;

  // Tri par volume d'activité (BT détectés) puis par nom
  const sorted = [...techs].sort((a, b) => {
    const ca = state.countsByTechId.get(techKey(a)) || 0;
    const cb = state.countsByTechId.get(techKey(b)) || 0;
    if (cb !== ca) return cb - ca;
    return (a.name || "").localeCompare(b.name || "");
  });

  for (const tech of sorted) {
    const key = techKey(tech);
    const count = state.countsByTechId.get(key) || 0;
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = count > 0 ? `${tech.name} (${count} BT)` : tech.name;
    if (key === currentVal) opt.selected = true;
    sel.appendChild(opt);
  }
}

// -------------------------
// KPIs (Compteurs globaux)
// -------------------------
function renderKpis(filtered) {
  const kpis = $("kpis");
  if (!kpis) return;

  const totalBT = filtered.length;
  const totalPages = filtered.reduce((acc, bt) => acc + (bt.docs?.length || 0), 0);

  kpis.innerHTML = `
    <div class="kpi"><b>${totalBT}</b> BT</div>
    <div class="kpi"><b>${totalPages}</b> Pages</div>
  `;
}

// -------------------------
// Moteur de filtrage (Logique métier)
// -------------------------
function filterBTs() {
  return state.bts.filter(bt => {
    // Filtre 1 : Recherche textuelle
    if (state.filters.q) {
      const q = state.filters.q.toLowerCase();
      const text = [bt.id, bt.objet, bt.client, bt.localisation, bt.atNum].filter(Boolean).join(" ").toLowerCase();
      if (!text.includes(q)) return false;
    }

    // Filtre 2 : Types de documents (Multi-sélection)
    if (state.filters.types.size > 0) {
      const btDocTypes = (bt.docs || []).map(d => d.type);
      const match = [...state.filters.types].some(t => btDocTypes.includes(t));
      if (!match) return false;
    }

    // Filtre 3 : Technicien spécifique
    if (state.filters.techId) {
      const assignedTeam = (window.BriefJournee && typeof window.BriefJournee.getAssignedTeam === "function")
        ? window.BriefJournee.getAssignedTeam(bt)
        : (bt.team || []);
      const isPresent = assignedTeam.some(m => techKey(mapTechByNni(m.nni)) === state.filters.techId);
      if (!isPresent) return false;
    }

    return true;
  });
}
