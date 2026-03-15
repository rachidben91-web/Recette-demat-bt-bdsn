// js/ui/support-history.js
// Sous-module historique/statistiques du Support Journée

(function () {
    function createSupportHistoryModule(deps) {
        const {
            getHistory,
            setHistory,
            getSortState,
            setSortState,
            getSupportTechDisplayName,
            normalizeSupportTechId,
        } = deps;

        async function loadHistoryFromSupabase() {
            if (!window.SupportStore || !window.supabaseClient) {
                console.warn("[SUPPORT] Supabase non disponible — historique depuis localStorage uniquement.");
                return;
            }

            const { data: authData } = await window.supabaseClient.auth.getUser();
            if (!authData?.user) {
                console.warn("[SUPPORT] Non connecté — historique depuis localStorage uniquement.");
                return;
            }

            try {
                const { data: rows, error } = await window.supabaseClient
                    .from("support_journee")
                    .select("jour, payload")
                    .eq("site", "VLG")
                    .order("jour", { ascending: false })
                    .limit(90);

                if (error) throw error;
                if (!rows || rows.length === 0) {
                    console.log("[SUPPORT] Aucune donnée Supabase pour l'historique.");
                    return;
                }

                const newHistory = [];
                for (const row of rows) {
                    const data = row.payload || {};
                    const jour = row.jour;
                    Object.keys(data).forEach((agentKey) => {
                        if (agentKey === '__GLOBAL_OBS' || agentKey === '__PARAM_ACTIVITIES' || agentKey === '_meta' || agentKey === '_lock') return;
                        const d = data[agentKey];
                        if (d && (d.act || d.obs || d.briefA === 'OUI' || d.Grv === 'OUI' || d.greve === 'OUI')) {
                            newHistory.push({
                                date: jour,
                                agent: getSupportTechDisplayName(agentKey, agentKey),
                                agentId: normalizeSupportTechId(agentKey),
                                act: d.act || '',
                                obs: d.obs || '',
                                brief: (d.briefA === 'OUI' || d.briefD === 'OUI') ? 'OK' : '',
                                debrief: (d.debriefA === 'OUI' || d.debriefD === 'OUI') ? 'OK' : ''
                            });
                        }
                    });
                    localStorage.setItem('demat_day_' + jour, JSON.stringify(data));
                }

                setHistory(newHistory);
                localStorage.setItem('demat_history', JSON.stringify(newHistory));

                console.log(`[SUPPORT] ☁️ Historique reconstruit depuis Supabase : ${rows.length} jours, ${newHistory.length} lignes.`);
            } catch (e) {
                console.error("[SUPPORT] ❌ Erreur chargement historique Supabase :", e.message);
            }
        }

        function renderStats() {
            const history = getHistory();
            const uniqueDays = new Set(history.map(h => h.date)).size;

            const elDays = document.getElementById('statDays');
            const elRecs = document.getElementById('statRecords');
            const elTop = document.getElementById('statTopAct');

            if (elDays) elDays.textContent = uniqueDays;
            if (elRecs) elRecs.textContent = history.length;

            const counts = {};
            history.forEach((h) => {
                if (h.act) counts[h.act] = (counts[h.act] || 0) + 1;
            });
            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
            if (elTop) elTop.textContent = top ? `${top[0]} (${top[1]})` : '-';

            const select = document.getElementById('histFilterAgent');
            if (select && select.options.length <= 1 && Array.isArray(window.TECHNICIANS)) {
                window.TECHNICIANS.forEach((tech) => {
                    const option = document.createElement('option');
                    option.value = tech.name || '';
                    option.textContent = tech.name || '';
                    select.appendChild(option);
                });
            }
        }

        function renderHistory() {
            const tbody = document.getElementById('historyTableBody');
            if (!tbody) return;

            const fAgent = document.getElementById('histFilterAgent')?.value || '';
            const fFrom = document.getElementById('histDateFrom')?.value || '';
            const fTo = document.getElementById('histDateTo')?.value || '';

            let data = [...getHistory()];
            if (fAgent) data = data.filter((h) => h.agent === fAgent);
            if (fFrom) data = data.filter((h) => h.date >= fFrom);
            if (fTo) data = data.filter((h) => h.date <= fTo);

            const { sortKey, sortDir } = getSortState();
            data.sort((a, b) => {
                const valA = a[sortKey] || '';
                const valB = b[sortKey] || '';
                return valA.localeCompare(valB) * sortDir;
            });

            const renderSafeText = (value, fallback = '') => {
                const normalized = String(value || '').trim();
                return normalized ? normalized : fallback;
            };

            tbody.replaceChildren();

            for (const h of data) {
                const tr = document.createElement('tr');

                const dateTd = document.createElement('td');
                dateTd.textContent = renderSafeText(h.date, '-');

                const agentTd = document.createElement('td');
                agentTd.style.fontWeight = 'bold';
                agentTd.textContent = renderSafeText(h.agent, '-');

                const actTd = document.createElement('td');
                const actBadge = document.createElement('span');
                actBadge.style.padding = '2px 6px';
                actBadge.style.borderRadius = '4px';
                actBadge.style.background = '#f1f5f9';
                actBadge.style.fontSize = '11px';
                actBadge.textContent = renderSafeText(h.act, '-');
                actTd.appendChild(actBadge);

                const obsTd = document.createElement('td');
                obsTd.style.color = 'var(--muted)';
                obsTd.style.fontStyle = 'italic';
                obsTd.style.fontSize = '11px';
                obsTd.textContent = renderSafeText(h.obs, '');

                const briefTd = document.createElement('td');
                briefTd.style.textAlign = 'center';
                briefTd.textContent = renderSafeText(h.brief, '');

                const debriefTd = document.createElement('td');
                debriefTd.style.textAlign = 'center';
                debriefTd.textContent = renderSafeText(h.debrief, '');

                tr.append(dateTd, agentTd, actTd, obsTd, briefTd, debriefTd);
                tbody.appendChild(tr);
            }

            renderStats();
        }

        function sortHistory(key) {
            const current = getSortState();
            if (current.sortKey === key) {
                setSortState({ sortKey: key, sortDir: current.sortDir * -1 });
            } else {
                setSortState({ sortKey: key, sortDir: 1 });
            }
            renderHistory();
        }

        return {
            loadHistoryFromSupabase,
            renderStats,
            renderHistory,
            sortHistory,
        };
    }

    window.createSupportHistoryModule = createSupportHistoryModule;
})();
