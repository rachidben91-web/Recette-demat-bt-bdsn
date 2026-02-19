// js/main.js — DEMAT-BT v11.2.0 — 19/02/2026
// Point d'entrée principal — CORRIGÉ : renderAll, Weather init, refreshAllViews
// FIX: renderAll is not defined, weather is not defined, grid vide, techniciens vide

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DEMAT-BT v11.2.0 démarré.");

    // ============================================================
    // PATCH RECETTE v11.2.0 — helpers UI attendus par pdf-extractor.js
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
    
    // Initialiser l'état global (State) si nécessaire
    if (window.State && window.State.init) window.State.init();

    // ── FIX MÉTÉO ──────────────────────────────────────────────
    // weather.js expose updateWeather() et updateDateTime() en global,
    // PAS un objet window.Weather. On appelle directement ces fonctions.
    if (typeof updateDateTime === 'function') {
        updateDateTime();
        setInterval(updateDateTime, 1000);
        console.log("[MAIN] ✅ DateTime initialisé");
    } else {
        console.warn("[MAIN] ⚠️ updateDateTime non trouvé (weather.js chargé ?)");
    }
    if (typeof updateWeather === 'function') {
        updateWeather();
        setInterval(updateWeather, 10 * 60 * 1000); // Rafraîchir toutes les 10 min
        console.log("[MAIN] ✅ Météo initialisée");
    } else {
        console.warn("[MAIN] ⚠️ updateWeather non trouvé (weather.js chargé ?)");
    }

    // Initialiser Sidebar si disponible
    if (window.Sidebar && window.Sidebar.init) window.Sidebar.init();

    // Initialiser Cache si disponible
    if (window.Cache && window.Cache.init) window.Cache.init();

    // Charger zones.json automatiquement (si dispo)
    if (window.loadZones) window.loadZones().catch(err => console.error("[MAIN] Erreur zones:", err));

    // Support Module s'auto-initialise via son DOMContentLoaded

    // ============================================================
    // 2. FONCTIONS DE RENDU GLOBAL
    // ============================================================

    /**
     * refreshAllViews() — Rafraîchit toutes les vues (Grid, Timeline, Brief, Sidebar)
     * C'est la fonction centrale appelée après chaque changement de données.
     */
    function refreshAllViews() {
        console.log("[MAIN] refreshAllViews() — rendu de toutes les vues");

        // 1. Filtrer les BT selon les filtres actifs
        const filtered = (typeof filterBTs === 'function') ? filterBTs() : (state.bts || []);

        // 2. Sidebar : KPIs + chips type + liste techniciens
        if (typeof renderKpis === 'function') renderKpis(filtered);
        if (typeof buildTypeChips === 'function') buildTypeChips();
        if (typeof renderTechList === 'function') renderTechList();

        // 3. Grille de vignettes
        const gridEl = document.getElementById('btGrid');
        if (gridEl && typeof renderGrid === 'function') {
            renderGrid(filtered, gridEl);
        }

        // 4. Timeline
        const timelineEl = document.getElementById('btTimeline');
        if (timelineEl && typeof renderTimeline === 'function') {
            renderTimeline(filtered, timelineEl);
        }

        // 5. Brief
        if (typeof renderBrief === 'function') {
            renderBrief(filtered);
        }
    }

    // ── FIX CRITIQUE : renderAll alias global ──────────────────
    // pdf-extractor.js et sidebar.js appellent renderAll() — on crée l'alias
    window.renderAll = refreshAllViews;
    window.refreshAllViews = refreshAllViews;

    // ============================================================
    // 3. NAVIGATION (Référent / Brief / Support)
    // ============================================================

    window.switchView = function(viewName) {
        console.log("Navigation vers :", viewName);

        // A. Cacher toutes les vues
        document.querySelectorAll('.view').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('view--active');
        });

        // B. Désactiver tous les boutons de navigation
        document.querySelectorAll('.seg__btn').forEach(btn => btn.classList.remove('seg__btn--active'));

        // C. Afficher la vue demandée
        let targetId = '';
        if (viewName === 'referent') targetId = 'viewReferent';
        else if (viewName === 'brief') targetId = 'viewBrief';
        else if (viewName === 'support') targetId = 'viewSupport';

        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            targetEl.style.display = 'block';
            targetEl.classList.add('view--active');
        }

        // D. Gestion spécifique selon la vue
        if (viewName === 'referent' || viewName === 'brief') {
            // Réactiver le bouton correspondant en haut
            const activeBtn = document.querySelector(`.seg__btn[data-view="${viewName}"]`);
            if (activeBtn) activeBtn.classList.add('seg__btn--active');
            
            // Mode Flip (Samsung) uniquement pour le brief
            document.body.classList.toggle('flip', viewName === 'brief');
            
            // Rafraîchir les grilles
            refreshAllViews();
        } else {
            // Pour le Support Journée
            document.body.classList.remove('flip');
        }
        
        // Remonter en haut de page
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Écouteurs pour les boutons du haut (Référent / Brief)
    document.querySelectorAll('.seg__btn[data-view]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchView(e.currentTarget.dataset.view);
        });
    });

    // Écouteurs pour les sous-vues (Vignettes / Catégories dans Référent)
    document.querySelectorAll('.seg__btn[data-layout]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Gestion active class
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
    // 4. FONCTIONS GLOBALES (Recherche, Filtres, PDF)
    // ============================================================

    // Barre de Recherche
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

    // Bouton Vider le Cache
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
    // 5. RESTAURATION DU CACHE AU DÉMARRAGE
    // ============================================================

    // Si le cache contient des BT, on les affiche immédiatement
    if (typeof loadFromCache === 'function') {
        loadFromCache().then(restored => {
            if (restored) {
                console.log("[MAIN] ✅ Cache restauré, lancement du rendu");
                refreshAllViews();
            }
        }).catch(err => console.warn("[MAIN] Cache non restauré:", err));
    }

    // Lancer la vue par défaut au démarrage
    switchView('referent');

    console.log("[MAIN] ✅ Initialisation terminée");
});
