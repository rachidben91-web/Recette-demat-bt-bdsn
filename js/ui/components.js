/* js/ui/components.js — DEMAT-BT v11.7.0 — 14/03/2026
   Composants UI partagés entre les vues (grid, timeline, brief)
   → Élimine la duplication de code entre les 3 rendus
*/
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
function createTeamLine(bt, opts = {}) {
  const showIcon = opts.showIcon !== false;
  const compact = opts.compact === true;
  const maxVisible = Number.isFinite(opts.maxVisible) ? opts.maxVisible : 4;
  const team = (window.BriefJournee && typeof window.BriefJournee.getAssignedTeam === "function")
    ? window.BriefJournee.getAssignedTeam(bt)
    : (Array.isArray(bt?.team) ? bt.team : []);

  const line = document.createElement("div");
  line.className = "team-line";
  if (compact) line.classList.add("team-line--compact");

  if (showIcon) {
    const icon = document.createElement("span");
    icon.textContent = "👥 ";
    line.appendChild(icon);
  }

  if (!team || team.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "—";
    line.appendChild(empty);
    return line;
  }

  const fullTeamNames = team.map((m) => mapTechByNni(m.nni)?.name || m.name || m.nni || "—");
  line.title = fullTeamNames.join(" / ");

  const visibleTeam = maxVisible > 0 ? team.slice(0, maxVisible) : team;

  visibleTeam.forEach((m, idx) => {
    const tech = mapTechByNni(m.nni);
    const dailyStatus = typeof window.getTechDailyStatus === "function"
      ? window.getTechDailyStatus(m.nni)
      : null;

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

    if (dailyStatus?.status === "loaded") {
      const statusBadge = document.createElement("span");
      statusBadge.className = "tech-day-status tech-day-status--loaded";
      statusBadge.textContent = "Journée chargée";
      statusBadge.title = dailyStatus.loaded_at
        ? `Journée chargée le ${new Date(dailyStatus.loaded_at).toLocaleString("fr-FR")}`
        : "Journée chargée";
      line.appendChild(statusBadge);
    }

    // Badge PTC/PTD
    if (tech && (tech.ptc || tech.ptd)) {
      line.appendChild(createPtcPtdBadge(tech));
    }

    // Séparateur
    if (idx < visibleTeam.length - 1) {
      const sep = document.createElement("span");
      sep.className = "team-line__sep";
      sep.textContent = " • ";
      line.appendChild(sep);
    }
  });

  const hiddenCount = Math.max(0, team.length - visibleTeam.length);
  if (hiddenCount > 0) {
    if (visibleTeam.length > 0) {
      const sep = document.createElement("span");
      sep.className = "team-line__sep";
      sep.textContent = " • ";
      line.appendChild(sep);
    }

    const more = document.createElement("span");
    more.className = "team-line__more";
    more.textContent = `+${hiddenCount}`;
    more.title = line.title;
    line.appendChild(more);
  }

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

  const docs = opts.compact ? (bt.docs || []).slice(0, 3) : (bt.docs || []);
  for (const doc of docs) {
    const config = DOC_TYPES_CONFIG[doc.type];
    const btn = document.createElement("button");
    btn.className = `doc-btn doc-btn--${doc.type.toLowerCase()}${opts.compact ? " doc-btn--compact" : ""}`;
    const iconSpan = document.createElement("span");
    iconSpan.textContent = config.icon;
    const labelSpan = document.createElement("span");
    labelSpan.className = "doc-btn__label";
    labelSpan.textContent = doc.type;
    const pageSpan = document.createElement("span");
    pageSpan.className = "doc-btn__page";
    pageSpan.textContent = `(p.${doc.page})`;
    btn.append(iconSpan, labelSpan, pageSpan);
    btn.title = config.desc;
    btn.addEventListener("click", () => openModal(bt, doc.page));
    container.appendChild(btn);
  }
  return container;
}

// -------------------------
// Métadonnées BT (date, durée, objet, client, adresse, AT)
// -------------------------
function createBTMeta(bt, opts = {}) {
  const div = document.createElement("div");
  div.className = `bt-meta${opts.compact ? " bt-meta--compact" : ""}`;
  const duree = formatDuree(bt.duree);

  const appendLine = (text) => {
    const line = document.createElement("div");
    line.textContent = text || "—";
    div.appendChild(line);
  };

  if (opts.compact) {
    appendLine(`📅 ${bt.datePrevue || "—"}${duree ? ` · ⏱️ ${duree}` : ""}`);
    appendLine(`📋 ${bt.objet || "—"}`);
    appendLine(`👤 ${bt.client || "—"}`);
    return div;
  }

  appendLine(`📅 ${bt.datePrevue || "—"}`);
  if (duree) appendLine(`⏱️ ${duree}`);
  appendLine(`📋 ${bt.objet || "—"}`);
  appendLine(`👤 ${bt.client || "—"}`);
  appendLine(`📍 ${bt.localisation || "—"}`);
  if (bt.atNum) appendLine(`🧾 ${bt.atNum}`);
  return div;
}

function createAssignmentBadge(bt, opts = {}) {
  if (!bt?.hasManualAssignmentChange) return document.createDocumentFragment();
  const badge = document.createElement("span");
  const status = String(bt?.o2SyncStatus || "pending").toLowerCase();
  badge.className = `assignment-badge assignment-badge--${status === "done" ? "done" : "pending"}${opts.compact ? " assignment-badge--compact" : ""}`;
  badge.textContent = opts.label || (status === "done" ? "Modifié dans O2" : "A reporter dans O2");
  return badge;
}

function createAssignmentSummary(bt, opts = {}) {
  if (!bt?.hasManualAssignmentChange || !window.BriefJournee) return null;

  const original = window.BriefJournee.getOriginalTeam(bt);
  const current = window.BriefJournee.getAssignedTeam(bt);
  const formatTeam = (team) => {
    if (!team.length) return "—";
    return team.map((member) => mapTechByNni(member.nni)?.name || member.name || member.nni || "—").join(" / ");
  };

  const wrap = document.createElement("div");
  const status = String(bt?.o2SyncStatus || "pending").toLowerCase();
  wrap.className = `assignment-summary assignment-summary--${status === "done" ? "done" : "pending"}${opts.compact ? " assignment-summary--compact" : ""}`;

  const title = document.createElement("div");
  title.className = "assignment-summary__title";
  title.textContent = status === "done" ? "Modification faite dans O2" : "Affectation modifiée";

  const initial = document.createElement("div");
  initial.className = "assignment-summary__line";
  initial.textContent = `Initial : ${formatTeam(original)}`;

  const currentLine = document.createElement("div");
  currentLine.className = "assignment-summary__line";
  currentLine.textContent = `Actuel : ${formatTeam(current)}`;

  wrap.append(title, initial, currentLine);

  if (bt.assignmentChangeReason) {
    const reason = document.createElement("div");
    reason.className = "assignment-summary__reason";
    reason.textContent = `Motif : ${bt.assignmentChangeReason}`;
    wrap.appendChild(reason);
  }

  if (bt.o2SyncedAt) {
    const synced = document.createElement("div");
    synced.className = "assignment-summary__reason";
    synced.textContent = `O2 mis à jour : ${new Date(bt.o2SyncedAt).toLocaleString("fr-FR")}`;
    wrap.appendChild(synced);
  }

  return wrap;
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
    const icon = document.createElement("span");
    icon.textContent = config.icon;
    const typeText = document.createTextNode(` ${type} `);
    const countSpan = document.createElement("span");
    countSpan.className = "doc-badge__count";
    countSpan.textContent = `×${count}`;
    badge.append(icon, typeText, countSpan);
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
    const title = document.createElement("div");
    title.className = "briefSub__block-title";
    title.textContent = "⚠️ Analyse des risques";
    const content = document.createElement("div");
    content.className = "briefSub__block-content";
    content.textContent = bt.analyseDesRisques;
    div.append(title, content);
    container.appendChild(div);
  }

  if (bt.observations) {
    const div = document.createElement("div");
    div.className = "briefSub__block briefSub__block--info";
    const title = document.createElement("div");
    title.className = "briefSub__block-title";
    title.textContent = "💬 Observations";
    const content = document.createElement("div");
    content.className = "briefSub__block-content";
    content.textContent = bt.observations;
    div.append(title, content);
    container.appendChild(div);
  }

  return container;
}
