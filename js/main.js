// js/main.js — DEMAT-BT v11.8.0 — 14/03/2026
// Point d'entrée principal
// FIX v11.2.0: renderAll alias, weather init, refreshAllViews
// FIX v11.4.0: Modal event listeners + loadBadgeRules() + loadBadgeRules avant cache

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DEMAT-BT v11.8.0 démarré.");

    // ============================================================
    // HELPERS UI attendus par pdf-extractor.js
    // ============================================================
    window.setZonesStatus = function (msg) {
        const el = document.getElementById('zonesStatus');
        const badge = document.getElementById('zonesBadge');
        if (el) el.textContent = msg;
        if (badge) badge.classList.toggle('status--ok', msg === 'OK');
    };
    window.setPdfStatus = function (msg) {
        const el = document.getElementById('pdfStatus');
        const badge = document.getElementById('pdfBadge');
        const raw = String(msg || "");
        let display = raw;

        if (raw && raw !== "Aucun PDF" && raw !== "Aucun PDF chargé" && !raw.toLowerCase().includes('erreur')) {
            const day = (typeof extractDayFromFilename === 'function') ? extractDayFromFilename(raw) : null;
            display = day ? `Journée du ${day}` : "PDF chargé (date non détectée)";
        }

        if (el) el.textContent = display;
        const ok = msg && msg !== 'Aucun PDF' && msg !== 'Aucun PDF chargé' && !msg.toLowerCase().includes('erreur');
        if (badge) badge.classList.toggle('status--loaded', !!ok);
    };
    window.setProgress = function (pct, msg) {
        const bar = document.getElementById('progBar');
        const m = document.getElementById('progMsg');
        const badge = document.getElementById('progressBadge');
        if (bar) bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        if (m && msg != null) m.textContent = msg;
        if (badge) {
            const active = msg && (msg.includes('Analyse') || msg.includes('Extraction') || msg.includes('Chargement'));
            const complete = msg && (msg.includes('Terminé') || msg.includes('détectés'));
            badge.classList.toggle('status--active', !!active);
            badge.classList.toggle('status--complete', !!complete);
        }
    };
    window.setExtractEnabled = function (enabled) {
        const btn = document.getElementById('btnExtract');
        if (!btn) return;
        const connected = window.__SUPPORT_AUTH_CONNECTED === true;
        const canExtract = connected && !!enabled && !!state?.pdf;
        btn.disabled = !canExtract;
        btn.classList.toggle('btn--disabled', !canExtract);
        btn.classList.toggle('sidebar-step--disabled', !canExtract);
        btn.title = connected
            ? (canExtract ? "Extraire les BT du PDF chargé" : "Importe d'abord un PDF valide pour extraire les BT")
            : "Connecte-toi pour importer et extraire les BT";
    };

    function updatePreparationControls() {
        const connected = window.__SUPPORT_AUTH_CONNECTED === true;
        const hasPdf = !!state?.pdf;
        const pdfInput = document.getElementById('pdfFile');
        const importStep = document.querySelector('.sidebar-step--secondary');

        if (pdfInput) {
            pdfInput.disabled = !connected;
        }

        if (importStep) {
            importStep.classList.toggle('sidebar-step--disabled', !connected);
            importStep.setAttribute('aria-disabled', connected ? 'false' : 'true');
            importStep.title = connected
                ? "Importer le PDF du jour"
                : "Connecte-toi pour importer le PDF du jour";
        }

        window.setExtractEnabled(connected && hasPdf);
    }

    // ============================================================
    // 1. INITIALISATION DES MODULES & DONNÉES
    // ============================================================

    // Initialiser l'état global
    if (window.State && window.State.init) window.State.init();

    // ── MÉTÉO ──────────────────────────────────────────────────
    if (typeof updateDateTime === 'function') {
        updateDateTime();
        setInterval(updateDateTime, 1000);
        console.log("[MAIN] ✅ DateTime initialisé");
    }
    if (typeof updateWeather === 'function') {
        updateWeather();
        setInterval(updateWeather, 10 * 60 * 1000);
        console.log("[MAIN] ✅ Météo initialisée");
    }

    // Sidebar & Cache
    if (window.Sidebar && window.Sidebar.init) window.Sidebar.init();
    if (window.Cache && window.Cache.init) window.Cache.init();

    // Charger zones.json
    if (window.loadZones) window.loadZones().catch(err => console.error("[MAIN] Erreur zones:", err));

    // ── FIX v11.4.0 : Charger les règles badges AVANT la restauration du cache ──
    // Sans ça, BADGE_RULES reste null → timeline affiche tout en "AUTRES"
    const badgeRulesReady = (typeof loadBadgeRules === 'function')
        ? loadBadgeRules().then(() => console.log("[MAIN] ✅ Badge rules chargées"))
                          .catch(err => console.warn("[MAIN] ⚠️ Badge rules non chargées:", err))
        : Promise.resolve();

    // ============================================================
    // 2. FONCTIONS DE RENDU GLOBAL
    // ============================================================

    function refreshAllViews() {
        console.log("[MAIN] refreshAllViews()");

        const filtered = (typeof filterBTs === 'function') ? filterBTs() : (state.bts || []);

        // Sidebar
        if (typeof renderKpis === 'function') renderKpis(filtered);
        if (typeof buildTypeChips === 'function') buildTypeChips();
        if (typeof renderTechList === 'function') renderTechList();

        // Grille vignettes
        const gridEl = document.getElementById('btGrid');
        if (gridEl && typeof renderGrid === 'function') {
            renderGrid(filtered, gridEl);
        }

        // Timeline / Catégories
        if (typeof renderTimeline === 'function') {
            renderTimeline(filtered);
        }

        // Brief (Flip)
        if (typeof renderBrief === 'function') {
            renderBrief(filtered);
        }
    }

    // ── Alias globaux pour compatibilité ──
    window.renderAll = refreshAllViews;
    window.refreshAllViews = refreshAllViews;
    window.updatePreparationControls = updatePreparationControls;

    function formatJourneeLabel(jourIso) {
        const match = String(jourIso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return jourIso || "Date inconnue";
        return `${match[3]}/${match[2]}/${match[1]}`;
    }

    function updateSavedJourneeStatus(text) {
        const el = document.getElementById('savedJourneeStatus');
        if (el) el.textContent = text;
    }

    function fillSavedJourneeOptions(items) {
        const select = document.getElementById('savedJourneeSelect');
        const btnLoad = document.getElementById('btnLoadJournee');
        if (!select) return;

        const rows = Array.isArray(items) ? items : [];
        select.innerHTML = "";

        if (rows.length === 0) {
            select.innerHTML = '<option value="">— Aucune journée sauvegardée —</option>';
            select.disabled = true;
            if (btnLoad) btnLoad.disabled = true;
            updateSavedJourneeStatus("Aucune journée sauvegardée pour ce site.");
            return;
        }

        for (const row of rows) {
            const option = document.createElement('option');
            option.value = row.jour;
            option.textContent = `${formatJourneeLabel(row.jour)} — ${row.btCount} BT`;
            option.dataset.btCount = String(row.btCount || 0);
            option.dataset.modifiedBtCount = String(row.modifiedBtCount || 0);
            option.dataset.pendingO2Count = String(row.pendingO2Count || 0);
            option.dataset.doneO2Count = String(row.doneO2Count || 0);
            select.appendChild(option);
        }

        if (state?.journee?.jour) {
            select.value = state.journee.jour;
        }
        if (!select.value && rows[0]?.jour) {
            select.value = rows[0].jour;
        }

        select.disabled = false;
        if (btnLoad) btnLoad.disabled = !select.value;

        const current = rows.find((row) => row.jour === select.value) || rows[0];
        if (current) {
            updateSavedJourneeStatus(
                `Dernière sélection : ${formatJourneeLabel(current.jour)} — ${current.btCount} BT, ${current.modifiedBtCount} modifié(s), ${current.pendingO2Count} à reporter, ${current.doneO2Count} O2 OK.`
            );
        }
    }

    async function refreshSavedJournees() {
        const select = document.getElementById('savedJourneeSelect');
        const btnRefresh = document.getElementById('btnRefreshJournees');
        const btnLoad = document.getElementById('btnLoadJournee');

        if (!select || !btnRefresh || !btnLoad) return [];

        if (!window.BriefStore || window.__SUPPORT_AUTH_CONNECTED !== true) {
            select.innerHTML = '<option value="">— Connecte-toi pour afficher les journées —</option>';
            select.disabled = true;
            btnRefresh.disabled = true;
            btnLoad.disabled = true;
            updateSavedJourneeStatus("Connecte-toi pour lister les journées sauvegardées.");
            return [];
        }

        btnRefresh.disabled = true;
        updateSavedJourneeStatus("Chargement des journées sauvegardées…");

        try {
            const rows = await window.BriefStore.listJournees({
                site: state?.journee?.site || window.BriefStore.SITE || "VLG",
                limit: 60,
            });
            fillSavedJourneeOptions(rows);
            btnRefresh.disabled = false;
            return rows;
        } catch (err) {
            console.warn("[MAIN] Liste brief_journee impossible:", err);
            select.innerHTML = '<option value="">— Erreur de chargement —</option>';
            select.disabled = true;
            btnRefresh.disabled = false;
            btnLoad.disabled = true;
            updateSavedJourneeStatus(`Erreur de chargement : ${err?.message || err}`);
            return [];
        }
    }

    async function tryLoadRemoteBriefJournee({ force = false } = {}) {
        if (!window.BriefStore || !window.BriefJournee) return false;
        if (window.__SUPPORT_AUTH_CONNECTED !== true) return false;
        if (!force && Array.isArray(state.bts) && state.bts.length > 0) return false;

        const jour = window.BriefJournee.getJourneeDate();
        const site = state?.journee?.site || window.BriefStore.SITE || "VLG";

        try {
            const record = await window.BriefStore.loadJournee({ jour, site });
            if (!record?.payload?.bts?.length) return false;

            window.BriefJournee.hydrateRecord(record);
            setProgress(0, `☁️ Journée chargée : ${record.payload.bts.length} BT`);
            refreshAllViews();
            refreshSavedJournees();
            return true;
        } catch (err) {
            console.warn("[MAIN] Chargement brief_journee impossible:", err);
            return false;
        }
    }

    async function saveCurrentBriefJournee({ silent = false } = {}) {
        if (!window.BriefStore || !window.BriefJournee) return null;
        if (window.__SUPPORT_AUTH_CONNECTED !== true) return null;
        if (!Array.isArray(state.bts) || state.bts.length === 0) return null;

        const jour = window.BriefJournee.getJourneeDate();
        const site = state?.journee?.site || window.BriefStore.SITE || "VLG";
        const payload = window.BriefJournee.buildPayload();

        try {
            const saved = await window.BriefStore.saveJournee(payload, { jour, site, statut: "draft" });
            state.journee = {
                ...state.journee,
                jour: saved?.jour || jour,
                site: saved?.site || site,
                status: saved?.statut || "draft",
                source: {
                    pdfName: payload?.source?.pdfName || state?.pdfName || "",
                    importedAt: payload?.source?.importedAt || null,
                },
                remote: {
                    id: saved?.id || null,
                    updatedAt: saved?.updated_at || null,
                    updatedBy: saved?.updated_by || null,
                    loadedAt: new Date().toISOString(),
                }
            };

            if (!silent) {
                setProgress(100, `💾 Journée sauvegardée : ${payload.meta.btCount} BT`);
            }
            refreshSavedJournees();
            return saved;
        } catch (err) {
            console.warn("[MAIN] Sauvegarde brief_journee impossible:", err);
            if (!silent) {
                alert(`Sauvegarde distante impossible : ${err?.message || err}`);
            }
            return null;
        }
    }

    window.tryLoadRemoteBriefJournee = tryLoadRemoteBriefJournee;
    window.saveCurrentBriefJournee = saveCurrentBriefJournee;
    window.refreshSavedJournees = refreshSavedJournees;

    // ============================================================
    // 3. NAVIGATION (Référent / Brief / Support)
    // ============================================================

    window.switchView = function(viewName) {
        console.log("Navigation vers :", viewName);

        if (viewName === 'support' && window.__SUPPORT_AUTH_CONNECTED !== true) {
            console.warn("[MAIN] Accès support bloqué: utilisateur non connecté.");
            alert("Veuillez vous connecter pour accéder au Support Journée.");
            const authBtn = document.getElementById('btnAuth');
            if (authBtn && authBtn.dataset.state === 'in') {
                authBtn.click();
            }
            return;
        }

        // Cacher toutes les vues
        document.querySelectorAll('.view').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('view--active');
        });

        // Désactiver tous les boutons
        document.querySelectorAll('.seg__btn[data-view]').forEach(btn => btn.classList.remove('seg__btn--active'));

        // Afficher la vue demandée
        let targetId = '';
        if (viewName === 'referent') targetId = 'viewReferent';
        else if (viewName === 'brief') targetId = 'viewBrief';
        else if (viewName === 'support') targetId = 'viewSupport';

        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.style.display = 'block';
            targetEl.classList.add('view--active');
        }

        if (viewName === 'referent' || viewName === 'brief') {
            const activeBtn = document.querySelector(`.seg__btn[data-view="${viewName}"]`);
            if (activeBtn) activeBtn.classList.add('seg__btn--active');
            document.body.classList.toggle('flip', viewName === 'brief');
            refreshAllViews();
        } else {
            document.body.classList.remove('flip');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Sous-vues (Vignettes / Catégories)
    document.querySelectorAll('#referentLayoutSwitch .seg__btn[data-layout]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const currentBtn = e.currentTarget;
            const parent = currentBtn.parentElement;
            if (parent) parent.querySelectorAll('.seg__btn').forEach(b => b.classList.remove('seg__btn--active'));
            currentBtn.classList.add('seg__btn--active');

            const layout = currentBtn.dataset.layout;
            const gridEl = document.getElementById('btGrid');
            const timelineEl = document.getElementById('btTimeline');
            state.layout = layout || 'grid';

            if (gridEl && timelineEl) {
                if (layout === 'grid') {
                    gridEl.style.display = '';
                    timelineEl.style.display = 'none';
                } else {
                    gridEl.style.display = 'none';
                    timelineEl.style.display = 'block';
                }
            }
        });
    });

    // Modes d'affichage BT en vue Référent (grandes/petites/listes)
    const DISPLAY_MODE_KEY = 'dematbt_referent_display_mode';
    const allowedDisplayModes = new Set(['large', 'small', 'list']);

    function applyReferentDisplayMode(mode) {
        const safeMode = allowedDisplayModes.has(mode) ? mode : 'large';
        state.referentDisplayMode = safeMode;

        document.querySelectorAll('#referentDisplayModeSwitch .seg__btn[data-display-mode]').forEach(btn => {
            btn.classList.toggle('seg__btn--active', btn.dataset.displayMode === safeMode);
        });

        const gridEl = document.getElementById('btGrid');
        if (gridEl) {
            gridEl.classList.remove('grid--large', 'grid--small', 'grid--list', 'grid--grouped-small', 'grid--grouped-large');
            const rootModeClass = safeMode === 'list'
                ? 'grid--list'
                : (safeMode === 'small' ? 'grid--grouped-small' : 'grid--grouped-large');
            gridEl.classList.add(rootModeClass);
        }

        localStorage.setItem(DISPLAY_MODE_KEY, safeMode);
        refreshAllViews();
    }

    const savedDisplayMode = localStorage.getItem(DISPLAY_MODE_KEY);
    applyReferentDisplayMode(savedDisplayMode || state.referentDisplayMode || 'large');

    document.querySelectorAll('#referentDisplayModeSwitch .seg__btn[data-display-mode]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            applyReferentDisplayMode(e.currentTarget.dataset.displayMode || 'large');
        });
    });

    // ============================================================
    // 4. ÉVÉNEMENTS GLOBAUX (Recherche, Filtres, PDF)
    // ============================================================

    // Recherche
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.filters.q = e.target.value;
            refreshAllViews();
        });
    }

    // Sélecteur Technicien
    const techSelect = document.getElementById('techSelect');
    if (techSelect) {
        techSelect.addEventListener('change', (e) => {
            state.filters.techId = e.target.value || "";
            refreshAllViews();
        });
    }

    // Import PDF
    const pdfInput = document.getElementById('pdfFile');
    if (pdfInput) {
        pdfInput.addEventListener('click', (e) => {
            if (window.__SUPPORT_AUTH_CONNECTED !== true) {
                e.preventDefault();
                alert("Veuillez vous connecter pour importer le PDF du jour.");
            }
        });
        pdfInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                if (window.PdfExtractor) {
                    window.PdfExtractor.processFile(file).then(() => {
                        updatePreparationControls();
                        refreshAllViews();
                    });
                }
            }
        });
    }

    // Bouton Extraire
    const btnExtract = document.getElementById('btnExtract');
    if (btnExtract) {
        btnExtract.addEventListener('click', () => {
            if (window.__SUPPORT_AUTH_CONNECTED !== true) {
                alert("Veuillez vous connecter pour extraire les BT.");
                return;
            }
            if (!state?.pdf) {
                alert("Importe d'abord un PDF valide avant de lancer l'extraction.");
                return;
            }
            if (window.PdfExtractor) {
                window.PdfExtractor.runExtraction().then(() => {
                    updatePreparationControls();
                    refreshAllViews();
                });
            }
        });
    }

    // Vider le Cache
    const btnClearCache = document.getElementById('btnClearCache');
    if (btnClearCache) {
        btnClearCache.addEventListener('click', async () => {
            if (confirm("Attention : Cela effacera toutes les données importées (PDF, Zones). Continuer ?")) {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i += 1) {
                    const key = localStorage.key(i) || "";
                    if (key.startsWith("demat_") || key.startsWith("dematbt_")) {
                        keysToRemove.push(key);
                    }
                }
                keysToRemove.forEach((k) => localStorage.removeItem(k));
                if (typeof clearCache === "function") {
                    await clearCache();
                }
                location.reload();
            }
        });
    }

    const o2StatusSelect = document.getElementById('o2StatusSelect');
    if (o2StatusSelect) {
        o2StatusSelect.value = state.filters.o2Status || 'all';
        o2StatusSelect.addEventListener('change', (e) => {
            state.filters.o2Status = e.target.value || 'all';
            refreshAllViews();
        });
    }

    const savedJourneeSelect = document.getElementById('savedJourneeSelect');
    if (savedJourneeSelect) {
        savedJourneeSelect.addEventListener('change', (e) => {
            const value = e.target.value || "";
            const btnLoad = document.getElementById('btnLoadJournee');
            if (btnLoad) btnLoad.disabled = !value;

            const option = e.target.selectedOptions?.[0];
            if (option && value) {
                updateSavedJourneeStatus(
                    `Sélection : ${formatJourneeLabel(value)} — ${option.dataset.btCount || "0"} BT, ${option.dataset.modifiedBtCount || "0"} modifié(s), ${option.dataset.pendingO2Count || "0"} à reporter, ${option.dataset.doneO2Count || "0"} O2 OK.`
                );
            }
        });
    }

    const btnRefreshJournees = document.getElementById('btnRefreshJournees');
    if (btnRefreshJournees) {
        btnRefreshJournees.addEventListener('click', () => {
            refreshSavedJournees();
        });
    }

    const btnLoadJournee = document.getElementById('btnLoadJournee');
    if (btnLoadJournee) {
        btnLoadJournee.addEventListener('click', async () => {
            const select = document.getElementById('savedJourneeSelect');
            const jour = select?.value || "";
            const site = state?.journee?.site || window.BriefStore?.SITE || "VLG";
            if (!jour || !window.BriefStore || !window.BriefJournee) return;

            if (Array.isArray(state.bts) && state.bts.length > 0) {
                const ok = confirm("Charger une autre journée remplacera l'affichage courant. Continuer ?");
                if (!ok) return;
            }

            try {
                updateSavedJourneeStatus(`Chargement de la journée ${formatJourneeLabel(jour)}…`);
                const record = await window.BriefStore.loadJournee({ jour, site });
                if (!record?.payload?.bts?.length) {
                    updateSavedJourneeStatus("Aucune donnée BT trouvée pour cette journée.");
                    return;
                }
                window.BriefJournee.hydrateRecord(record);
                setProgress(0, `☁️ Journée chargée : ${record.payload.bts.length} BT`);
                refreshAllViews();
                refreshSavedJournees();
            } catch (err) {
                console.warn("[MAIN] Chargement manuel brief_journee impossible:", err);
                updateSavedJourneeStatus(`Erreur de chargement : ${err?.message || err}`);
            }
        });
    }

    // Fullscreen
    const btnFullscreen = document.getElementById('btnFullscreen');
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.error(err));
            } else {
                document.exitFullscreen();
            }
        });
    }

    // ============================================================
    // 5. MODAL — Événements des boutons (FIX v11.4.0)
    // ============================================================

    // Bouton Page Précédente
    const btnPrev = document.getElementById('btnPrevPage');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            if (typeof prevPage === 'function') prevPage();
        });
    }

    // Bouton Page Suivante
    const btnNext = document.getElementById('btnNextPage');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            if (typeof nextPage === 'function') nextPage();
        });
    }

    // Bouton Export PDF
    const btnExport = document.getElementById('btnExportBt');
    if (btnExport) {
        btnExport.addEventListener('click', () => {
            if (typeof exportBTPDF === 'function') exportBTPDF();
        });
    }

    // Bouton Export Journée (Brief)
    const btnExportDay = document.getElementById('btnExportDay');
    if (btnExportDay) {
        btnExportDay.addEventListener('click', async () => {
            if (typeof exportDayPdfAndPrepareMail === 'function') {
                await exportDayPdfAndPrepareMail();
            } else if (typeof exportDayPDF === 'function') {
                await exportDayPDF();
            }
        });
    }

    // Bouton Fermer + Backdrop (tous les éléments data-close)
    document.querySelectorAll('[data-close]').forEach(el => {
        el.addEventListener('click', () => {
            if (typeof closeModal === 'function') closeModal();
        });
    });

    // Fermer modal avec Échap
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.modal && state.modal.open) {
            if (typeof closeModal === 'function') closeModal();
        }
    });

    // ============================================================
    // 6. RESTAURATION DU CACHE AU DÉMARRAGE
    // ============================================================

    // On attend que les badge rules soient chargées AVANT de restaurer le cache
    // Sinon la timeline affiche tout en "AUTRES"
    badgeRulesReady.then(() => {
        if (typeof loadFromCache === 'function') {
            loadFromCache().then(restored => {
                updatePreparationControls();
                if (restored) {
                    console.log("[MAIN] ✅ Cache restauré, lancement du rendu");
                    refreshAllViews();
                } else if (window.__SUPPORT_AUTH_CONNECTED === true) {
                    tryLoadRemoteBriefJournee({ force: true });
                }
                refreshSavedJournees();
            }).catch(err => console.warn("[MAIN] Cache non restauré:", err));
        }

        // Vue par défaut
        switchView('referent');
        updatePreparationControls();
        console.log("[MAIN] ✅ Initialisation terminée");
    });

    window.addEventListener("demat:auth-changed", (event) => {
        updatePreparationControls();
        if (event?.detail?.connected) {
            tryLoadRemoteBriefJournee({ force: false });
            refreshSavedJournees();
        } else {
            refreshSavedJournees();
        }
    });
});
