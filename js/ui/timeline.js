/* js/ui/timeline.js — DEMAT-BT v11.0.1 — 16/02/2026
   Vue "Activités" : à gauche les activités, à droite les techniciens (chips)
   Remplace la timeline horaire (suppression de la zone temps)
*/

/* global state, $, renderAll, mapTechByNni, techKey */

// -------------------------
// Config des activités (Vue Manager)
// -------------------------
const ACTIVITY_ORDER = [
  "TRAVAUX",
  "MAINTENANCE",
  "FUITE",
  "LOCALISATION",
  "ADMIN",
  "EAP",
  "AUTRES",
];

const ACTIVITY_CONFIG = {
  TRAVAUX:       { icon: "🛠️", label: "TRAVAUX" },
  MAINTENANCE:   { icon: "🔧", label: "MAINTENANCE" },
  FUITE:         { icon: "🚨", label: "FUITE / URGENCE" },
  LOCALISATION:  { icon: "🧭", label: "LOCALISATION / RECHERCHE" },
  ADMIN:         { icon: "📋", label: "ADMIN / BRIEF" },
  EAP:           { icon: "🧪", label: "EAP / FORMATION" },
  AUTRES:        { icon: "📦", label: "AUTRES / À CLASSER" },
};

// -------------------------
// Helpers
// -------------------------
function _ensureActivityStylesOnce() {
  if (document.getElementById("activityViewStyles")) return;

  const style = document.createElement("style");
  style.id = "activityViewStyles";
  style.textContent = `
    .activityView { padding: 14px; }
    .activityRow {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 14px;
      padding: 12px 10px;
      border: 1px solid rgba(15,23,42,0.08);
      border-radius: 14px;
      background: rgba(255,255,255,0.85);
      margin-bottom: 10px;
    }
    .activityLeft { display:flex; flex-direction:column; gap:6px; }
    .activityTitle {
      display:flex; align-items:center; gap:8px;
      font-weight: 800;
      letter-spacing: 0.2px;
      color: rgba(15,23,42,0.95);
    }
    .activityMeta {
      font-size: 12px;
      color: rgba(15,23,42,0.55);
      font-weight: 600;
    }
    .activityRight {
      display:flex; flex-wrap:wrap;
      gap: 8px;
      align-items:flex-start;
      padding-top: 2px;
    }
    .techChip {
      border: 1px solid rgba(15,23,42,0.12);
      background: rgba(248,250,252,0.9);
      border-radius: 999px;
      padding: 7px 10px;
      font-weight: 700;
      font-size: 12px;
      color: rgba(15,23,42,0.92);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
      user-select: none;
    }
    .techChip:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(15,23,42,0.10);
      background: rgba(255,255,255,0.98);
    }
    .techChipCount {
      background: rgba(37,99,235,0.12);
      color: rgba(30,58,138,0.95);
      padding: 3px 8px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 12px;
      line-height: 1;
    }
    .techChipSub {
      font-weight: 700;
      opacity: .55;
    }
    .activityEmpty {
      font-size: 12px;
      color: rgba(15,23,42,0.45);
      padding: 6px 0;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

function _normStr(x) {
  return String(x || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

// Essaie d'extraire des mots-clés depuis badges/objet pour classer le BT
function getBtActivity(bt) {
  const badges = Array.isArray(bt?.badges) ? bt.badges : [];
  const docs = Array.isArray(bt?.docs) ? bt.docs : [];
  const raw = [
    bt?.objet,
    bt?.localisation,
    bt?.client,
    ...badges,
    ...docs.map(d => d?.type),
  ].filter(Boolean);

  const s = _normStr(raw.join(" "));

  // 1) FUITE
  if (s.includes("FUITE") || s.includes("ALERTE") || s.includes("URGEN") || s.includes("SUIV FUITE") || s.includes("SUIV_FUITE")) {
    return "FUITE";
  }

  // 2) LOCALISATION / LOCA
  if (s.includes("LOCA") || s.includes("LOCALIS") || s.includes("RECHERC")) {
    return "LOCALISATION";
  }

  // 3) ADMIN / BRIEF / 1/4 COM
  if (s.includes("1/4") || s.includes("COM") || s.includes("BRIEF") || s.includes("ADMIN") || s.includes("BRIEFING")) {
    return "ADMIN";
  }

  // 4) EAP / FORMATION
  if (s.includes("EAP") || s.includes("FORMATION") || s.includes("COACH") || s.includes("TUTOR")) {
    return "EAP";
  }

  // 5) MAINTENANCE
  if (s.includes("MAINT") || s.includes("CICM") || s.includes("VISITE") || s.includes("PREVENT") || s.includes("ENTRETIEN")) {
    return "MAINTENANCE";
  }

  // 6) TRAVAUX
  if (s.includes("TRAV") || s.includes("CHANTIER") || s.includes("POSE") || s.includes("RACC") || s.includes("BRANCHEMENT")) {
    return "TRAVAUX";
  }

  return "AUTRES";
}

// Récupère les techniciens d'un BT (noms + techId si possible)
function getBtTechs(bt) {
  const team = Array.isArray(bt?.team) ? bt.team : [];
  const out = [];

  for (const m of team) {
    const nni = m?.nni || "";
    let tech = null;
    try { tech = (typeof mapTechByNni === "function") ? mapTechByNni(nni) : null; } catch (_) {}

    const name = tech?.name || m?.name || nni || "Inconnu";

    let id = "";
    try { id = (tech && typeof techKey === "function") ? techKey(tech) : (nni || name); } catch (_) { id = nni || name; }

    out.push({ id, name });
  }
  return out;
}

// Utilise le select existant (sidebar) pour filtrer proprement, sans toucher au moteur
function applyTechFilter(techId) {
  const sel = document.getElementById("techSelect");
  if (!sel) return;

  sel.value = techId;
  sel.dispatchEvent(new Event("change", { bubbles: true }));
}

// -------------------------
// Render "Activités"
// -------------------------
function renderActivitiesView(filteredBTs) {
  _ensureActivityStylesOnce();

  const root = document.getElementById("btTimeline");
  // NOTE: on garde des fallbacks car ton HTML peut nommer le container différemment selon versions
  if (!root) return;

  // On remplace totalement le contenu de la zone timeline
  root.innerHTML = `<div class="activityView" id="activityViewRoot"></div>`;
  const container = document.getElementById("activityViewRoot");

  // Map: activity -> { btCount, techCountMap(Map techId -> {name,count}) }
  const agg = new Map();
  for (const a of ACTIVITY_ORDER) {
    agg.set(a, { btCount: 0, techs: new Map() });
  }

  for (const bt of filteredBTs) {
    const act = getBtActivity(bt);
    if (!agg.has(act)) agg.set(act, { btCount: 0, techs: new Map() });

    const entry = agg.get(act);
    entry.btCount += 1;

    const techs = getBtTechs(bt);
    for (const t of techs) {
      const cur = entry.techs.get(t.id) || { name: t.name, count: 0 };
      cur.count += 1;
      entry.techs.set(t.id, cur);
    }
  }

  // Render ordered
  for (const act of ACTIVITY_ORDER) {
    const { icon, label } = ACTIVITY_CONFIG[act] || { icon: "📌", label: act };
    const entry = agg.get(act) || { btCount: 0, techs: new Map() };

    const techEntries = [...entry.techs.entries()]
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const techCount = techEntries.length;

    const row = document.createElement("div");
    row.className = "activityRow";

    row.innerHTML = `
      <div class="activityLeft">
        <div class="activityTitle">${icon} ${label}</div>
        <div class="activityMeta">${entry.btCount} BT <span class="techChipSub">•</span> ${techCount} technicien(s)</div>
      </div>
      <div class="activityRight" id="act_${act}"></div>
    `;

    container.appendChild(row);

    const right = row.querySelector(`#act_${act}`);
    if (!right) continue;

    if (techEntries.length === 0) {
      const empty = document.createElement("div");
      empty.className = "activityEmpty";
      empty.textContent = "— Aucun —";
      right.appendChild(empty);
      continue;
    }

    for (const t of techEntries) {
      const chip = document.createElement("button");
      chip.className = "techChip";
      chip.type = "button";
      chip.title = `Filtrer sur ${t.name}`;
      chip.innerHTML = `<span>${t.name}</span><span class="techChipCount">${t.count}</span>`;
      chip.addEventListener("click", () => applyTechFilter(t.id));
      right.appendChild(chip);
    }
  }
}

// -------------------------
// API publique (appelée par le moteur de rendu)
// -------------------------
// Selon ta V11, renderAll() appelle souvent renderTimeline(filtered).
// On expose donc une fonction renderTimeline qui rend la vue Activités.
function renderTimeline(filtered) {
  renderActivitiesView(filtered || []);
}

window.renderTimeline = renderTimeline;
window.renderActivitiesView = renderActivitiesView;
