// js/ui/support.js
// Module intégré Support Journée (Demat-BT v11)
// v1.2 — 2026-02-28
// FIX: formatDateKey utilise l'heure locale (fr-CA) pour éviter décalage UTC
// FIX: saveDay() synchronise sur Supabase (SupportStore.saveSupport) en plus du localStorage
// FIX: loadAndRenderTable() charge depuis Supabase si connecté, fallback localStorage
// NEW v1.2: loadHistoryFromSupabase() reconstruit history[] depuis TOUTES les lignes Supabase
//           → L'onglet Données & Historique affiche maintenant les données cross-session
//           → switchTab('tabHistory') déclenche un rechargement Supabase automatique

window.SupportModule = (function() {
    
    // ============================================================
    // 1. DONNÉES & CONFIGURATION
    // ============================================================
    
    let currentDate = new Date();
    let history = [];
    let activities = [];
    let sortKey = 'date';
    let sortDir = -1; // -1 = décroissant (plus récent en haut)

    // Liste des activités par défaut (Fidèle au fichier Excel)
    const DEFAULT_ACTIVITIES = [
        { name: "IS JOUR 1",          color: "#FFFF00" },
        { name: "IS JOUR 2",          color: "#FFFF00" },
        { name: "IS JOUR 3",          color: "#FFFF00" },
        { name: "DEP 1",              color: "#FFFF00" },
        { name: "DEP 2",              color: "#FFFF00" },
        { name: "DEP 3",              color: "#FFFF00" },
        { name: "ASTREINTE",          color: "#00B0F0" },
        { name: "CLIENTELE",          color: "#D9D9D9" }, // Gris clair excel
        { name: "TRAVAUX",            color: "#8DB4E2" },
        { name: "TRAVAUX ASTREINTE",  color: "#4472C4" },
        { name: "CICM",               color: "#A9D08E" },
        { name: "ROB",                color: "#A9D08E" },
        { name: "CICM OPTIC",         color: "#A9D08E" },
        { name: "RSF",                color: "#A9D08E" },
        { name: "LOCA",               color: "#F4B183" },
        { name: "IMMEUBLE NEUF",      color: "#BF8F00" },
        { name: "IMMEUBLE MONOXYDE",  color: "#BF8F00" },
        { name: "PREPA IMMEUBLE",     color: "#BF8F00" },
        { name: "MAGASIN",            color: "#806000" },
        { name: "FP",                 color: "#FF0000" },
        { name: "AIR PEDAGOGIQUE",    color: "#00B050" },
        { name: "PREPA EAP",          color: "#00B050" },
        { name: "REUNION D'EQUIPE",   color: "#806000" },
        { name: "ADMINISTRATIF",      color: "#806000" },
        { name: "SORTIE D'ASTREINTE", color: "#B4C6E7" },
        { name: "CP",                 color: "#C00000" },
        { name: "10",                 color: "#C00000" },
        { name: "21",                 color: "#C00000" },
        { name: "41",                 color: "#C00000" },
        { name: "RTT",                color: "#C00000" },
        { name: "ABS",                color: "#C00000" },
        { name: "PAT",                color: "#C00000" },
        { name: "A2T",                color: "#7B7B7B" }
    ];

    // Codes considérés comme "Absence" pour les KPIs et l'affichage rouge
    const ABSENCE_CODES = new Set(["CP","10","21","41","RTT","ABS","PAT","MALADIE"]);

    // ============================================================
    // 2. UTILITAIRES
    // ============================================================

    // FIX v11.1 : utilise l'heure locale (fr-CA) pour éviter décalage UTC en fin de journée
    const formatDateKey = d => d.toLocaleDateString("fr-CA");
    
    const getWeekNum = d => {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

    // Détermine si une couleur de fond est claire ou foncée pour adapter le texte (noir/blanc)
    const isLight = hex => {
        if(!hex) return true;
        // Gestion des formats courts (#FFF) ou longs (#FFFFFF)
        const c = hex.substring(1);      
        const rgb = parseInt(c, 16);   
        const r = (rgb >> 16) & 0xff; 
        const g = (rgb >>  8) & 0xff;
        const b = (rgb >>  0) & 0xff;
        // Formule de luminosité standard
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; 
        return luma > 128;
    };

    // ============================================================
    // 3. INITIALISATION & NAVIGATION
    // ============================================================

    async function init() {
        console.log("🚀 SupportModule : Initialisation...");
        
        // 1. Charger les Activités (custom Supabase > custom local > défaut)
        const savedActs = localStorage.getItem('demat_activities');
        activities = savedActs ? JSON.parse(savedActs) : JSON.parse(JSON.stringify(DEFAULT_ACTIVITIES));
        await loadActivitiesFromSupabase();

        // Recharger les paramètres dès qu'une session Supabase devient active
        if (window.supabaseClient?.auth?.onAuthStateChange) {
            window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                    await loadActivitiesFromSupabase();
                    renderParams();
                    renderTable();
                }
            });
        }

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
        if(tbody) {
            tbody.addEventListener('change', handleTableChange);
        }
    }

    function switchTab(tabId) {
        // Gestion des classes actives pour les onglets
        document.querySelectorAll('.support-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.support-panel').forEach(p => p.classList.remove('active'));
        
        // Trouver le bouton qui a appelé la fonction et l'activer
        const btn = document.querySelector(`button[onclick="SupportModule.switchTab('${tabId}')"]`);
        if(btn) btn.classList.add('active');
        
        // Afficher le panneau
        const panel = document.getElementById(tabId);
        if(panel) panel.classList.add('active');
        
        // Si on va sur l'historique, on rafraîchit les données
        if(tabId === 'tabHistory') {
            // Recharger depuis Supabase à chaque ouverture de l'onglet historique
            loadHistoryFromSupabase().then(() => renderHistory());
        }
    }

    // --- Gestion de la Date ---

    function updateDateDisplay() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = currentDate.toLocaleDateString('fr-FR', options);
        
        // Titre écran
        const elTitle = document.getElementById('dayDisplayTitle');
        if(elTitle) elTitle.textContent = dateStr;
        
        // Sous-titre semaine
        const elSub = document.getElementById('dayDisplaySub');
        if(elSub) elSub.textContent = `Semaine N° ${getWeekNum(currentDate)}`;
        
        // Input date picker
        const elPicker = document.getElementById('supportDatePicker');
        if(elPicker) elPicker.value = formatDateKey(currentDate);
    }

    function changeDay(delta) {
        currentDate.setDate(currentDate.getDate() + delta);
        updateDateDisplay();
        loadAndRenderTable();
    }
    
    function goToDate(val) {
        if(val) {
            currentDate = new Date(val);
            updateDateDisplay();
            loadAndRenderTable();
        }
    }
    
    function goToday() {
        currentDate = new Date();
        updateDateDisplay();
        loadAndRenderTable();
    }

    // ============================================================
    // 4. RENDU DU TABLEAU (BRIEF)
    // ============================================================

    async function loadAndRenderTable() {
        const key = formatDateKey(currentDate);
        
        // Tenter de charger depuis Supabase (si connecté)
        if(window.SupportStore && window.supabaseClient) {
            try {
                const row = await window.SupportStore.loadSupport({ jour: key });
                if(row?.payload && Object.keys(row.payload).length > 1) {
                    // Supabase a des données → on met à jour le localStorage local aussi
                    localStorage.setItem('demat_day_' + key, JSON.stringify(row.payload));
                    console.log("☁️ Données chargées depuis Supabase pour", key);
                }
            } catch(e) {
                console.warn("⚠️ Chargement Supabase échoué, fallback localStorage :", e.message);
            }
        }
        
        renderTable();
    }

    function renderTable() {
        const tbody = document.getElementById('briefTableBody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const key = formatDateKey(currentDate);
        const savedDay = JSON.parse(localStorage.getItem('demat_day_' + key) || '{}');
        
        // Utilisation de la liste globale window.TECHNICIANS (chargée par technicians.js)
        const techs = window.TECHNICIANS || [];

        let cptPres = 0, cptAbs = 0, cptGrv = 0;

        techs.forEach((tech, idx) => {
            const rowData = savedDay[tech.name] || {};
            
            // Récupération de l'activité
            const actName = rowData.act || '';
            const actObj = activities.find(a => a.name === actName);
            
            // Gestion Couleur
            const bgColor = actObj ? actObj.color : '';
            const fgColor = isLight(bgColor) ? '#000' : '#fff';
            const borderColor = bgColor || '#e2e8f0';

            // Calculs KPI
            if(ABSENCE_CODES.has(actName)) cptAbs++;
            else if (actName && actName !== '') cptPres++;
            
            if(rowData.Grv === 'OUI') cptGrv++;

            // Création de la ligne
            const tr = document.createElement('tr');
            
            // Si absent, on met tout la ligne en rouge pâle (style Excel)
            if(ABSENCE_CODES.has(actName)) {
                tr.classList.add('row-absent');
            }

            // Formatage Qualification (PTC/PTD)
            let qualif = '';
            if(tech.ptc === true && tech.ptd === true) qualif = 'PTC-PTD';
            else if (tech.ptc === 'PTC - PTD') qualif = 'PTC-PTD';
            else if (tech.ptc) qualif = 'PTC';

            tr.innerHTML = `
                <td style="text-align:center; color:#94a3b8; font-size:10px;">${idx + 1}</td>
                <td class="cell-name">${tech.name}</td>
                <td class="cell-ptc">${qualif}</td>
                                
                <td>
                    <select class="editable-select input-act" data-tech="${tech.name}" 
                            style="background-color:${bgColor}; color:${fgColor}; border-color:${borderColor};">
                        <option value="">-</option>
                        ${activities.map(a => `<option value="${a.name}" ${actName===a.name?'selected':''}>${a.name}</option>`).join('')}
                    </select>
                </td>
                
                <td>
                    <input class="editable-input input-obs" data-tech="${tech.name}" 
                           value="${rowData.obs||''}" placeholder="...">
                </td>
                
                <td>${renderSelect('briefA', rowData.briefA, tech.name)}</td>
                <td>${renderSelect('briefD', rowData.briefD, tech.name)}</td>
                
                <td>${renderSelect('debriefA', rowData.debriefA, tech.name)}</td>
                <td>${renderSelect('debriefD', rowData.debriefD, tech.name)}</td>
                
                <td>${renderYesNo('Grv', rowData.Grv, tech.name)}</td>
            `;
            tbody.appendChild(tr);
        });

        // Charger l'observation globale
        const obsGlobal = document.getElementById('obsGlobal');
        if(obsGlobal) obsGlobal.value = savedDay['__GLOBAL_OBS'] || '';

        // Mise à jour des compteurs (KPI)
        const elPres = document.getElementById('kpiPres');
        const elAbs = document.getElementById('kpiAbs');
        const elGrv = document.getElementById('kpiGreve');
        
        if(elPres) elPres.textContent = cptPres;
        if(elAbs) elAbs.textContent = cptAbs;
        if(elGrv) elGrv.textContent = cptGrv;
    }

    // Helper pour générer les selects OUI/NON avec couleur
    function renderSelect(field, val, techName) {
        let cls = '';
        if(val === 'OUI') cls = 'val-oui';
        else if(val === 'NON') cls = 'val-non';
        
        return `<select class="editable-select ${cls}" data-tech="${techName}" data-field="${field}">
            <option value="">-</option>
            <option value="OUI" ${val==='OUI'?'selected':''}>OUI</option>
            <option value="NON" ${val==='NON'?'selected':''}>NON</option>
        </select>`;
    }

    // Helper pour générer les selects OUI (simple)
    function renderYesNo(field, val, techName) {
         return `<select class="editable-select" data-tech="${techName}" data-field="${field}" style="font-size:10px; width:50px;">
            <option value="">-</option>
            <option value="OUI" ${val==='OUI'?'selected':''}>OUI</option>
        </select>`;
    }

    // ============================================================
    // 5. GESTION DES ÉVÉNEMENTS & SAUVEGARDE
    // ============================================================

    function handleTableChange(e) {
        const el = e.target;
        
        // 1. Changement visuel immédiat
        if(el.classList.contains('input-act')) {
            const actName = el.value;
            const actObj = activities.find(a => a.name === actName);
            const color = actObj ? actObj.color : '';
            
            el.style.backgroundColor = color;
            el.style.color = isLight(color) ? '#000' : '#fff';
            el.style.borderColor = color || '#e2e8f0';
        }

        if(['briefA','briefD','debriefA','debriefD'].includes(el.dataset.field)) {
            el.classList.remove('val-oui', 'val-non');
            if(el.value === 'OUI') el.classList.add('val-oui');
            if(el.value === 'NON') el.classList.add('val-non');
        }

        // 2. Sauvegarde des données
        saveDay();
        
        // 3. Si c'est une activité, on doit re-rendre le tableau 
        // pour mettre à jour la ligne (rouge si absent) et les KPIs
        if(el.classList.contains('input-act')) {
            renderTable();
        }
    }

    function saveDay() {
        const dayData = {};
        
        // Sauvegarde Obs Globale
        const obsGlobal = document.getElementById('obsGlobal');
        if(obsGlobal) dayData['__GLOBAL_OBS'] = obsGlobal.value;

        // Sauvegarde Lignes
        const rows = document.getElementById('briefTableBody').querySelectorAll('tr');
        rows.forEach(tr => {
            const name = tr.querySelector('.cell-name').textContent;
            
            // Récupération sécurisée des valeurs
            const getVal = (selector) => {
                const el = tr.querySelector(selector);
                return el ? el.value : '';
            };
            
            // Pour les champs générés via renderSelect/renderYesNo
            const getFieldVal = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                return el ? el.value : '';
            };

            dayData[name] = {
                act: getVal('.input-act'),
                obs: getVal('.input-obs'),
                briefA: getFieldVal('briefA'),
                briefD: getFieldVal('briefD'),
                debriefA: getFieldVal('debriefA'),
                debriefD: getFieldVal('debriefD'),
                Grv: getFieldVal('Grv')
            };
        });

        const key = formatDateKey(currentDate);
        localStorage.setItem('demat_day_' + key, JSON.stringify(dayData));
        
        // FIX v11.1 : Synchronisation Supabase (si connecté)
        if(window.SupportStore && window.supabaseClient) {
            window.SupportStore.saveSupport(dayData, { jour: key })
                .then(() => {
                    // Feedback visuel discret
                    const btn = document.querySelector('button[onclick*="saveDay"], button[onclick*="SupportModule.saveDay"]');
                    if(btn) {
                        const orig = btn.textContent;
                        btn.textContent = "✅ Enregistré";
                        setTimeout(() => btn.textContent = orig, 2000);
                    }
                    console.log("☁️ Support sauvegardé sur Supabase pour", key);
                })
                .catch(e => {
                    console.error("❌ Erreur sauvegarde Supabase :", e.message);
                    alert("⚠️ Sauvegarde locale OK, mais Supabase a échoué :\n" + e.message);
                });
        }
        
        // Mise à jour de l'historique pour la recherche
        updateHistoryLog(key, dayData);
    }

    function updateHistoryLog(dateKey, data) {
        // On retire les anciennes entrées de ce jour pour éviter les doublons
        history = history.filter(h => h.date !== dateKey);
        
        // On ajoute les nouvelles données significatives
        Object.keys(data).forEach(agentName => {
            if(agentName === '__GLOBAL_OBS' || agentName === '__PARAM_ACTIVITIES') return;
            
            const d = data[agentName];
            // On ne garde en historique que si il y a une activité ou une obs
            if(d.act || d.obs || d.briefA === 'OUI' || d.Grv === 'OUI') {
                history.push({
                    date: dateKey,
                    agent: agentName,
                    act: d.act,
                    obs: d.obs,
                    brief: (d.briefA === 'OUI' || d.briefD === 'OUI') ? 'OK' : '',
                    debrief: (d.debriefA === 'OUI' || d.debriefD === 'OUI') ? 'OK' : ''
                });
            }
        });
        
        localStorage.setItem('demat_history', JSON.stringify(history));
    }

    function clearDay() {
        if(confirm("Voulez-vous vraiment vider toutes les saisies de ce jour ?")) {
            localStorage.removeItem('demat_day_' + formatDateKey(currentDate));
            renderTable();
        }
    }

    // ============================================================
    // 6. GESTION DES PARAMÈTRES (Activités)
    // ============================================================

    function renderParams() {
        const grid = document.getElementById('paramGrid');
        if(!grid) return;

        grid.innerHTML = activities.map((a, index) => `
            <div class="param-card" style="justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="color" value="${a.color}" 
                           onchange="SupportModule.updateActivityColor(${index}, this.value)"
                           style="width:30px; height:30px; border:none; background:none; cursor:pointer;"
                           title="Changer la couleur">
                    
                    <div style="font-weight:bold; font-size:12px;">${a.name}</div>
                </div>
                
                <button onclick="SupportModule.deleteActivity(${index})" 
                        style="background:none; border:none; color:#ef4444; font-weight:bold; font-size:18px; cursor:pointer; padding:0 5px;"
                        title="Supprimer cette activité">
                    &times;
                </button>
            </div>
        `).join('');
    }

    function addActivity() {
        const nameInput = document.getElementById('newActName');
        const colorInput = document.getElementById('newActColor');
        
        const name = nameInput.value.trim().toUpperCase();
        const color = colorInput.value;
        
        if(name) {
            if(activities.find(a => a.name === name)) {
                alert("Cette activité existe déjà !");
                return;
            }
            activities.push({ name, color });
            saveActivities();
            nameInput.value = ''; // Reset champ
        } else {
            alert("Veuillez entrer un nom d'activité.");
        }
    }

    function deleteActivity(index) {
        const actName = activities[index].name;
        if(confirm(`Supprimer définitivement l'activité "${actName}" ?`)) {
            activities.splice(index, 1);
            saveActivities();
        }
    }

    function updateActivityColor(index, newColor) {
        activities[index].color = newColor;
        saveActivities();
    }

    function saveActivities() {
        localStorage.setItem('demat_activities', JSON.stringify(activities));

        // Synchronisation cloud best-effort (sans bloquer l'UI)
        saveActivitiesToSupabase();

        renderParams(); // Mettre à jour la grille
        renderTable();  // Mettre à jour le tableau principal (couleurs)
    }

    // V3.1 — Param activités partagés via support_settings
    async function saveActivitiesToSupabase() {
        if (!window.SupportStore || !window.supabaseClient) return;

        try {
            const payload = { activities };
            await window.SupportStore.saveSetting("PARAM_ACTIVITIES", payload, { site: "VLG" });
            console.log("☁️ V3.1 Param activités sauvegardés dans support_settings");
        } catch (e) {
            console.warn("⚠️ V3.1 Sauvegarde Supabase des paramètres activités échouée:", e.message);
        }
    }

    // V3.1 — Chargement paramètres activités depuis support_settings
    async function loadActivitiesFromSupabase() {
        if (!window.SupportStore || !window.supabaseClient) return;

        try {
            const payload = await window.SupportStore.loadSetting("PARAM_ACTIVITIES", { site: "VLG" });
            if (!Array.isArray(payload?.activities)) return;

            activities = payload.activities;
            localStorage.setItem('demat_activities', JSON.stringify(activities));
            console.log("☁️ V3.1 Param activités chargés depuis support_settings");
        } catch (e) {
            console.warn("⚠️ V3.1 Chargement Supabase des paramètres activités échoué (fallback localStorage):", e.message);
        }
    }

    // ============================================================
    // 7. HISTORIQUE & STATS
    // ============================================================

    // ============================================================
    // 7b. CHARGEMENT HISTORIQUE DEPUIS SUPABASE
    // ============================================================

    /**
     * Requête TOUTES les lignes support_journee du site dans Supabase
     * et reconstruit le tableau history[] en mémoire + localStorage.
     * Appelé à chaque ouverture de l'onglet "Données & Historique".
     */
    async function loadHistoryFromSupabase() {
        if (!window.SupportStore || !window.supabaseClient) {
            console.warn("[SUPPORT] Supabase non disponible — historique depuis localStorage uniquement.");
            return;
        }

        // Vérifier que l'utilisateur est connecté
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
                .limit(90); // 3 derniers mois max

            if (error) throw error;
            if (!rows || rows.length === 0) {
                console.log("[SUPPORT] Aucune donnée Supabase pour l'historique.");
                return;
            }

            // Reconstruire history[] depuis les payloads Supabase
            const newHistory = [];
            for (const row of rows) {
                const data = row.payload || {};
                const jour = row.jour;
                Object.keys(data).forEach(agentName => {
                    if (agentName === '__GLOBAL_OBS' || agentName === '__PARAM_ACTIVITIES') return;
                    const d = data[agentName];
                    if (d && (d.act || d.obs || d.briefA === 'OUI' || d.greve === 'OUI')) {
                        newHistory.push({
                            date:    jour,
                            agent:   agentName,
                            act:     d.act    || '',
                            obs:     d.obs    || '',
                            brief:   (d.briefA === 'OUI' || d.briefD === 'OUI')   ? 'OK' : '',
                            debrief: (d.debriefA === 'OUI' || d.debriefD === 'OUI') ? 'OK' : ''
                        });
                    }
                });
                // Mettre à jour le localStorage local pour chaque jour
                localStorage.setItem('demat_day_' + jour, JSON.stringify(data));
            }

            history = newHistory;
            // Sauvegarder l'historique reconstruit en localStorage (pour usage hors ligne)
            localStorage.setItem('demat_history', JSON.stringify(history));

            console.log(`[SUPPORT] ☁️ Historique reconstruit depuis Supabase : ${rows.length} jours, ${history.length} lignes.`);

        } catch(e) {
            console.error("[SUPPORT] ❌ Erreur chargement historique Supabase :", e.message);
            // Fallback : garder l'historique localStorage existant
        }
    }

    function renderStats() {
        // Nombre de jours uniques
        const uniqueDays = new Set(history.map(h => h.date)).size;
        
        // Stats DOM
        const elDays = document.getElementById('statDays');
        const elRecs = document.getElementById('statRecords');
        const elTop = document.getElementById('statTopAct');

        if(elDays) elDays.textContent = uniqueDays;
        if(elRecs) elRecs.textContent = history.length;
        
        // Top Activité
        const counts = {};
        history.forEach(h => { if(h.act) counts[h.act] = (counts[h.act]||0)+1; });
        const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
        
        if(elTop) elTop.textContent = top ? `${top[0]} (${top[1]})` : '-';
        
        // Remplir le filtre agents
        const select = document.getElementById('histFilterAgent');
        if(select && select.options.length <= 1) { // Eviter de dupliquer si déjà rempli
             if(window.TECHNICIANS) {
                window.TECHNICIANS.forEach(t => select.innerHTML += `<option value="${t.name}">${t.name}</option>`);
            }
        }
    }

    function renderHistory() {
        const tbody = document.getElementById('historyTableBody');
        if(!tbody) return;

        // Récupération filtres
        const fAgent = document.getElementById('histFilterAgent').value;
        const fFrom = document.getElementById('histDateFrom').value;
        const fTo = document.getElementById('histDateTo').value;

        let data = history;
        
        // Application filtres
        if(fAgent) data = data.filter(h => h.agent === fAgent);
        if(fFrom) data = data.filter(h => h.date >= fFrom);
        if(fTo) data = data.filter(h => h.date <= fTo);
        
        // Tri
        data.sort((a,b) => {
            const valA = a[sortKey] || '';
            const valB = b[sortKey] || '';
            return valA.localeCompare(valB) * sortDir;
        });

        tbody.innerHTML = data.map(h => `
            <tr>
                <td>${h.date}</td>
                <td style="font-weight:bold;">${h.agent}</td>
                <td><span style="padding:2px 6px; border-radius:4px; background:#f1f5f9; font-size:11px;">${h.act||'-'}</span></td>
                <td style="color:var(--muted); font-style:italic; font-size:11px;">${h.obs||''}</td>
                <td style="text-align:center;">${h.brief}</td>
                <td style="text-align:center;">${h.debrief}</td>
            </tr>
        `).join('');
        
        renderStats();
    }
    
    function sortHistory(key) {
        if(sortKey === key) {
            sortDir *= -1; // Inverser ordre
        } else {
            sortKey = key;
            sortDir = 1;
        }
        renderHistory();
    }

    // ============================================================
    // 8. EXPORT & IMPRESSION
    // ============================================================

    function exportCSV() {
        const key = formatDateKey(currentDate);
        const dayData = JSON.parse(localStorage.getItem('demat_day_' + key) || '{}');
        
        // En-tête CSV
        let csv = "Date;Agent;Activite;Observation;Brief_Agence;Brief_Dist;Debrief_Agence;Debrief_Dist;Grv\n";
        
        Object.keys(dayData).forEach(agentName => {
            if(agentName === '__GLOBAL_OBS' || agentName === '__PARAM_ACTIVITIES') return;
            const d = dayData[agentName];
            
            // On nettoie les observations pour éviter les erreurs CSV (points virgules, sauts de ligne)
            const obsClean = (d.obs || '').replace(/;/g, ',').replace(/\n/g, ' ');
            
            csv += `${key};${agentName};${d.act};${obsClean};${d.briefA};${d.briefD};${d.debriefA};${d.debriefD};${d.Grv}\n`;
        });
        
        // Création du lien de téléchargement
        const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Support_Journee_${key}.csv`;
        a.click();
    }

    function printDay() {
    // 1. Calcul des données
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = currentDate.toLocaleDateString('fr-FR', options);
    
    // Utilise la fonction getWeekNum existante dans votre fichier
    const weekNum = typeof getWeekNum === 'function' ? getWeekNum(currentDate) : '--';

    // 2. Injection dans les zones d'impression
    const elDate = document.getElementById('printDateBox');
    if(elDate) elDate.textContent = dateStr;

    const elWeek = document.getElementById('printWeekBox');
    if(elWeek) elWeek.textContent = String(weekNum).padStart(2, '0');

    const elTime = document.getElementById('printTime');
    if(elTime) {
        const now = new Date();
        elTime.textContent = `Imprimé le : ${now.toLocaleDateString()} à ${now.toLocaleTimeString()}`;
    }

    // 3. Impression
    window.print();
}

    // ============================================================
    // 9. API PUBLIQUE
    // ============================================================
    
    return {
        init,
        switchTab,
        
        // Navigation Date
        changeDay, goToday, goToDate,
        
        // Actions Tableau
        saveDay, clearDay,
        
        // Actions Paramètres
        addActivity, deleteActivity, updateActivityColor,
        
        // Actions Historique
        renderHistory, sortHistory,
        
        // Actions Globales
        exportCSV, printDay
    };

})();

// Auto-init au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Petit délai pour s'assurer que TECHNICIANS est bien chargé
    setTimeout(() => {
        if(window.SupportModule) window.SupportModule.init();
    }, 200);
});
