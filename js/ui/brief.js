/* js/ui/brief.js — DEMAT-BT v11.7.0 — 14/03/2026
   Vue Brief (optimisée Samsung Flip 55") — utilise les composants partagés
   Mise à jour : Intégration de la détection précise des types de documents
*/

function renderBrief(filtered) {
  const list = $("briefList");
  const meta = $("briefMeta");
  if (!list) return;

  if (!state.filters.techId) {
    if (meta) meta.textContent = "";
    list.innerHTML = `<div class="hint" style="padding:16px;">
      Mode <b>Brief</b> : sélectionne un technicien à gauche.
    </div>`;
    return;
  }

  const techs = window.TECHNICIANS || [];
  const t = techs.find(x => techKey(x) === state.filters.techId);
  if (meta) meta.textContent = t ? `${t.name} — ${filtered.length} BT` : "";

  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="hint" style="padding:16px;">Aucun BT pour ce technicien.</div>`;
    return;
  }

  for (const bt of filtered) {
    const card = document.createElement("div");
    card.className = "card briefCard";
    if (bt.hasManualAssignmentChange) card.classList.add("briefCard--changed");

    // Titre : ID + badge catégorie métier + PTC/PTD
    const titleDiv = document.createElement("div");
    titleDiv.className = "briefCard__title";

    const idSpan = document.createElement("div");
    idSpan.className = "briefTitle";
    idSpan.style.margin = "0";
    idSpan.textContent = bt.id;

    titleDiv.appendChild(idSpan);
    
    // Ajout de la pastille métier (IS, DEP, etc.)
    titleDiv.appendChild(createCategoryBadge(bt, "md"));
    if (bt.hasManualAssignmentChange) titleDiv.appendChild(createAssignmentBadge(bt, { label: "BT modifié" }));

    // Affichage des badges PTC/PTD du technicien concerné
    const assignedTeam = (window.BriefJournee && typeof window.BriefJournee.getAssignedTeam === "function")
      ? window.BriefJournee.getAssignedTeam(bt)
      : (bt.team || []);
    if (assignedTeam) {
      assignedTeam.forEach(member => {
        const tech = mapTechByNni(member.nni);
        if (tech && (tech.ptc || tech.ptd)) {
          titleDiv.appendChild(createPtcPtdBadge(tech));
        }
      });
    }

    // Contenu de la carte
    const subDiv = document.createElement("div");
    subDiv.className = "briefSub";

    // Métadonnées principales (Date, Objet, Client, Adresse)
    // Utilisation de createBTMeta pour la cohérence visuelle
    const mainInfo = document.createElement("div");
    mainInfo.className = "briefSub__main";
    mainInfo.appendChild(createBTMeta(bt));
    const assignmentSummary = createAssignmentSummary(bt);
    if (assignmentSummary) mainInfo.appendChild(assignmentSummary);
    subDiv.appendChild(mainInfo);

    // Analyse des risques + observations (blocs d'alerte Jaune/Bleu)
    const blocks = createInfoBlocks(bt);
    if (blocks) subDiv.appendChild(blocks);

    // Boutons de documents (Utilisent les classes .doc-btn--type pour la précision visuelle)
    // C'est ici que le bouton FOR-113 apparaîtra avec son style spécifique
    const docsDiv = createDocButtons(bt, { className: "briefDocs" });

    card.appendChild(titleDiv);
    card.appendChild(subDiv);
    card.appendChild(docsDiv);
    list.appendChild(card);
  }
}
