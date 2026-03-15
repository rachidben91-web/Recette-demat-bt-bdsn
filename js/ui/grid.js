/* js/ui/grid.js — DEMAT-BT v11.8.0 — 14/03/2026
   Vue Référent : grandes vignettes, petites vignettes, liste
*/

function renderGrid(filtered, grid) {
  grid.innerHTML = "";
  const mode = state?.referentDisplayMode || "large";
  grid.classList.remove("grid--large", "grid--small", "grid--list", "grid--grouped-small", "grid--grouped-large", "grid--empty");
  const rootModeClass = mode === "list"
    ? "grid--list"
    : (mode === "small" ? "grid--grouped-small" : "grid--grouped-large");
  grid.classList.add(rootModeClass);

  if (filtered.length === 0) {
    grid.classList.remove("grid--list", "grid--grouped-small", "grid--grouped-large");
    grid.classList.add("grid--empty");
    grid.innerHTML = `
      <section class="empty-state">
        <div class="empty-state__visual">
          <div class="empty-state__logo-wrap">
            <img class="empty-state__logo" src="./assets/logo-home.png" alt="Logo DEMAT-BT" />
          </div>
        </div>
        <div class="empty-state__content">
          <div class="empty-state__eyebrow">Bienvenue</div>
          <h3 class="empty-state__title">Dématérialisez les BT, renforcez la qualité des briefs et pilotez la journée terrain.</h3>
          <p class="empty-state__text">
            Importez le PDF du jour pour alimenter automatiquement la vue Référent et le Brief équipe.
            Vous pouvez aussi utiliser directement le Support Journée, même sans import PDF, pour préparer et suivre l'activité du jour.
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
              <div class="empty-state__step-title">Brief ou Support Journée</div>
              <div class="empty-state__step-text">Travaillez ensuite sur le Brief équipe ou ouvrez directement le Support Journée selon le besoin.</div>
            </div>
          </div>
          <div class="empty-state__features">
            <span class="empty-state__feature">📋 Référent d'équipe</span>
            <span class="empty-state__feature">🧭 Brief équipe</span>
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

    if (uniq.size === 0) {
      return { key: "__SANS_EQUIPE__", label: "Sans équipe", fullLabel: "Sans équipe" };
    }

    const entries = [...uniq.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr", { sensitivity: "base" }));
    const key = entries.map(([id]) => id).join("|");
    const fullLabel = entries.length === 1 ? entries[0][1] : entries.map(([, name]) => name).join(" / ");
    const maxVisible = 4;
    const visibleNames = entries.slice(0, maxVisible).map(([, name]) => name);
    const hiddenCount = Math.max(0, entries.length - visibleNames.length);
    const label = hiddenCount > 0
      ? `${visibleNames.join(" / ")} / +${hiddenCount}`
      : fullLabel;

    return { key, label, fullLabel };
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
    if (bt.hasManualAssignmentChange) {
      card.classList.add(bt.o2SyncStatus === "done" ? "btCard--o2-done" : "btCard--changed");
    }

    const topDiv = document.createElement("div");
    topDiv.className = "btTop";

    const leftSection = document.createElement("div");
    leftSection.className = "btTop__left";

    const idDiv = document.createElement("div");
    idDiv.className = "btId";
    idDiv.textContent = bt.id || "BT ?";

    leftSection.appendChild(idDiv);
    leftSection.appendChild(createCategoryBadge(bt, "sm"));
    if (bt.hasManualAssignmentChange) {
      leftSection.appendChild(createAssignmentBadge(bt, { compact: cardMode === "small" }));
    }
    topDiv.appendChild(leftSection);

    if (cardMode === "large") topDiv.appendChild(createDocBadges(bt));

    const metaDiv = createBTMeta(bt, { compact: cardMode === "small" });

    const teamContainer = document.createElement("div");
    teamContainer.appendChild(createTeamLine(bt, { showIcon: cardMode !== "small", compact: cardMode === "small" }));
    metaDiv.appendChild(teamContainer);

    const assignmentSummary = createAssignmentSummary(bt, { compact: cardMode === "small" });
    if (assignmentSummary) metaDiv.appendChild(assignmentSummary);

    if (cardMode === "small") {
      const docsLine = document.createElement("div");
      docsLine.className = "bt-doc-count";
      docsLine.textContent = `📎 ${getDocCount(bt)} document(s)`;
      metaDiv.appendChild(docsLine);
    }

    card.appendChild(topDiv);
    card.appendChild(metaDiv);
    card.appendChild(createBtActionArea(bt, { compact: cardMode === "small" }));

    return card;
  }

  function createAssignmentEditor(bt) {
    const wrap = document.createElement("div");
    wrap.className = "assignment-editor";
    wrap.hidden = true;

    const title = document.createElement("div");
    title.className = "assignment-editor__title";
    title.textContent = "Modifier l'affectation";

    const list = document.createElement("div");
    list.className = "assignment-editor__list";

    const selectedNnis = new Set(
      ((window.BriefJournee?.getAssignedTeam(bt)) || []).map((member) => String(member.nni || "").trim().toUpperCase())
    );

    for (const tech of (window.TECHNICIANS || [])) {
      const label = document.createElement("label");
      label.className = "assignment-editor__option";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = tech.nni;
      input.checked = selectedNnis.has(tech.nni);

      const text = document.createElement("span");
      text.textContent = tech.name;

      label.append(input, text);
      list.appendChild(label);
    }

    const reasonInput = document.createElement("input");
    reasonInput.className = "input assignment-editor__reason";
    reasonInput.type = "text";
    reasonInput.placeholder = "Motif optionnel (absence, arbitrage, surcharge...)";
    reasonInput.value = bt.assignmentChangeReason || "";

    const actions = document.createElement("div");
    actions.className = "assignment-editor__actions";

    const btnCancel = document.createElement("button");
    btnCancel.className = "btn btn--secondary";
    btnCancel.type = "button";
    btnCancel.textContent = "Annuler";

    const btnReset = document.createElement("button");
    btnReset.className = "btn btn--secondary";
    btnReset.type = "button";
    btnReset.textContent = "Réinitialiser";

    const btnSave = document.createElement("button");
    btnSave.className = "btn";
    btnSave.type = "button";
    btnSave.textContent = "Enregistrer";

    btnCancel.addEventListener("click", () => {
      wrap.hidden = true;
    });

    btnReset.addEventListener("click", async () => {
      if (!window.BriefJournee) return;
      window.BriefJournee.resetBtAssignment(bt);
      if (typeof rebuildTechCountsFromBts === "function") rebuildTechCountsFromBts();
      if (typeof saveToCache === "function") await saveToCache();
      if (typeof window.saveCurrentBriefJournee === "function") {
        await window.saveCurrentBriefJournee({ silent: true, source: "reset affectation" });
      }
      if (typeof renderAll === "function") renderAll();
    });

    btnSave.addEventListener("click", async () => {
      if (!window.BriefJournee) return;
      const checked = [...list.querySelectorAll('input[type="checkbox"]:checked')];
      const nextTeam = checked.map((input) => {
        const tech = mapTechByNni(input.value);
        return {
          nni: tech?.nni || input.value,
          name: tech?.name || input.value,
        };
      });

      if (nextTeam.length === 0) {
        alert("Sélectionne au moins un technicien pour cette affectation.");
        return;
      }

      window.BriefJournee.setBtAssignment(bt, nextTeam, reasonInput.value || "");
      if (typeof rebuildTechCountsFromBts === "function") rebuildTechCountsFromBts();
      if (typeof saveToCache === "function") await saveToCache();
      if (typeof window.saveCurrentBriefJournee === "function") {
        await window.saveCurrentBriefJournee({ silent: true, source: "modification affectation" });
      }
      if (typeof renderAll === "function") renderAll();
    });

    actions.append(btnCancel, btnReset, btnSave);
    wrap.append(title, list, reasonInput, actions);
    return wrap;
  }

  function createO2ActionButton(bt) {
    if (!bt.hasManualAssignmentChange || !window.BriefJournee) return document.createDocumentFragment();

    const btn = document.createElement("button");
    btn.className = "btn btn--secondary";
    btn.type = "button";

    const isDone = bt.o2SyncStatus === "done";
    btn.textContent = isDone ? "Remettre à reporter" : "Marquer O2 fait";
    btn.classList.toggle("btn--success", isDone);

    btn.addEventListener("click", async () => {
      if (bt.o2SyncStatus === "done") {
        window.BriefJournee.markBtO2Pending(bt);
      } else {
        window.BriefJournee.markBtO2Done(bt);
      }
      if (typeof saveToCache === "function") await saveToCache();
      if (typeof window.saveCurrentBriefJournee === "function") {
        await window.saveCurrentBriefJournee({ silent: true, source: "statut O2" });
      }
      if (typeof renderAll === "function") renderAll();
    });

    return btn;
  }

  function createBtActionArea(bt, opts = {}) {
    const compact = opts.compact === true;
    const root = document.createElement("div");

    const actions = createDocButtons(bt, { className: "btActions", compact });
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn--secondary";
    editBtn.type = "button";
    editBtn.textContent = bt.hasManualAssignmentChange ? "Modifier affectation" : "Affectation";
    actions.appendChild(editBtn);
    actions.appendChild(createO2ActionButton(bt));

    const editor = createAssignmentEditor(bt);
    editBtn.addEventListener("click", () => {
      editor.hidden = !editor.hidden;
    });

    root.append(actions, editor);
    return root;
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
      if (bt.hasManualAssignmentChange) {
        row.classList.add(bt.o2SyncStatus === "done" ? "bt-list__row--o2-done" : "bt-list__row--changed");
      }
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
      if (bt.hasManualAssignmentChange) {
        const badgeWrap = document.createElement("div");
        badgeWrap.className = "bt-list__assignment-flag";
        badgeWrap.appendChild(createAssignmentBadge(bt, { label: "A reporter dans O2" }));
        timeCell.appendChild(badgeWrap);
      }

      const techCell = document.createElement("td");
      techCell.appendChild(createTeamLine(bt, { showIcon: false, compact: true }));
      if (bt.hasManualAssignmentChange) {
        const summary = createAssignmentSummary(bt, { compact: true });
        if (summary) techCell.appendChild(summary);
      }

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
      const actionWrap = document.createElement("div");
      actionWrap.className = "bt-list__actions";
      const openBtn = document.createElement("button");
      openBtn.className = "btn btn--secondary btn-open-bt";
      openBtn.textContent = "Ouvrir";
      openBtn.addEventListener("click", () => openModal(bt, firstPage));
      actionWrap.appendChild(openBtn);

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn--secondary btn-open-bt";
      editBtn.textContent = "Affectation";
      editBtn.addEventListener("click", () => {
        const rootCard = row.nextElementSibling;
        if (rootCard && rootCard.classList.contains("bt-list__editor-row")) {
          rootCard.hidden = !rootCard.hidden;
        }
      });
      actionWrap.appendChild(editBtn);

      if (bt.hasManualAssignmentChange) {
        const o2Btn = document.createElement("button");
        o2Btn.className = `btn btn--secondary btn-open-bt${bt.o2SyncStatus === "done" ? " btn--success" : ""}`;
        o2Btn.textContent = bt.o2SyncStatus === "done" ? "O2 OK" : "O2 fait";
        o2Btn.addEventListener("click", async () => {
          if (!window.BriefJournee) return;
          if (bt.o2SyncStatus === "done") {
            window.BriefJournee.markBtO2Pending(bt);
          } else {
            window.BriefJournee.markBtO2Done(bt);
          }
          if (typeof saveToCache === "function") await saveToCache();
          if (typeof window.saveCurrentBriefJournee === "function") {
            await window.saveCurrentBriefJournee({ silent: true, source: "statut O2" });
          }
          if (typeof renderAll === "function") renderAll();
        });
        actionWrap.appendChild(o2Btn);
      }
      actionCell.appendChild(actionWrap);

      row.append(timeCell, techCell, objetCell, clientCell, docsCell, actionCell);
      tbody.appendChild(row);

      const editorRow = document.createElement("tr");
      editorRow.className = "bt-list__editor-row";
      if (bt.hasManualAssignmentChange) editorRow.classList.add(bt.o2SyncStatus === "done" ? "bt-list__editor-row--o2-done" : "bt-list__editor-row--changed");
      editorRow.hidden = true;
      const editorCell = document.createElement("td");
      editorCell.colSpan = 6;
      editorCell.appendChild(createAssignmentEditor(bt));
      editorCell.firstChild.hidden = false;
      editorRow.appendChild(editorCell);
      tbody.appendChild(editorRow);
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
    titleName.title = group.fullLabel || group.label;

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
