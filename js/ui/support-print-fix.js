// js/ui/support-print-fix.js — v1.0 — 19/02/2026
// Patch automatique : colore le <td> parent des activités pour l'impression
// Chrome ne print pas le background des <select>, mais print celui des <td>
// 
// USAGE : Ajouter dans index.html JUSTE APRÈS support.js :
//   <script src="./js/ui/support-print-fix.js"></script>

(function() {
    'use strict';

    // On attend que le DOM soit prêt
    document.addEventListener('DOMContentLoaded', () => {
        // Délai pour s'assurer que SupportModule a déjà rendu le tableau
        setTimeout(applyActivityColorsToTD, 500);
    });

    /**
     * Parcourt toutes les cellules Activité et copie le background-color
     * du <select> vers le <td> parent.
     */
    function applyActivityColorsToTD() {
        const selects = document.querySelectorAll('table.brief-table .input-act');
        selects.forEach(sel => {
            const bg = sel.style.backgroundColor;
            if (bg && bg !== '' && bg !== 'transparent') {
                const td = sel.closest('td');
                if (td) {
                    td.style.backgroundColor = bg;
                }
            }
        });
        console.log(`[PRINT-FIX] ✅ ${selects.length} cellules activité colorées sur TD parent`);
    }

    // Observer les changements dans le tableau pour reappliquer les couleurs
    // (quand on change de jour, change d'activité, etc.)
    const observer = new MutationObserver(() => {
        // Petit délai pour laisser le DOM se stabiliser après le re-render
        clearTimeout(observer._timeout);
        observer._timeout = setTimeout(applyActivityColorsToTD, 100);
    });

    // On observe le tbody du tableau brief
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            const tbody = document.getElementById('briefTableBody');
            if (tbody) {
                observer.observe(tbody, { childList: true, subtree: true, attributes: true });
                console.log("[PRINT-FIX] ✅ Observer actif sur briefTableBody");
            }
        }, 600);
    });

    // Aussi intercepter les changements d'activité en temps réel
    document.addEventListener('change', (e) => {
        if (e.target && e.target.classList.contains('input-act')) {
            const sel = e.target;
            const td = sel.closest('td');
            if (td) {
                // Petit délai pour que le JS de support.js ait le temps de mettre à jour le style
                setTimeout(() => {
                    td.style.backgroundColor = sel.style.backgroundColor || '';
                }, 50);
            }
        }
    });

})();
