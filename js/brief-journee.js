/* js/brief-journee.js — DEMAT-BT v11.8.0 — 14/03/2026
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

  function getAssignedTeam(bt) {
    if (Array.isArray(bt?.teamCurrent) && bt.teamCurrent.length > 0) return cloneTeam(bt.teamCurrent);
    if (Array.isArray(bt?.team) && bt.team.length > 0) return cloneTeam(bt.team);
    return [];
  }

  function getOriginalTeam(bt) {
    if (Array.isArray(bt?.teamOriginal) && bt.teamOriginal.length > 0) return cloneTeam(bt.teamOriginal);
    return cloneTeam(bt?.team || []);
  }

  function areTeamsEqual(a, b) {
    const left = cloneTeam(a);
    const right = cloneTeam(b);
    if (left.length !== right.length) return false;
    const normList = (items) => items
      .map((member) => `${member.nni}|${member.name}`.trim())
      .sort((x, y) => x.localeCompare(y, "fr", { sensitivity: "base" }));
    const la = normList(left);
    const lb = normList(right);
    return la.every((value, index) => value === lb[index]);
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
    const teamOriginal = getOriginalTeam(bt);
    const teamCurrent = getAssignedTeam(bt);
    const o2SyncStatus = String(bt?.o2SyncStatus || "").trim().toLowerCase();

    return {
      id: String(bt?.id || "").trim(),
      pageStart: Number(bt?.pageStart || 0) || null,
      badges: Array.isArray(bt?.badges) ? [...bt.badges] : [],
      datePrevue: norm(bt?.datePrevue || ""),
      objet: norm(bt?.objet || ""),
      client: norm(bt?.client || ""),
      localisation: norm(bt?.localisation || ""),
      atNum: norm(bt?.atNum || ""),
      designation: norm(bt?.designation || ""),
      duree: norm(bt?.duree || ""),
      analyseDesRisques: norm(bt?.analyseDesRisques || ""),
      observations: norm(bt?.observations || ""),
      docs: normalizeDocs(bt?.docs),
      teamOriginal,
      teamCurrent,
      hasManualAssignmentChange: Boolean(bt?.hasManualAssignmentChange || !areTeamsEqual(teamOriginal, teamCurrent)),
      assignmentChangeReason: norm(bt?.assignmentChangeReason || ""),
      o2SyncStatus: ["pending", "done"].includes(o2SyncStatus)
        ? o2SyncStatus
        : ((bt?.hasManualAssignmentChange || !areTeamsEqual(teamOriginal, teamCurrent)) ? "pending" : "none"),
      o2SyncedAt: bt?.o2SyncedAt || null,
    };
  }

  function buildPayload() {
    const jour = getJourneeDate();
    const bts = (Array.isArray(state?.bts) ? state.bts : []).map(buildBtSnapshot);
    const modifiedBtCount = bts.filter((bt) => bt.hasManualAssignmentChange).length;
    const pendingO2Count = bts.filter((bt) => bt.o2SyncStatus === "pending").length;
    const doneO2Count = bts.filter((bt) => bt.o2SyncStatus === "done").length;
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
        pendingO2Count,
        doneO2Count,
        lastBriefUpdateAt: nowIso,
      },
    };
  }

  function hydrateBt(bt) {
    const teamOriginal = getOriginalTeam(bt);
    const teamCurrent = getAssignedTeam(bt);
    const hasManualAssignmentChange = Boolean(
      bt?.hasManualAssignmentChange ||
      !areTeamsEqual(teamOriginal, teamCurrent)
    );
    const rawO2Status = String(bt?.o2SyncStatus || "").trim().toLowerCase();
    const o2SyncStatus = !hasManualAssignmentChange
      ? "none"
      : (rawO2Status === "done" ? "done" : "pending");

    return {
      ...bt,
      badges: Array.isArray(bt?.badges) ? [...bt.badges] : [],
      docs: normalizeDocs(bt?.docs),
      datePrevue: norm(bt?.datePrevue || ""),
      objet: norm(bt?.objet || ""),
      client: norm(bt?.client || ""),
      localisation: norm(bt?.localisation || ""),
      atNum: norm(bt?.atNum || ""),
      designation: norm(bt?.designation || ""),
      duree: norm(bt?.duree || ""),
      analyseDesRisques: norm(bt?.analyseDesRisques || ""),
      observations: norm(bt?.observations || ""),
      teamOriginal,
      teamCurrent,
      team: teamCurrent,
      hasManualAssignmentChange,
      assignmentChangeReason: norm(bt?.assignmentChangeReason || ""),
      o2SyncStatus,
      o2SyncedAt: bt?.o2SyncedAt || null,
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

  function setBtAssignment(bt, nextTeam, reason = "") {
    if (!bt || typeof bt !== "object") return bt;
    const original = getOriginalTeam(bt);
    const current = cloneTeam(nextTeam);
    bt.teamOriginal = original;
    bt.teamCurrent = current;
    bt.team = current;
    bt.hasManualAssignmentChange = !areTeamsEqual(original, current);
    bt.assignmentChangeReason = bt.hasManualAssignmentChange ? norm(reason || bt.assignmentChangeReason || "") : "";
    bt.o2SyncStatus = bt.hasManualAssignmentChange ? "pending" : "none";
    bt.o2SyncedAt = null;
    return bt;
  }

  function resetBtAssignment(bt) {
    if (!bt || typeof bt !== "object") return bt;
    const original = getOriginalTeam(bt);
    bt.teamOriginal = original;
    bt.teamCurrent = original;
    bt.team = original;
    bt.hasManualAssignmentChange = false;
    bt.assignmentChangeReason = "";
    bt.o2SyncStatus = "none";
    bt.o2SyncedAt = null;
    return bt;
  }

  function preserveBtAssignment(targetBt, sourceBt) {
    if (!targetBt || !sourceBt) return targetBt;
    const sourceOriginal = getOriginalTeam(sourceBt);
    const sourceCurrent = getAssignedTeam(sourceBt);
    targetBt.teamOriginal = sourceOriginal;
    targetBt.teamCurrent = sourceCurrent;
    targetBt.team = cloneTeam(sourceCurrent);
    targetBt.hasManualAssignmentChange = Boolean(
      sourceBt.hasManualAssignmentChange || !areTeamsEqual(sourceOriginal, sourceCurrent)
    );
    targetBt.assignmentChangeReason = norm(sourceBt.assignmentChangeReason || "");
    targetBt.o2SyncStatus = targetBt.hasManualAssignmentChange
      ? (String(sourceBt.o2SyncStatus || "").trim().toLowerCase() === "done" ? "done" : "pending")
      : "none";
    targetBt.o2SyncedAt = sourceBt.o2SyncedAt || null;
    return targetBt;
  }

  function mergeAssignmentsFromExisting(nextBts, existingBts) {
    const incoming = Array.isArray(nextBts) ? nextBts : [];
    const existing = Array.isArray(existingBts) ? existingBts : [];
    if (incoming.length === 0 || existing.length === 0) return incoming;

    const byId = new Map();
    for (const bt of existing) {
      const id = String(bt?.id || "").trim().toUpperCase();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, bt);
    }

    for (const bt of incoming) {
      const id = String(bt?.id || "").trim().toUpperCase();
      const previous = byId.get(id);
      if (!previous) continue;
      preserveBtAssignment(bt, previous);
    }

    return incoming;
  }

  function markBtO2Done(bt) {
    if (!bt || !bt.hasManualAssignmentChange) return bt;
    bt.o2SyncStatus = "done";
    bt.o2SyncedAt = new Date().toISOString();
    return bt;
  }

  function markBtO2Pending(bt) {
    if (!bt || !bt.hasManualAssignmentChange) return bt;
    bt.o2SyncStatus = "pending";
    bt.o2SyncedAt = null;
    return bt;
  }

  window.BriefJournee = {
    DEFAULT_SITE,
    todayISO,
    cloneTeam,
    getAssignedTeam,
    getOriginalTeam,
    areTeamsEqual,
    setBtAssignment,
    resetBtAssignment,
    preserveBtAssignment,
    mergeAssignmentsFromExisting,
    markBtO2Done,
    markBtO2Pending,
    getJourneeDate,
    buildPayload,
    hydrateRecord,
  };
})();
