// js/main.js
// Point d'entrée principal de l'application Demat-BT

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 DEMAT-BT v11.0 démarré.");

    // ============================================================
    // PATCH RECETTE v11.1.2 — helpers UI attendus par pdf-extractor.js
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

    // Initialiser les modules UI (s'ils sont chargés)
    if (window.Weather && window.Weather.init) window.Weather.init();
    if (window.Sidebar && window.Sidebar.init) window.Sidebar.init();
    if (window.Cache && window.Cache.init) window.Cache.init();

    // Charger zones.json automatiquement (si dispo)
    if (window.loadZones) window.loadZones().catch(err => console.error(err));

    // Support Module s'auto-initialise, mais on peut forcer un check
    if (window.SupportModule && window.SupportModule.init) {
        // Déjà géré par le timeout dans support.js, mais ça ne fait pas de mal
    }

    // ============================================================
    // 2. NAVIGATION (C'est ici que le bouton Support est géré)
    // ============================================================

    // Fonction Globale pour changer de vue (accessible depuis le HTML)
    window.switchView = function(viewName) {
        console.log("Navigation vers :", viewName);

        // A. Cacher toutes les vues
        document.querySelectorAll('.view').forEach(el => {
            el.style.display = 'none';
            el.classList.remove('view--active');
        });

        // B. Désactiver tous les boutons de navigation (Haut et Gauche)
        document.querySelectorAll('.seg__btn').forEach(btn => btn.classList.remove('seg__btn--active'));
        
        // Note : Le bouton de la sidebar n'a pas la classe seg__btn, on le gère à part si besoin
        // ou on le laisse tel quel (il est stylisé différemment).

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
            
            // Rafraîchir les grilles si nécessaire
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
                if(layout === 'grid') {
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
    // 3. FONCTIONS GLOBALES (Recherche, Filtres, PDF)
    // ============================================================

    // Barre de Recherche
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (window.State) {
                window.State.setFilter('search', e.target.value);
                refreshAllViews();
            }
        });
    }

    // Sélecteur Technicien
    const techSelect = document.getElementById('techSelect');
    if (techSelect) {
        techSelect.addEventListener('change', (e) => {
            if (window.State) {
                window.State.setFilter('tech', e.target.value);
                refreshAllViews();
            }
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
            if(confirm("Attention : Cela effacera toutes les données importées (PDF, Zones). Continuer ?")) {
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
    // 4. BOUCLE DE RAFRAÎCHISSEMENT (The Loop)
    // ============================================================
    
    function refreshAllViews() {
        // Met à jour les vues existantes (Référent, Brief)
        if (window.Grid && window.Grid.render) window.Grid.render();
        if (window.Timeline && window.Timeline.render) window.Timeline.render();
        if (window.Brief && window.Brief.render) window.Brief.render();
        if (window.Sidebar && window.Sidebar.updateStats) window.Sidebar.updateStats();
    }

    // Lancer la vue par défaut au démarrage
    switchView('referent');
});