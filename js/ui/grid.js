/* js/ui/grid.js — DEMAT-BT v11.5.5 — 09/03/2026
   Vue Référent : grandes vignettes, petites vignettes, liste
*/

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  const mode = state?.referentDisplayMode || "large";
  grid.classList.remove("grid--large", "grid--small", "grid--list", "grid--grouped-small", "grid--grouped-large");
  const rootModeClass = mode === "list"
    ? "grid--list"
    : (mode === "small" ? "grid--grouped-small" : "grid--grouped-large");
  grid.classList.add(rootModeClass);

  if (filtered.length === 0) {
    grid.classList.remove("grid--list", "grid--grouped-small", "grid--grouped-large");
    grid.innerHTML = `
      <section class="empty-state">
        <div class="empty-state__visual">
          <div class="empty-state__logo-wrap">
            <img class="empty-state__logo" src="./assets/logo-home.png" alt="Logo DEMAT-BT" />
          </div>
        </div>
        <div class="empty-state__content">
          <div class="empty-state__eyebrow">Bienvenue</div>
          <h3 class="empty-state__title">Préparez la journée, extrayez les BT et pilotez l'activité terrain.</h3>
          <p class="empty-state__text">
            Chargez le PDF du jour pour alimenter automatiquement le Référent, le Brief équipe et le Support Journée.
            Tant qu'aucune journée n'est importée, cette zone reste votre point de départ.
          </p>
          <div class="empty-state__steps">
            <div class="empty-state__step">
              <div class="empty-state__step-num">1</div>
              <div class="empty-state__step-title">Importer le PDF</div>
              <div class="empty-state__step-text">Ajoutez la journée reçue pour lancer le traitement.</div>
            </div>
            <div class="empty-state__step">
              <div class="empty-state__step-num">2</div>
              <div class="empty-state__step-title">Extraire les BT</div>
              <div class="empty-state__step-text">L'application détecte les interventions et leurs documents associés.</div>
            </div>
            <div class="empty-state__step">
              <div class="empty-state__step-num">3</div>
              <div class="empty-state__step-title">Travailler la journée</div>
              <div class="empty-state__step-text">Passez ensuite sur Référent, Brief ou Support Journée selon le besoin.</div>
            </div>
          </div>
          <div class="empty-state__features">
            <span class="empty-state__feature">📋 Référent d'équipe</span>
            <span class="empty-state__feature">🧭 Brief technicien</span>
            <span class="empty-state__feature">🌦️ Support Journée</span>
          </div>
        </div>
      </section>
    `;
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

    if (uniq.size === 0) return { key: "__SANS_EQUIPE__", label: "Sans équipe" };

    const entries = [...uniq.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr", { sensitivity: "base" }));
    const key = entries.map(([id]) => id).join("|");
    const label = entries.length === 1 ? entries[0][1] : entries.map(([, name]) => name).join(" / ");

    return { key, label };
  }

  function getBtSortTuple(bt) {
    const slot = (typeof extractTimeSlot === "function") ? extractTimeSlot(bt) : null;
    const start = (slot && Number.isFinite(slot.start)) ? slot.start : Number.POSITIVE_INFINITY;
    const id = String(bt?.id || "");
    return { start, id };
  }

  function getDocCount(bt) {
    return Array.isArray(bt?.docs) ? bt.docs.length : 0;
  }

  function createBtCard(bt, cardMode = "large") {
    const card = document.createElement("div");
    card.className = `card btCard btCard--${cardMode}`;

    const topDiv = document.createElement("div");
    topDiv.className = "btTop";

    const leftSection = document.createElement("div");
    leftSection.className = "btTop__left";

    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";

    leftSection.appendChild(idDiv);
    leftSection.appendChild(createCategoryBadge(bt, "sm"));
    topDiv.appendChild(leftSection);

    if (cardMode === "large") topDiv.appendChild(createDocBadges(bt));

    const metaDiv = createBTMeta(bt, { compact: cardMode === "small" });

    const teamContainer = document.createElement("div");
    teamContainer.appendChild(createTeamLine(bt, { showIcon: cardMode !== "small", compact: cardMode === "small" }));
    metaDiv.appendChild(teamContainer);

    if (cardMode === "small") {
      const docsLine = document.createElement("div");
      docsLine.className = "bt-doc-count";
      docsLine.textContent = `📎 ${getDocCount(bt)} document(s)`;
      metaDiv.appendChild(docsLine);
    }

    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    card.appendChild(createDocButtons(bt, { className: "btActions", compact: cardMode === "small" }));

    return card;
  }

  function createListView(items) {
    const tableWrap = document.createElement("div");
    tableWrap.className = "bt-list";

    const table = document.createElement("table");
    table.className = "bt-list__table";
    table.innerHTML = `
      <thead>
        <tr>
          <th>Heure / durée</th>
          <th>Technicien</th>
          <th>Objet</th>
          <th>Client / localisation</th>
          <th>Docs</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    for (const bt of items) {
      const row = document.createElement("tr");
      const slot = (typeof extractTimeSlot === "function") ? extractTimeSlot(bt) : null;
      const timeText = slot?.label || bt.datePrevue || "—";
      const duration = formatDuree(bt.duree);
      const docsCount = getDocCount(bt);
      const firstPage = bt.docs?.[0]?.page || bt.pageStart || 1;

      const timeCell = document.createElement("td");
      const timeMain = document.createElement("div");
      timeMain.className = "list-time";
      timeMain.textContent = timeText;
      timeCell.appendChild(timeMain);
      if (duration) {
        const timeSub = document.createElement("div");
        timeSub.className = "list-sub";
        timeSub.textContent = `⏱️ ${duration}`;
        timeCell.appendChild(timeSub);
      }
      timeCell.appendChild(createCategoryBadge(bt, "sm"));

      const techCell = document.createElement("td");
      techCell.appendChild(createTeamLine(bt, { showIcon: false, compact: true }));

      const objetCell = document.createElement("td");
      objetCell.title = bt.objet || "";
      objetCell.textContent = bt.objet || "—";

      const clientCell = document.createElement("td");
      const clientMain = document.createElement("div");
      clientMain.textContent = bt.client || "—";
      const clientSub = document.createElement("div");
      clientSub.className = "list-sub";
      clientSub.textContent = `📍 ${bt.localisation || "—"}`;
      clientCell.append(clientMain, clientSub);

      const docsCell = document.createElement("td");
      const docsSpan = document.createElement("span");
      docsSpan.className = "list-docs";
      docsSpan.textContent = String(docsCount);
      docsCell.appendChild(docsSpan);

      const actionCell = document.createElement("td");
      const openBtn = document.createElement("button");
      openBtn.className = "btn btn--secondary btn-open-bt";
      openBtn.textContent = "Ouvrir";
      openBtn.addEventListener("click", () => openModal(bt, firstPage));
      actionCell.appendChild(openBtn);

      row.append(timeCell, techCell, objetCell, clientCell, docsCell, actionCell);
      tbody.appendChild(row);
    }

    tableWrap.appendChild(table);
    return tableWrap;
  }

  function createGroupSection(group, sectionMode = "large") {
    const section = document.createElement("div");
    section.className = `referent-group referent-group--${sectionMode}`;

    if (sectionMode === "large") {
      section.style.setProperty("--group-cols", String(Math.max(1, Math.min(group.items.length, 2))));
    } else if (sectionMode === "small") {
      section.style.setProperty("--group-cols", String(Math.max(1, Math.min(group.items.length, 3))));
    }

    const title = document.createElement("div");
    title.className = "card__title referent-group__title";

    const titleName = document.createElement("span");
    titleName.className = "referent-group__name";
    titleName.textContent = group.label;

    const titleCount = document.createElement("span");
    titleCount.className = "referent-group__count";
    titleCount.textContent = `${group.items.length} BT`;

    title.append(titleName, titleCount);
    section.appendChild(title);

    if (sectionMode === "list") {
      section.appendChild(createListView(group.items));
      return section;
    }

    const groupGrid = document.createElement("div");
    groupGrid.className = `grid ${sectionMode === "small" ? "grid--small" : "grid--large"} referent-group__grid`;

    for (const bt of group.items) {
      groupGrid.appendChild(createBtCard(bt, sectionMode === "small" ? "small" : "large"));
    }

    section.appendChild(groupGrid);
    return section;
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
    grid.appendChild(createGroupSection(group, mode));
  }
}
