/* js/ui/grid.js — DEMAT-BT v11.0.0 — 16/02/2026
   Vue vignettes (cartes) — utilise les composants partagés
   Mise à jour : Intégration des classes de précision pour les types de docs
*/

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  if (filtered.length === 0) {
    grid.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT à afficher avec ces filtres.</div>`;
    return;
  }

  function buildTeamGroupInfo(bt) {
    const members = Array.isArray(bt?.team) ? bt.team : [];
    const uniq = new Map();

    for (const m of members) {
      const nni = String(m?.nni || "").trim().toUpperCase();
      const tech = nni ? mapTechByNni(nni) : null;
      const id = tech ? techKey(tech) : (nni || String(m?.name || "").trim().toUpperCase() || "INCONNU");
      const name = tech?.name || m?.name || nni || "INCONNU";
      if (!uniq.has(id)) uniq.set(id, name);
    }

    if (uniq.size === 0) {
      return { key: "__SANS_EQUIPE__", label: "Sans équipe" };
    }

    const entries = [...uniq.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr", { sensitivity: "base" }));
    const key = entries.map(([id]) => id).join("|");
    const label = entries.length === 1
      ? entries[0][1]
      : entries.map(([, name]) => name).join(" / ");

    return { key, label };
  }

  function getBtSortTuple(bt) {
    const slot = (typeof extractTimeSlot === "function") ? extractTimeSlot(bt) : null;
    const start = (slot && Number.isFinite(slot.start)) ? slot.start : Number.POSITIVE_INFINITY;
    const id = String(bt?.id || "");
    return { start, id };
  }

  function createBtCard(bt) {
    const card = document.createElement("div");
    card.className = "card btCard";

    // Top : ID + badges de comptage par type
    const topDiv = document.createElement("div");
    topDiv.className = "btTop";

    const leftSection = document.createElement("div");
    leftSection.className = "btTop__left";

    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";

    leftSection.appendChild(idDiv);
    leftSection.appendChild(createCategoryBadge(bt, "sm")); // Pastille métier
    topDiv.appendChild(leftSection);
    
    // Les badges de comptage utilisent maintenant les couleurs de DOC_TYPES_CONFIG
    topDiv.appendChild(createDocBadges(bt));

    // Meta info (Date, Client, Adresse)
    const metaDiv = createBTMeta(bt);
    
    // Équipe et badges PTC/PTD
    const teamContainer = document.createElement("div");
    teamContainer.appendChild(createTeamLine(bt));
    metaDiv.appendChild(teamContainer);

    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    
    // Boutons d'action (Utilisent les classes .doc-btn--type pour la précision)
    card.appendChild(createDocButtons(bt, { className: "btActions" }));

    return card;
  }

  const groups = new Map();
  for (const bt of filtered) {
    const info = buildTeamGroupInfo(bt);
    if (!groups.has(info.key)) groups.set(info.key, { label: info.label, items: [] });
    groups.get(info.key).items.push(bt);
  }

  const sortedGroups = [...groups.values()].sort((a, b) =>
    a.label.localeCompare(b.label, "fr", { sensitivity: "base" })
  );

  for (const group of sortedGroups) {
    group.items.sort((a, b) => {
      const sa = getBtSortTuple(a);
      const sb = getBtSortTuple(b);
      if (sa.start !== sb.start) return sa.start - sb.start;
      return sa.id.localeCompare(sb.id, "fr", { numeric: true, sensitivity: "base" });
    });

    const section = document.createElement("div");
    section.style.gridColumn = "1 / -1";
    section.style.display = "flex";
    section.style.flexDirection = "column";
    section.style.gap = "10px";

    const title = document.createElement("div");
    title.className = "card__title";
    title.textContent = `${group.label} — ${group.items.length} BT`;
    section.appendChild(title);

    const groupGrid = document.createElement("div");
    groupGrid.className = "grid";
    groupGrid.style.marginTop = "0";

    for (const bt of group.items) {
      groupGrid.appendChild(createBtCard(bt));
    }

    section.appendChild(groupGrid);
    grid.appendChild(section);
  }
}
