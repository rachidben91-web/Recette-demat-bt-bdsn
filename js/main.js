// js/main.js — DEMAT-BT v11.2.1 — 19/02/2026
// Point d'entrée principal
// FIX v11.2.0: renderAll alias, weather init, refreshAllViews
// FIX v11.2.1: Modal event listeners + loadBadgeRules() + loadBadgeRules avant cache

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DEMAT-BT v11.2.1 démarré.");

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
        if (el) el.textContent = msg;
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
        btn.disabled = !enabled;
        btn.classList.toggle('btn--disabled', !enabled);
    };

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

    // ── FIX v11.2.1 : Charger les règles badges AVANT la restauration du cache ──
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

    // ============================================================
    // 3. NAVIGATION (Référent / Brief / Support)
    // ============================================================

    window.switchView = function(viewName) {
        console.log("Navigation vers :", viewName);

        // Cacher toutes les vues
        document.querySelectorAll('.view').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('view--active');
        });

        // Désactiver tous les boutons
        document.querySelectorAll('.seg__btn').forEach(btn => btn.classList.remove('seg__btn--active'));

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
    document.querySelectorAll('.seg__btn[data-layout]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.parentElement.querySelectorAll('.seg__btn').forEach(b => b.classList.remove('seg__btn--active'));
            e.target.classList.add('seg__btn--active');

            const layout = e.currentTarget.dataset.layout;
            const gridEl = document.getElementById('btGrid');
            const timelineEl = document.getElementById('btTimeline');

            if (gridEl && timelineEl) {
                if (layout === 'grid') {
                    gridEl.style.display = 'grid';
                    timelineEl.style.display = 'none';
                } else {
                    gridEl.style.display = 'none';
                    timelineEl.style.display = 'block';
                }
            }
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
        pdfInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const file = e.target.files[0];
                if (window.PdfExtractor) {
                    window.PdfExtractor.processFile(file).then(() => {
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
            if (window.PdfExtractor) {
                window.PdfExtractor.runExtraction().then(() => {
                    refreshAllViews();
                });
            }
        });
    }

    // Vider le Cache
    const btnClearCache = document.getElementById('btnClearCache');
    if (btnClearCache) {
        btnClearCache.addEventListener('click', () => {
            if (confirm("Attention : Cela effacera toutes les données importées (PDF, Zones). Continuer ?")) {
                localStorage.clear();
                location.reload();
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
    // 5. MODAL — Événements des boutons (FIX v11.2.1)
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
                if (restored) {
                    console.log("[MAIN] ✅ Cache restauré, lancement du rendu");
                    refreshAllViews();
                }
            }).catch(err => console.warn("[MAIN] Cache non restauré:", err));
        }

        // Vue par défaut
        switchView('referent');
        console.log("[MAIN] ✅ Initialisation terminée");
    });
});
