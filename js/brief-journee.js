/* js/brief-journee.js — DEMAT-BT v11.6.0 — 14/03/2026
   Snapshot métier des vues Référent / Brief, sans PDF source.
*/

(function () {
  const DEFAULT_SITE = "VLG";

  function todayISO() {
    return new Date().toLocaleDateString("fr-CA");
  }

  function cloneTeam(team) {
    return (Array.isArray(team) ? team : []).map((member) => ({
      nni: String(member?.nni || "").trim().toUpperCase(),
      name: norm(member?.name || ""),
    }));
  }

  function normalizeDocs(docs) {
    return (Array.isArray(docs) ? docs : [])
      .map((doc) => ({
        type: String(doc?.type || "DOC").trim().toUpperCase(),
        page: Number(doc?.page || 0),
      }))
      .filter((doc) => Number.isFinite(doc.page) && doc.page > 0);
  }

  function toIsoDateFromFr(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return "";
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  function getJourneeDate() {
    if (state?.journee?.jour) return state.journee.jour;

    const fromPdfName = extractDayFromFilename(state?.pdfName || "");
    const fromPdfIso = toIsoDateFromFr(fromPdfName);
    if (fromPdfIso) return fromPdfIso;

    return todayISO();
  }

  function buildBtSnapshot(bt) {
    const teamOriginal = cloneTeam(bt?.teamOriginal || bt?.team || []);
    const teamCurrent = cloneTeam(bt?.teamCurrent || bt?.team || []);

    return {
      id: String(bt?.id || "").trim(),
      pageStart: Number(bt?.pageStart || 0) || null,
      badges: Array.isArray(bt?.badges) ? [...bt.badges] : [],
      objet: norm(bt?.objet || ""),
      localisation: norm(bt?.localisation || ""),
      docs: normalizeDocs(bt?.docs),
      teamOriginal,
      teamCurrent,
      hasManualAssignmentChange: Boolean(bt?.hasManualAssignmentChange),
      assignmentChangeReason: norm(bt?.assignmentChangeReason || ""),
    };
  }

  function buildPayload() {
    const jour = getJourneeDate();
    const bts = (Array.isArray(state?.bts) ? state.bts : []).map(buildBtSnapshot);
    const modifiedBtCount = bts.filter((bt) => bt.hasManualAssignmentChange).length;
    const nowIso = new Date().toISOString();

    return {
      source: {
        pdfName: state?.pdfName || "",
        importedAt: state?.journee?.source?.importedAt || nowIso,
      },
      bts,
      meta: {
        jour,
        site: state?.journee?.site || DEFAULT_SITE,
        btCount: bts.length,
        modifiedBtCount,
        lastBriefUpdateAt: nowIso,
      },
    };
  }

  function hydrateBt(bt) {
    const teamOriginal = cloneTeam(bt?.teamOriginal || bt?.team || []);
    const teamCurrent = cloneTeam(bt?.teamCurrent || bt?.team || []);
    const hasManualAssignmentChange = Boolean(
      bt?.hasManualAssignmentChange ||
      JSON.stringify(teamOriginal) !== JSON.stringify(teamCurrent)
    );

    return {
      ...bt,
      badges: Array.isArray(bt?.badges) ? [...bt.badges] : [],
      docs: normalizeDocs(bt?.docs),
      objet: norm(bt?.objet || ""),
      localisation: norm(bt?.localisation || ""),
      teamOriginal,
      teamCurrent,
      team: teamCurrent,
      hasManualAssignmentChange,
      assignmentChangeReason: norm(bt?.assignmentChangeReason || ""),
    };
  }

  function hydrateRecord(record) {
    const payload = record?.payload && typeof record.payload === "object" ? record.payload : {};
    const source = payload?.source && typeof payload.source === "object" ? payload.source : {};
    const meta = payload?.meta && typeof payload.meta === "object" ? payload.meta : {};
    const bts = Array.isArray(payload?.bts) ? payload.bts.map(hydrateBt) : [];

    state.bts = bts;
    state.pdfName = source.pdfName || state.pdfName || "";
    state.pdf = null;
    state.pdfFile = null;
    state.totalPages = 0;

    state.journee = {
      ...state.journee,
      jour: record?.jour || meta.jour || getJourneeDate(),
      site: record?.site || meta.site || state?.journee?.site || DEFAULT_SITE,
      status: record?.statut || state?.journee?.status || "draft",
      source: {
        pdfName: source.pdfName || "",
        importedAt: source.importedAt || null,
      },
      remote: {
        id: record?.id || null,
        updatedAt: record?.updated_at || null,
        updatedBy: record?.updated_by || null,
        loadedAt: new Date().toISOString(),
      },
    };

    if (typeof rebuildTechCountsFromBts === "function") {
      rebuildTechCountsFromBts();
    }

    if (typeof setPdfStatus === "function") {
      setPdfStatus(state.pdfName || "Aucun PDF");
    }

    return bts;
  }

  window.BriefJournee = {
    DEFAULT_SITE,
    todayISO,
    getJourneeDate,
    buildPayload,
    hydrateRecord,
  };
})();
