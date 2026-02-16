/* js/ui/timeline.js — DEMAT-BT v11.1.3 — 16/02/2026
   Vue "Brief / Activités" (basée SUR LES PASTILLES)
   v11.1.3 : 
   - Ajout du mot-clé "SURVEILLANCE" dans le groupe FUITE
   - (Correctif précédent : couleurs 1/4 COM, EAP, PIS, etc.)
*/

/* global state, mapTechByNni, techKey */

(function () {
  // ------------------------
  // 1. Styles (injectés 1 seule fois)
  // ------------------------
  function ensureStylesOnce() {
    if (document.getElementById("briefTimelineStyles")) return;

    const style = document.createElement("style");
    style.id = "briefTimelineStyles";
    style.textContent = `
      .briefView { padding: 14px; display:flex; flex-direction:column; gap:12px; }

      .groupCard{
        background: rgba(255,255,255,0.88);
        border: 1px solid rgba(15,23,42,0.08);
        border-radius: 16px;
        overflow:hidden;
        box-shadow: 0 10px 26px rgba(15,23,42,0.05);
      }

      .groupHeader{
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 14px;
        cursor:pointer;
        user-select:none;
        background: linear-gradient(180deg, rgba(248,250,252,0.95), rgba(255,255,255,0.88));
        border-bottom: 1px solid rgba(15,23,42,0.06);
      }

      .groupHeaderLeft{ display:flex; align-items:center; gap:10px; min-width:0; }
      .groupDot{
        width:10px; height:10px; border-radius:999px; flex:none;
        box-shadow: 0 0 0 4px rgba(15,23,42,0.04);
      }

      .groupTitle{
        font-weight:900;
        letter-spacing:0.2px;
        color: rgba(15,23,42,0.95);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }

      .groupMeta{
        font-size:12px;
        font-weight:800;
        color: rgba(15,23,42,0.55);
        display:flex; gap:8px; align-items:center;
      }

      .groupPill{
        background: rgba(37,99,235,0.10);
        color: rgba(30,58,138,0.92);
        padding: 3px 8px;
        border-radius: 999px;
        font-weight: 900;
        font-size: 12px;
        line-height:1;
      }

      .chev{
        font-weight: 900;
        color: rgba(15,23,42,0.55);
        transition: transform .15s ease;
        margin-left: 10px;
      }
      .groupCard[data-open="false"] .chev{ transform: rotate(-90deg); }

      .groupBody{ padding: 10px 14px 14px 14px; display:flex; flex-direction:column; gap:10px; }
      .groupCard[data-open="false"] .groupBody{ display:none; }

      .subRow{
        display:grid;
        grid-template-columns: 220px 1fr;
        gap: 12px;
        padding: 10px 10px;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.07);
        background: rgba(248,250,252,0.80);
      }

      .subLeft{ display:flex; flex-direction:column; gap:4px; min-width:0; }
      .subTitle{
        display:flex; align-items:center; gap:8px;
        font-weight: 900;
        color: rgba(15,23,42,0.92);
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .subMeta{
        font-size:12px;
        font-weight:800;
        color: rgba(15,23,42,0.50);
      }

      .subRight{
        display:flex; flex-wrap:wrap;
        gap: 8px;
        align-items:flex-start;
        padding-top: 2px;
      }

      .techChip{
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.92);
        border-radius: 999px;
        padding: 7px 10px;
        font-weight: 900;
        font-size: 12px;
        color: rgba(15,23,42,0.92);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
        user-select: none;
      }
      .techChip:hover{
        transform: translateY(-1px);
        box-shadow: 0 8px 18px rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.98);
      }
      .techChipCount{
        background: rgba(37,99,235,0.12);
        color: rgba(30,58,138,0.95);
        padding: 3px 8px;
        border-radius: 999px;
        font-weight: 950;
        font-size: 12px;
        line-height: 1;
      }

      .empty{
        font-size:12px;
        font-weight:900;
        color: rgba(15,23,42,0.40);
        padding: 6px 2px;
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------
  // 2. Helpers Tech (Filtre + Mapping)
  // ------------------------
  function applyTechFilter(techId) {
    const sel = document.getElementById("techSelect");
    if (!sel) return;
    sel.value = techId;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }

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

      if (!id) id = name;
      out.push({ id, name });
    }
    return out;
  }

  // ------------------------
  // 3. Logique des GROUPES (Cœur du tri)
  // ------------------------

  function getPrimaryBadgeId(bt) {
    const b = Array.isArray(bt?.badges) ? bt.badges : [];
    return (b[0] || "AUTRES").toString();
  }

  function getGroupKeyFromBadgeId(badgeId) {
    const id = (badgeId || "").toUpperCase();

    // 1. Groupes Prioritaires (IS/DEP)
    if (id.startsWith("IS_") || id === "IS") return "IS";
    if (id.startsWith("DEP_") || id === "DEP") return "DEP";

    // 2. Groupes Techniques
    if (id.startsWith("MAINT_") || id.includes("CICM") || id.includes("ROBINET")) return "MAINT";
    
    // === MODIFICATION ICI : Ajout de SURVEILLANCE ===
    if (id.includes("FUITE") || id.includes("URGEN") || id.includes("SURVEILLANCE")) return "FUITE";
    
    if (id.includes("TRAVAUX") || id.includes("CHANTIER") || id.includes("RACC")) return "TRAVAUX";
    if (id.includes("RSF") || id.includes("SAP")) return "RSF_SAP";
    if (id.includes("MAGASIN")) return "MAGASIN";
    
    // 3. Groupes Sécurité / Admin / Client
    if (id.includes("1/4 COM") || id.includes("COM") || id.includes("BRIEF")) return "1/4 COM";
    if (id.includes("EAP")) return "EAP";
    if (id.includes("PIS")) return "PIS";
    if (id.includes("REUNION") || id.includes("ADMIN")) return "REUNION";
    if (id.includes("CLIENT")) return "CLIENT";
    if (id.includes("VISUELLE")) return "VISUELLE";

    // 4. Fallback
    if (id === "AUTRES") return "AUTRES";

    return id;
  }

  function humanLabelFromBadgeId(badgeId) {
    const id = (badgeId || "").toUpperCase();
    if (id.includes("_")) return id.replaceAll("_", " ");
    return id;
  }

  // --- PALETTE DE COULEURS ÉTENDUE ---
  const GROUP_COLOR = {
    IS: "#eab308",       // Jaune
    DEP: "#f59e0b",      // Orange
    FUITE: "#ef4444",    // Rouge
    MAINT: "#3b82f6",    // Bleu
    TRAVAUX: "#10b981",  // Vert
    RSF_SAP: "#8b5cf6",  // Violet
    MAGASIN: "#6366f1",  // Indigo
    
    "1/4 COM": "#06b6d4", // Cyan
    EAP: "#4f46e5",       // Royal Blue
    PIS: "#64748b",       // Slate
    REUNION: "#ec4899",   // Rose
    CLIENT: "#14b8a6",    // Teal
    VISUELLE: "#f43f5e",  // Rose vif
    AUTRES: "#94a3b8",    // Gris clair
    
    DEFAULT: "#64748b"    // Gris défaut
  };

  // --- ORDRE D'AFFICHAGE ---
  const GROUP_ORDER = [
    "1/4 COM",
    "IS", 
    "DEP", 
    "FUITE", 
    "TRAVAUX", 
    "RSF_SAP", 
    "MAGASIN", 
    "EAP",
    "CLIENT",
    "REUNION",
    "VISUELLE",
    "PIS",
    "MAINT"
  ];

  const SUB_ORDER = {
    IS: ["IS_J1", "IS_J2", "IS_J3"],
    DEP: ["DEP_J1", "DEP_J2", "DEP_J3"]
  };

  // ------------------------
  // 4. Render Logic
  // ------------------------
  function renderBriefActivities(filteredBTs) {
    ensureStylesOnce();

    const root = document.getElementById("btTimeline");
    if (!root) return;

    root.innerHTML = `<div class="briefView" id="briefViewRoot"></div>`;
    const container = document.getElementById("briefViewRoot");

    // Agrégation
    const agg = new Map();

    for (const bt of (filteredBTs || [])) {
      const badgeId = getPrimaryBadgeId(bt);
      const groupKey = getGroupKeyFromBadgeId(badgeId);

      if (!agg.has(groupKey)) agg.set(groupKey, new Map());
      const subMap = agg.get(groupKey);

      const subKey = badgeId; 
      if (!subMap.has(subKey)) subMap.set(subKey, { btCount: 0, techs: new Map() });
      const entry = subMap.get(subKey);

      entry.btCount += 1;

      const techs = getBtTechs(bt);
      for (const t of techs) {
        const cur = entry.techs.get(t.id) || { name: t.name, count: 0 };
        cur.count += 1;
        entry.techs.set(t.id, cur);
      }
    }

    // Conversion en tableau pour le tri
    const allGroups = [...agg.entries()].map(([groupKey, subMap]) => {
      let btSum = 0;
      let techSet = new Set();
      for (const [, v] of subMap.entries()) {
        btSum += v.btCount;
        for (const techId of v.techs.keys()) techSet.add(techId);
      }
      return { groupKey, subMap, btSum, techCount: techSet.size };
    });

    // Tri des groupes (Ordre défini + Volume)
    allGroups.sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a.groupKey);
      const ib = GROUP_ORDER.indexOf(b.groupKey);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return b.btSum - a.btSum || a.groupKey.localeCompare(b.groupKey);
    });

    // Génération du DOM
    for (const g of allGroups) {
      const color = GROUP_COLOR[g.groupKey] || GROUP_COLOR.DEFAULT;

      // Création Carte
      const card = document.createElement("div");
      card.className = "groupCard";
      
      const openByDefault = (GROUP_ORDER.includes(g.groupKey) || g.btSum > 0);
      card.dataset.open = openByDefault ? "true" : "false";

      // Header Carte
      const header = document.createElement("div");
      header.className = "groupHeader";
      header.innerHTML = `
        <div class="groupHeaderLeft">
          <div class="groupDot" style="background:${color}"></div>
          <div class="groupTitle">${g.groupKey}</div>
        </div>
        <div class="groupMeta">
          <span class="groupPill">${g.btSum} BT</span>
          <span class="groupPill">${g.techCount} tech</span>
          <span class="chev">▾</span>
        </div>
      `;

      header.addEventListener("click", () => {
        card.dataset.open = (card.dataset.open === "true") ? "false" : "true";
      });

      card.appendChild(header);

      // Body Carte
      const body = document.createElement("div");
      body.className = "groupBody";

      // Tri des sous-lignes
      const subs = [...g.subMap.entries()].map(([subKey, v]) => ({ subKey, ...v }));
      const forced = SUB_ORDER[g.groupKey];
      
      if (forced && forced.length) {
        subs.sort((a, b) => {
          const ia = forced.indexOf(a.subKey.toUpperCase());
          const ib = forced.indexOf(b.subKey.toUpperCase());
          if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
          return b.btCount - a.btCount || a.subKey.localeCompare(b.subKey);
        });
      } else {
        subs.sort((a, b) => b.btCount - a.btCount || a.subKey.localeCompare(b.subKey));
      }

      if (subs.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "— Aucun —";
        body.appendChild(empty);
      } else {
        for (const s of subs) {
          // Tri des techs
          const techEntries = [...s.techs.entries()]
            .map(([id, v]) => ({ id, name: v.name, count: v.count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

          const subRow = document.createElement("div");
          subRow.className = "subRow";

          subRow.innerHTML = `
            <div class="subLeft">
              <div class="subTitle">
                <span style="width:10px;height:10px;border-radius:999px;background:${color};display:inline-block"></span>
                ${humanLabelFromBadgeId(s.subKey)}
              </div>
              <div class="subMeta">${s.btCount} BT • ${techEntries.length} technicien(s)</div>
            </div>
            <div class="subRight"></div>
          `;

          const right = subRow.querySelector(".subRight");

          if (!techEntries.length) {
            const empty = document.createElement("div");
            empty.className = "empty";
            empty.textContent = "— Aucun —";
            right.appendChild(empty);
          } else {
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

          body.appendChild(subRow);
        }
      }

      card.appendChild(body);
      container.appendChild(card);
    }
  }

  // ------------------------
  // 5. API Publique
  // ------------------------
  function renderTimeline(filtered) {
    renderBriefActivities(filtered || []);
  }

  window.renderTimeline = renderTimeline;
})();
