/* js/ui/components.js — DEMAT-BT v11.0.0 — 15/02/2026
   Composants UI partagés entre les vues (grid, timeline, brief)
   → Élimine la duplication de code entre les 3 rendus
*/
/* ===============================
   PDF Day Premium Display
   =============================== */

.pdf-day-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pdf-day-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.6px;
  color: #64748b; /* gris élégant */
}

.pdf-day-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #eef2ff, #e0e7ff);
  color: #1e3a8a;
  padding: 6px 10px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 2px 6px rgba(30, 58, 138, 0.08);
  transition: all 0.2s ease;
}

.pdf-day-badge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(30, 58, 138, 0.12);
}

.pdf-day-icon {
  font-size: 14px;
}

// -------------------------
// Badge de catégorie (pastille métier ou classification)
// -------------------------
function createCategoryBadge(bt, size = "sm") {
  const classification = classifyIntervention(bt);
  const metierIds = Array.isArray(bt.badges) ? bt.badges : [];
  const primaryMetier = metierIds.length ? getBadgeCfg(metierIds[0]) : null;

  const color = primaryMetier?.color || classification.color;
  const label = primaryMetier ? `${primaryMetier.icon} ${primaryMetier.label}` : classification.label;

  const el = document.createElement("div");
  el.className = `category-badge category-badge--${size}`;
  el.style.background = color;
  el.style.color = "#fff";
  el.style.boxShadow = `0 2px 8px ${color}40`;
  el.textContent = label;
  return el;
}

// -------------------------
// Ligne d'équipe avec badges PTC/PTD
// -------------------------
function createTeamLine(bt) {
  const line = document.createElement("div");
  line.className = "team-line";

  const icon = document.createElement("span");
  icon.textContent = "👥 ";
  line.appendChild(icon);

  if (!bt.team || bt.team.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "—";
    line.appendChild(empty);
    return line;
  }

  bt.team.forEach((m, idx) => {
    const tech = mapTechByNni(m.nni);

    // Nom
    const nameSpan = document.createElement("span");
    if (tech) {
      nameSpan.textContent = tech.name;
    } else {
      nameSpan.className = "team-line__unknown";
      nameSpan.textContent = m.nni;
      nameSpan.title = "Technicien non répertorié dans la base";
    }
    line.appendChild(nameSpan);

    // Badge PTC/PTD
    if (tech && (tech.ptc || tech.ptd)) {
      line.appendChild(createPtcPtdBadge(tech));
    }

    // Séparateur
    if (idx < bt.team.length - 1) {
      const sep = document.createElement("span");
      sep.className = "team-line__sep";
      sep.textContent = " • ";
      line.appendChild(sep);
    }
  });

  return line;
}

// -------------------------
// Badge PTC / PTD
// -------------------------
function createPtcPtdBadge(tech) {
  if (!tech || (!tech.ptc && !tech.ptd)) return document.createDocumentFragment();

  let text, colorClass;
  if (tech.ptc && tech.ptd) {
    text = "PTC+PTD"; colorClass = "ptc-ptd--both";
  } else if (tech.ptc) {
    text = "PTC"; colorClass = "ptc-ptd--ptc";
  } else {
    text = "PTD"; colorClass = "ptc-ptd--ptd";
  }

  const badge = document.createElement("span");
  badge.className = `ptc-ptd-badge ${colorClass}`;
  badge.textContent = text;
  badge.title = tech.ptc && tech.ptd
    ? "Prise de Travail à Distance + sur Chantier"
    : tech.ptc ? "Prise de Travail à Distance" : "Prise de Travail sur Chantier";
  return badge;
}

// -------------------------
// Boutons documents (AT, PROC, PLAN, PHOTO, etc.)
// -------------------------
function createDocButtons(bt, opts = {}) {
  const container = document.createElement("div");
  container.className = opts.className || "btActions";

  for (const doc of bt.docs || []) {
    const config = DOC_TYPES_CONFIG[doc.type];
    const btn = document.createElement("button");
    btn.className = `doc-btn doc-btn--${doc.type.toLowerCase()}`;
    btn.innerHTML = `
      <span>${config.icon}</span>
      <span class="doc-btn__label">${doc.type}</span>
      <span class="doc-btn__page">(p.${doc.page})</span>
    `;
    btn.title = config.desc;
    btn.addEventListener("click", () => openModal(bt, doc.page));
    container.appendChild(btn);
  }
  return container;
}

// -------------------------
// Métadonnées BT (date, durée, objet, client, adresse, AT)
// -------------------------
function createBTMeta(bt) {
  const div = document.createElement("div");
  div.className = "bt-meta";
  const duree = formatDuree(bt.duree);
  div.innerHTML = `
    <div>📅 ${bt.datePrevue || "—"}</div>
    ${duree ? `<div>⏱️ ${duree}</div>` : ""}
    <div>📋 ${bt.objet || "—"}</div>
    <div>👤 ${bt.client || "—"}</div>
    <div>📍 ${bt.localisation || "—"}</div>
    ${bt.atNum ? `<div>🧾 ${bt.atNum}</div>` : ""}
  `;
  return div;
}

// -------------------------
// Badges documents (comptage par type)
// -------------------------
function createDocBadges(bt) {
  const counts = {};
  for (const d of bt.docs || []) counts[d.type] = (counts[d.type] || 0) + 1;

  const container = document.createElement("div");
  container.className = "doc-badges";

  for (const [type, count] of Object.entries(counts)) {
    const config = DOC_TYPES_CONFIG[type];
    const badge = document.createElement("span");
    badge.className = `doc-badge ${type === "BT" ? "doc-badge--strong" : ""}`;
    badge.style.setProperty("--doc-color", config.color);
    badge.title = config.desc;
    badge.innerHTML = `<span>${config.icon}</span> ${type} <span class="doc-badge__count">×${count}</span>`;
    container.appendChild(badge);
  }
  return container;
}

// -------------------------
// Blocs analyse des risques + observations (vue brief)
// -------------------------
function createInfoBlocks(bt) {
  if (!bt.analyseDesRisques && !bt.observations) return null;

  const container = document.createElement("div");
  container.className = "briefSub__bottom";

  if (bt.analyseDesRisques) {
    const div = document.createElement("div");
    div.className = "briefSub__block briefSub__block--warning";
    div.innerHTML = `
      <div class="briefSub__block-title">⚠️ Analyse des risques</div>
      <div class="briefSub__block-content">${bt.analyseDesRisques}</div>
    `;
    container.appendChild(div);
  }

  if (bt.observations) {
    const div = document.createElement("div");
    div.className = "briefSub__block briefSub__block--info";
    div.innerHTML = `
      <div class="briefSub__block-title">💬 Observations</div>
      <div class="briefSub__block-content">${bt.observations}</div>
    `;
    container.appendChild(div);
  }

  return container;
}
