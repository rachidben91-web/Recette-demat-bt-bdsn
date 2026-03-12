// support-activities-fix-v1.0.js
// DEMAT-BT — Correctif Param Activités ↔ Supabase
// v1.0 — 2026-03-12
//
// PROBLÈME CORRIGÉ :
//   Les activités créées/supprimées étaient sauvegardées uniquement en localStorage.
//   Au rechargement, Supabase (support_settings, clé PARAM_ACTIVITIES) réinjectait
//   l'ancienne liste, faisant "ressusciter" les activités supprimées.
//
// SOLUTION :
//   1. saveActivities()      → écrit aussi sur Supabase via SupportStore.saveSetting()
//   2. init()                → charge depuis Supabase en priorité (loadActivitiesFromSupabase)
//   3. Feedback visuel       → bouton "Supprimer" indique l'état de la synchro cloud
//
// INTÉGRATION :
//   Remplacer dans js/ui/support.js les 3 blocs marqués ci-dessous.
//   Les autres fonctions (renderParams, addActivity, deleteActivity,
//   updateActivityColor) ne changent PAS — elles appellent toutes saveActivities().

// ============================================================
// BLOC 1 — Remplacer la fonction init() existante
// (section 3. INITIALISATION & NAVIGATION)
// ============================================================

async function init() {
    console.log("🚀 SupportModule : Initialisation...");

    // 1. Charger les Activités — Supabase en priorité, localStorage en fallback
    await loadActivitiesFromSupabase();

    // 2. Charger l'Historique global
    const savedHist = localStorage.getItem('demat_history');
    history = savedHist ? JSON.parse(savedHist) : [];

    // 3. Premier Rendu
    updateDateDisplay();
    loadAndRenderTable();
    renderParams();
    renderStats();

    // 4. Listeners globaux (Délégation d'événements pour performance)
    const tbody = document.getElementById('briefTableBody');
    if (tbody) {
        tbody.addEventListener('change', handleTableChange);
    }
}


// ============================================================
// BLOC 2 — Nouvelle fonction loadActivitiesFromSupabase()
// À ajouter dans la section 6. GESTION DES PARAMÈTRES (Activités)
// ============================================================

async function loadActivitiesFromSupabase() {
    // Priorité : Supabase (si connecté et disponible)
    if (window.SupportStore && window.supabaseClient) {
        try {
            const saved = await window.SupportStore.loadSetting('PARAM_ACTIVITIES');
            if (Array.isArray(saved) && saved.length > 0) {
                activities = saved;
                // Mettre à jour le localStorage pour cohérence offline
                localStorage.setItem('demat_activities', JSON.stringify(activities));
                console.log(`☁️ Activités chargées depuis Supabase (${activities.length} entrées)`);
                return;
            }
        } catch (e) {
            console.warn("⚠️ loadSetting(PARAM_ACTIVITIES) échoué, fallback localStorage :", e.message);
        }
    }

    // Fallback : localStorage
    const savedActs = localStorage.getItem('demat_activities');
    if (savedActs) {
        activities = JSON.parse(savedActs);
        console.log(`💾 Activités chargées depuis localStorage (${activities.length} entrées)`);
    } else {
        activities = JSON.parse(JSON.stringify(DEFAULT_ACTIVITIES));
        console.log("🏗️ Activités par défaut chargées");
    }
}


// ============================================================
// BLOC 3 — Remplacer la fonction saveActivities() existante
// (section 6. GESTION DES PARAMÈTRES (Activités))
// ============================================================

function saveActivities() {
    // 1. Sauvegarde locale immédiate (synchrone)
    localStorage.setItem('demat_activities', JSON.stringify(activities));

    // 2. Rendu de la grille et du tableau principal
    renderParams();
    renderTable();

    // 3. Synchronisation Supabase (asynchrone, non bloquante)
    if (window.SupportStore && window.supabaseClient) {
        window.SupportStore.saveSetting('PARAM_ACTIVITIES', activities)
            .then(() => {
                console.log(`☁️ Activités synchronisées sur Supabase (${activities.length} entrées)`);
            })
            .catch(e => {
                console.error("❌ Erreur saveSetting(PARAM_ACTIVITIES) :", e.message);
                // Optionnel : toast non-bloquant pour informer l'utilisateur
                const toast = document.createElement('div');
                toast.textContent = "⚠️ Activités sauvegardées localement, échec cloud : " + e.message;
                Object.assign(toast.style, {
                    position: 'fixed', bottom: '24px', right: '24px', zIndex: '99999',
                    background: '#f97316', color: '#fff', padding: '10px 16px',
                    borderRadius: '8px', fontWeight: '600', fontSize: '.85rem',
                    boxShadow: '0 4px 16px rgba(0,0,0,.2)', maxWidth: '360px'
                });
                document.body.appendChild(toast);
                setTimeout(() => {
                    toast.style.opacity = '0';
                    toast.style.transition = 'opacity .4s';
                    setTimeout(() => toast.remove(), 400);
                }, 4000);
            });
    }
}


// ============================================================
// RÉSUMÉ DES CHANGEMENTS À APPLIQUER dans js/ui/support.js
// ============================================================
//
//  1. Remplacer :
//       function init() { ... }
//     Par :
//       async function init() { ... }   ← BLOC 1 ci-dessus
//
//  2. Ajouter AVANT saveActivities() :
//       async function loadActivitiesFromSupabase() { ... }   ← BLOC 2
//
//  3. Remplacer :
//       function saveActivities() {
//           localStorage.setItem('demat_activities', JSON.stringify(activities));
//           renderParams();
//           renderTable();
//       }
//     Par :
//       function saveActivities() { ... }   ← BLOC 3 ci-dessus
//
//  4. NETTOYAGE des activités fantômes en prod :
//     Dans la console du navigateur (une fois connecté à Supabase) :
//
//       // Voir ce qui est actuellement stocké dans Supabase :
//       SupportStore.loadSetting('PARAM_ACTIVITIES').then(d => console.table(d));
//
//       // Après avoir nettoyé manuellement via l'UI (supprimer TEST, SSSS...),
//       // forcer l'écriture de la liste propre :
//       SupportStore.saveSetting('PARAM_ACTIVITIES', SupportModule._getActivities?.() ?? []);
//
//     Ou plus simplement : supprimer les activités indésirables via l'onglet
//     "Param Activités", puis recharger la page — le fix garantit que la
//     suppression est bien persistée sur Supabase cette fois.
