// js/ui/support.js
// Module intégré Support Journée (Demat-BT v11)
// v1.2 — 2026-02-28
// FIX: formatDateKey utilise l'heure locale (fr-CA) pour éviter décalage UTC
// FIX: saveDay() synchronise sur Supabase (SupportStore.saveSupport) en plus du localStorage
// FIX: loadAndRenderTable() charge depuis Supabase si connecté, fallback localStorage
// NEW v1.2: loadHistoryFromSupabase() reconstruit history[] depuis TOUTES les lignes Supabase
//           → L'onglet Données & Historique affiche maintenant les données cross-session
//           → switchTab('tabHistory') déclenche un rechargement Supabase automatique
// V3.3: compatibilité historique + attendanceType (present/absent/neutral)

window.SupportModule = (function() {
    
    // ============================================================
    // 1. DONNÉES & CONFIGURATION
    // ============================================================
    
    let currentDate = new Date();
    let history = [];
    let activities = [];
    let editingActivityIndex = null;
    let activitySearchTerm = '';
    let toastTimer = null;
    let sortKey = 'date';
    let sortDir = -1; // -1 = décroissant (plus récent en haut)
    let lastSupportMeta = null;
    let supportDatePickerInstance = null;
    let supportDaysWithData = new Set();
    let currentDayUpdatedAt = null;
    let currentDayLockToken = null;
    let lockRenewTimer = null;
    let supportSaveQueue = Promise.resolve();

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

    function normalizeSupportTechId(value) {
        return String(value || '').trim().toUpperCase();
    }

    function getSupportTechnicians() {
        return Array.isArray(window.TECHNICIANS) ? window.TECHNICIANS : [];
    }

    function getSupportTechStableId(tech) {
        return normalizeSupportTechId(tech?.id || tech?.nni || '');
    }

    function findSupportTechByKey(key) {
        const normalizedKey = normalizeSupportTechId(key);
        const rawKey = String(key || '').trim();
        return getSupportTechnicians().find((tech) => (
            getSupportTechStableId(tech) === normalizedKey ||
            String(tech?.name || '').trim() === rawKey
        )) || null;
    }

    function getSupportTechDisplayName(techId, fallback = '') {
        const tech = findSupportTechByKey(techId);
        if (tech?.name) return tech.name;
        return String(fallback || techId || '').trim();
    }

    function getSupportRowData(savedDay, tech) {
        if (!savedDay || typeof savedDay !== 'object') return {};
        const stableId = getSupportTechStableId(tech);
        if (stableId && savedDay[stableId] && typeof savedDay[stableId] === 'object') {
            return savedDay[stableId];
        }
        const legacyName = String(tech?.name || '').trim();
        if (legacyName && savedDay[legacyName] && typeof savedDay[legacyName] === 'object') {
            return savedDay[legacyName];
        }
        return {};
    }
    
    const getWeekNum = d => {
        const date = new Date(d.getTime());
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
        const week1 = new Date(date.getFullYear(), 0, 4);
        return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    };

    function formatLastUpdateLabel(meta) {
        if (!meta) return "Dernière modification : —";
        const rawBy = String(meta.lastModifiedByEmail || meta.createdBy || meta.updatedBy || '').trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawBy);
        const by = isUuid ? '' : rawBy;
        const atRaw = meta.lastModifiedAt || meta.updatedAt || null;
        let at = '';
        if (atRaw) {
            const dt = new Date(atRaw);
            if (!Number.isNaN(dt.getTime())) at = dt.toLocaleString('fr-FR');
        }
        if (by && at) return `Dernière modification : ${by} le ${at}`;
        if (by) return `Dernière modification : ${by}`;
        if (at) return `Dernière modification : utilisateur non identifié le ${at}`;
        return "Dernière modification : —";
    }

    function renderLastUpdate(meta = null) {
        const el = document.getElementById('supportLastUpdate');
        if (!el) return;
        el.textContent = formatLastUpdateLabel(meta);
    }

    function formatLockStatusLabel(status, lockObj = null) {
        const email = String(lockObj?.ownerEmail || lockObj?.ownerId || '').trim();
        const expires = lockObj?.expiresAt ? new Date(lockObj.expiresAt) : null;
        const expLabel = (expires && !Number.isNaN(expires.getTime())) ? expires.toLocaleTimeString('fr-FR') : null;

        if (status === 'acquired') {
            return expLabel
                ? `Statut édition : verrou actif (vous) jusqu'à ${expLabel}`
                : "Statut édition : verrou actif (vous)";
        }
        if (status === 'busy') {
            const who = email || 'un autre utilisateur';
            return expLabel
                ? `Statut édition : en cours par ${who} (jusqu'à ${expLabel})`
                : `Statut édition : en cours par ${who}`;
        }
        if (status === 'locked') {
            return "Statut édition : fiche verrouillée (lecture seule)";
        }
        return "Statut édition : —";
    }

    function renderLockStatus(status = null, lockObj = null) {
        const el = document.getElementById('supportLockStatus');
        if (!el) return;
        el.textContent = formatLockStatusLabel(status, lockObj);
    }

    function formatSupportWeatherDateLabel(dateObj) {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        return dateObj.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    }

    function renderSupportWeatherState(message, isError = false) {
        const summaryEl = document.getElementById('supportWeatherSummary');
        const gridEl = document.getElementById('supportWeatherGrid');
        if (summaryEl) summaryEl.textContent = String(message || '');
        if (gridEl) {
            gridEl.replaceChildren(createWeatherLoadingCard(
                message || (isError ? 'Prévisions indisponibles.' : 'Chargement...')
            ));
        }
    }

    function createWeatherLoadingCard(message) {
        const card = document.createElement('div');
        card.className = 'support-weather-card support-weather-card--loading';
        card.textContent = String(message || '');
        return card;
    }

    function createWeatherMetric(label, value) {
        const metric = document.createElement('div');
        metric.className = 'support-weather-card__metric';

        const span = document.createElement('span');
        span.textContent = label;
        metric.appendChild(span);

        const strong = document.createElement('strong');
        strong.textContent = value;
        metric.appendChild(strong);

        return metric;
    }

    function createWeatherCard(item) {
        const card = document.createElement('div');
        card.className = 'support-weather-card';

        const top = document.createElement('div');
        top.className = 'support-weather-card__top';

        const city = document.createElement('div');
        city.className = 'support-weather-card__city';
        city.textContent = window.WeatherModule.prettyName(item?.name) || '';
        top.appendChild(city);

        const icon = document.createElement('div');
        icon.className = 'support-weather-card__icon';
        top.appendChild(icon);

        card.appendChild(top);

        const temp = document.createElement('div');
        temp.className = 'support-weather-card__temp';
        card.appendChild(temp);

        const metrics = document.createElement('div');
        metrics.className = 'support-weather-card__metrics';
        card.appendChild(metrics);

        const forecast = item?.forecast;
        if (!forecast) {
            icon.textContent = '🌡️';
            temp.textContent = '—';
            metrics.appendChild(createWeatherMetric('Prévision', 'Indisponible'));
            return card;
        }

        const badge = forecast.rsf || { level: 'warn', label: 'RSF a surveiller', summary: 'Prevision incomplete' };
        const badgeClass = badge.level === 'risk'
            ? 'support-weather-card__badge--risk'
            : (badge.level === 'warn' ? 'support-weather-card__badge--warn' : 'support-weather-card__badge--good');

        const min = Number.isFinite(forecast.tempMin) ? `${forecast.tempMin}°` : '—';
        const max = Number.isFinite(forecast.tempMax) ? `${forecast.tempMax}°` : '—';
        const rainProb = Number.isFinite(forecast.rainProbMax) ? `${forecast.rainProbMax}%` : '—';
        const rainMm = Number.isFinite(forecast.rainMm) ? `${forecast.rainMm.toFixed(forecast.rainMm >= 1 ? 1 : 0)} mm` : '—';
        const rainHours = Number.isFinite(forecast.rainHours) ? `${String(forecast.rainHours).replace('.', ',')} h` : '—';

        icon.textContent = forecast.icon || '🌡️';
        temp.textContent = `${min} / ${max}`;
        metrics.appendChild(createWeatherMetric('Prob. pluie', rainProb));
        metrics.appendChild(createWeatherMetric('Cumul pluie', rainMm));
        metrics.appendChild(createWeatherMetric('Heures humides', rainHours));

        const badgeEl = document.createElement('div');
        badgeEl.className = `support-weather-card__badge ${badgeClass}`;
        badgeEl.textContent = `${String(badge.label || '')} · ${String(badge.summary || '')}`;
        card.appendChild(badgeEl);

        return card;
    }

    async function renderSupportWeatherForecast() {
        const summaryEl = document.getElementById('supportWeatherSummary');
        const gridEl = document.getElementById('supportWeatherGrid');
        if (!summaryEl || !gridEl) return;

        const screenDate = new Date(currentDate.getTime());
        const dateLabel = formatSupportWeatherDateLabel(screenDate);
        renderSupportWeatherState(`Prévisions terrain pour ${dateLabel}...`);

        if (!window.WeatherModule?.getForecastForDate) {
            renderSupportWeatherState("Prévisions météo indisponibles.", true);
            return;
        }

        try {
            const result = await window.WeatherModule.getForecastForDate(screenDate);
            if (formatDateKey(screenDate) !== formatDateKey(currentDate)) return;

            const availableForecasts = (result?.communes || []).filter(item => item?.forecast);
            if (availableForecasts.length === 0) {
                renderSupportWeatherState(`Aucune prévision disponible pour ${dateLabel}.`, true);
                return;
            }

            const riskCount = availableForecasts.filter(item => item.forecast?.rsf?.level === 'risk').length;
            const warnCount = availableForecasts.filter(item => item.forecast?.rsf?.level === 'warn').length;
            if (riskCount > 0) summaryEl.textContent = `${dateLabel} : vigilance humidité forte sur ${riskCount} commune(s).`;
            else if (warnCount > 0) summaryEl.textContent = `${dateLabel} : humidité possible sur ${warnCount} commune(s).`;
            else summaryEl.textContent = `${dateLabel} : conditions plutôt favorables pour la RSF.`;

            gridEl.replaceChildren(...(result.communes || []).map((item) => createWeatherCard(item)));
        } catch (e) {
            console.warn('[SUPPORT] météo prévisionnelle indisponible:', e?.message || e);
            if (formatDateKey(screenDate) !== formatDateKey(currentDate)) return;
            renderSupportWeatherState(`Prévisions indisponibles pour ${dateLabel}.`, true);
        }
    }

    function hasMeaningfulDayData(payload) {
        if (!payload || typeof payload !== 'object') return false;

        if (String(payload.__GLOBAL_OBS || '').trim()) return true;

        return Object.keys(payload).some((agentName) => {
            if (agentName === '__GLOBAL_OBS' || agentName === '__PARAM_ACTIVITIES' || agentName === '_meta') return false;
            const d = payload[agentName];
            if (!d || typeof d !== 'object') return false;
            return Boolean(
                String(d.act || '').trim() ||
                String(d.obs || '').trim() ||
                d.briefA === 'OUI' ||
                d.briefD === 'OUI' ||
                d.debriefA === 'OUI' ||
                d.debriefD === 'OUI' ||
                d.Grv === 'OUI'
            );
        });
    }

    function dateKeyFromDate(dateObj) {
        if (!(dateObj instanceof Date)) return '';
        return dateObj.toLocaleDateString('fr-CA');
    }

    function markSupportCalendarDay(dayElem) {
        if (!dayElem || !dayElem.dateObj) return;
        const key = dateKeyFromDate(dayElem.dateObj);
        dayElem.classList.toggle('support-has-data', supportDaysWithData.has(key));
    }

    function redrawSupportDatePickerMarkers() {
        if (!supportDatePickerInstance) return;
        supportDatePickerInstance.calendarContainer
            ?.querySelectorAll('.flatpickr-day')
            ?.forEach(markSupportCalendarDay);
    }

    async function refreshSupportDaysWithData() {
        const nextSet = new Set();

        for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (!key || !key.startsWith('demat_day_')) continue;
            const dayKey = key.replace('demat_day_', '');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) continue;
            try {
                const payload = JSON.parse(localStorage.getItem(key) || '{}');
                if (hasMeaningfulDayData(payload)) nextSet.add(dayKey);
            } catch (_e) {}
        }

        if (window.SupportStore && window.supabaseClient) {
            try {
                const { data: authData } = await window.supabaseClient.auth.getUser();
                if (authData?.user) {
                    const { data: rows, error } = await window.supabaseClient
                        .from('support_journee')
                        .select('jour, payload')
                        .eq('site', 'VLG')
                        .order('jour', { ascending: false })
                        .limit(400);
                    if (error) throw error;

                    (rows || []).forEach((row) => {
                        const dayKey = String(row?.jour || '');
                        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
                        if (hasMeaningfulDayData(row?.payload || {})) nextSet.add(dayKey);
                    });
                }
            } catch (e) {
                console.warn('[SUPPORT] refreshSupportDaysWithData Supabase ignoré:', e?.message || e);
            }
        }

        supportDaysWithData = nextSet;
        redrawSupportDatePickerMarkers();
        console.log(`[SUPPORT] calendrier marqué: ${supportDaysWithData.size} jour(s) avec données.`);
    }

    async function ensureEditLockForCurrentDay({ silent = true } = {}) {
        const key = formatDateKey(currentDate);
        if (!window.SupportStore?.acquireDayLock || !window.supabaseClient) {
            renderLockStatus(null, null);
            return null;
        }

        try {
            const { data: authData } = await window.supabaseClient.auth.getUser();
            if (!authData?.user) {
                renderLockStatus(null, null);
                return null;
            }

            const lockResult = await window.SupportStore.acquireDayLock({
                jour: key,
                site: "VLG",
                ttlSeconds: 10 * 60,
                token: currentDayLockToken || null,
            });

            if (lockResult?.status === 'acquired') {
                currentDayLockToken = lockResult?.lock?.token || currentDayLockToken || null;
                if (lockResult?.updatedAt) currentDayUpdatedAt = lockResult.updatedAt;
                renderLockStatus('acquired', lockResult?.lock || null);
            } else if (lockResult?.status === 'busy') {
                renderLockStatus('busy', lockResult?.lock || null);
            } else if (lockResult?.status === 'locked') {
                renderLockStatus('locked', null);
            } else {
                renderLockStatus(null, null);
            }

            return lockResult;
        } catch (e) {
            if (!silent) console.warn('[SUPPORT] lock check failed:', e?.message || e);
            renderLockStatus(null, null);
            return null;
        }
    }

    function initSupportDatePicker() {
        const elPicker = document.getElementById('supportDatePicker');
        if (!elPicker || supportDatePickerInstance || !window.flatpickr) return;

        // L'input natif est remplacé par Flatpickr pour pouvoir styliser les jours "avec données".
        supportDatePickerInstance = window.flatpickr(elPicker, {
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'd/m/Y',
            defaultDate: formatDateKey(currentDate),
            locale: window.flatpickr?.l10ns?.fr || 'default',
            allowInput: false,
            onChange: (selectedDates) => {
                if (!selectedDates || selectedDates.length === 0) return;
                const nextKey = dateKeyFromDate(selectedDates[0]);
                if (nextKey) goToDate(nextKey);
            },
            onDayCreate: (_dObj, _dStr, _fp, dayElem) => markSupportCalendarDay(dayElem),
            onMonthChange: () => redrawSupportDatePickerMarkers(),
            onYearChange: () => redrawSupportDatePickerMarkers(),
            onOpen: () => redrawSupportDatePickerMarkers(),
        });
    }

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

    const DEFAULT_ACTIVITY_COLOR = '#94a3b8';
    const ABSENT_LABELS = new Set(["ABS","RTT","CP","MALADIE","GREVE"]);
    const HEX_COLOR_RE = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

    const slugify = (text) => String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'activity';

    function sanitizeActivityText(value, fallback = '') {
        const text = String(value ?? fallback)
            .replace(/[\u0000-\u001F\u007F]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        return text.slice(0, 120);
    }

    function sanitizeActivityColor(value, fallback = DEFAULT_ACTIVITY_COLOR) {
        const candidate = String(value || '').trim();
        if (HEX_COLOR_RE.test(candidate)) return candidate;
        const safeFallback = String(fallback || '').trim();
        return HEX_COLOR_RE.test(safeFallback) ? safeFallback : DEFAULT_ACTIVITY_COLOR;
    }

    function inferAttendanceType(label) {
        const key = String(label || '').trim().toUpperCase();
        if (!key) return 'present';
        return ABSENT_LABELS.has(key) ? 'absent' : 'present';
    }

    function sanitizeAttendanceType(value, fallbackLabel = '') {
        const v = String(value || '').trim().toLowerCase();
        if (v === 'present' || v === 'absent' || v === 'neutral') return v;
        return inferAttendanceType(fallbackLabel);
    }

    function attendanceBadge(type) {
        if (type === 'absent') return { text: 'Absent', bg: '#fee2e2', fg: '#991b1b' };
        if (type === 'neutral') return { text: 'Neutre', bg: '#e2e8f0', fg: '#334155' };
        return { text: 'Présent', bg: '#dcfce7', fg: '#166534' };
    }

    function normalizeActivity(raw, fallbackColor = DEFAULT_ACTIVITY_COLOR) {
        if (!raw) return null;
        const base = (typeof raw === 'string') ? { label: raw } : raw;

        const label = sanitizeActivityText(base.label || base.name || base.code || '');
        if (!label) return null;

        const code = slugify(sanitizeActivityText(base.code || label, label));
        const color = sanitizeActivityColor(base.color, fallbackColor);
        const name = sanitizeActivityText(base.name || label, label) || label;

        return {
            code,
            label,
            name,
            color,
            attendanceType: sanitizeAttendanceType(base.attendanceType, label),
        };
    }

    const activityDisplayLabel = (act) => String(act?.label || act?.name || act?.code || 'activité');
    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    function activityMatchKey(raw) {
        if (!raw) return '';
        const norm = normalizeActivity(raw);
        if (!norm) return '';
        return (norm.code || slugify(norm.label)).toLowerCase();
    }

    function mergeActivities(list) {
        const byKey = new Map();
        let mergedCount = 0;

        const upsert = (raw) => {
            const norm = normalizeActivity(raw);
            if (!norm) return;
            const key = activityMatchKey(norm);
            if (!key) return;

            if (!byKey.has(key)) {
                byKey.set(key, norm);
                return;
            }

            const prev = byKey.get(key);
            const color = (prev.color && prev.color !== DEFAULT_ACTIVITY_COLOR) ? prev.color : norm.color;
            const label = prev.label || norm.label;
            const name = prev.name || norm.name || label;
            const code = prev.code || norm.code || slugify(label);

            const attendanceType = prev.attendanceType || norm.attendanceType || inferAttendanceType(label);
            byKey.set(key, { code, label, name, color: color || DEFAULT_ACTIVITY_COLOR, attendanceType });
            mergedCount += 1;
        };

        (list || []).forEach(upsert);
        return { activities: Array.from(byKey.values()), mergedCount };
    }

    function findActivityByValue(value) {
        const v = String(value || '').trim();
        if (!v) return null;
        const lowered = v.toLowerCase();
        return activities.find(a => {
            const label = activityDisplayLabel(a).toLowerCase();
            const code = String(a?.code || '').toLowerCase();
            const name = String(a?.name || '').toLowerCase();
            return label === lowered || code === lowered || name === lowered;
        }) || null;
    }

    function extractHistoricalActivitiesFromRows(rows) {
        const found = [];

        (rows || []).forEach(row => {
            const payload = row?.payload;
            if (!payload || typeof payload !== 'object') return;

            if (Array.isArray(payload.__PARAM_ACTIVITIES)) {
                payload.__PARAM_ACTIVITIES.forEach(a => found.push(a));
            }

            Object.keys(payload).forEach(key => {
                if (key === '__GLOBAL_OBS' || key === '__PARAM_ACTIVITIES') return;
                const item = payload[key];
                if (!item || typeof item !== 'object') return;

                if (item.act && typeof item.act === 'string') {
                    found.push({ label: item.act, color: item.actColor || item.color || DEFAULT_ACTIVITY_COLOR });
                } else if (item.act && typeof item.act === 'object') {
                    found.push(item.act);
                }
            });
        });

        return found;
    }

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
                    if (window.SupportStore?.backfillLegacyMeta) {
                        window.SupportStore.backfillLegacyMeta({ site: "VLG", limit: 365 })
                            .then((r) => console.log(`[SUPPORT] legacy meta backfill: scanned=${r?.scanned || 0}, patched=${r?.patched || 0}`))
                            .catch((e) => console.warn("[SUPPORT] legacy meta backfill ignored:", e?.message || e));
                    }
                    await loadActivitiesFromSupabase();
                    renderParams();
                    await loadAndRenderTable();
                }
            });
        }

        // 2. Charger l'Historique global
        const savedHist = localStorage.getItem('demat_history');
        history = savedHist ? JSON.parse(savedHist) : [];

        // 3. Premier Rendu
        initSupportDatePicker();
        updateDateDisplay();
        loadAndRenderTable();
        renderParams();
        renderStats(); 
        renderLockStatus(null, null);

        refreshSupportDaysWithData().catch((e) => {
            console.warn('[SUPPORT] impossible de marquer le calendrier:', e?.message || e);
        });

        if (lockRenewTimer) clearInterval(lockRenewTimer);
        lockRenewTimer = setInterval(() => {
            const briefPanel = document.getElementById('tabBrief');
            if (!briefPanel?.classList?.contains('active')) return;
            ensureEditLockForCurrentDay({ silent: true }).catch(() => {});
        }, 120000);

        if (window.SupportStore?.backfillLegacyMeta) {
            window.SupportStore.backfillLegacyMeta({ site: "VLG", limit: 365 })
                .then((r) => console.log(`[SUPPORT] startup legacy meta backfill: scanned=${r?.scanned || 0}, patched=${r?.patched || 0}`))
                .catch((e) => console.warn("[SUPPORT] startup legacy meta backfill ignored:", e?.message || e));
        }
        
        // 4. Listeners globaux (Délégation d'événements pour performance)
        const tbody = document.getElementById('briefTableBody');
        if(tbody) {
            tbody.addEventListener('change', handleTableChange);
        }

        document.querySelectorAll('[data-support-tab]').forEach((button) => {
            button.addEventListener('click', () => {
                switchTab(button.dataset.supportTab);
            });
        });

        document.querySelectorAll('[data-support-day-shift]').forEach((button) => {
            button.addEventListener('click', () => {
                const delta = Number(button.dataset.supportDayShift || 0);
                changeDay(delta);
            });
        });

        const btnSupportToday = document.getElementById('btnSupportToday');
        if (btnSupportToday) btnSupportToday.addEventListener('click', () => goToday());

        const supportDatePicker = document.getElementById('supportDatePicker');
        if (supportDatePicker) {
            supportDatePicker.addEventListener('change', (event) => {
                goToDate(event.target?.value);
            });
        }

        const btnSupportSave = document.getElementById('btnSupportSave');
        if (btnSupportSave) btnSupportSave.addEventListener('click', () => saveDay());

        const btnSupportPrint = document.getElementById('btnSupportPrint');
        if (btnSupportPrint) btnSupportPrint.addEventListener('click', () => printDay());

        const btnSupportExportCsv = document.getElementById('btnSupportExportCsv');
        if (btnSupportExportCsv) btnSupportExportCsv.addEventListener('click', () => exportCSV());

        const btnSupportClear = document.getElementById('btnSupportClear');
        if (btnSupportClear) btnSupportClear.addEventListener('click', () => clearDay());

        const btnAddActivity = document.getElementById('btnAddActivity');
        if (btnAddActivity) btnAddActivity.addEventListener('click', () => addActivity());

        const paramSearchInput = document.getElementById('paramSearchInput');
        if (paramSearchInput) {
            paramSearchInput.addEventListener('input', (event) => {
                filterActivities(event.target?.value || '');
            });
        }

        const btnClearActivitiesFilter = document.getElementById('btnClearActivitiesFilter');
        if (btnClearActivitiesFilter) btnClearActivitiesFilter.addEventListener('click', () => clearActivitiesFilter());

        const btnSupportHistoryFilter = document.getElementById('btnSupportHistoryFilter');
        if (btnSupportHistoryFilter) btnSupportHistoryFilter.addEventListener('click', () => renderHistory());

        document.querySelectorAll('[data-support-sort]').forEach((header) => {
            header.addEventListener('click', () => {
                sortHistory(header.dataset.supportSort);
            });
        });
    }

    function switchTab(tabId) {
        // Gestion des classes actives pour les onglets
        document.querySelectorAll('.support-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.support-panel').forEach(p => p.classList.remove('active'));
        
        // Trouver le bouton qui a appelé la fonction et l'activer
        const btn = document.querySelector(`[data-support-tab="${tabId}"]`);
        if(btn) btn.classList.add('active');
        
        // Afficher le panneau
        const panel = document.getElementById(tabId);
        if(panel) panel.classList.add('active');
        
        // Si on va sur l'historique, on rafraîchit les données
        if(tabId === 'tabHistory') {
            // Recharger depuis Supabase à chaque ouverture de l'onglet historique
            loadHistoryFromSupabase().then(() => renderHistory());
            return;
        }

        // Quand on revient sur Brief, recharger les données du jour pour éviter un affichage vide/stale
        if (tabId === 'tabBrief') {
            loadAndRenderTable();
            return;
        }

        if (tabId === 'tabParam') {
            renderParams();
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
        if (supportDatePickerInstance) {
            supportDatePickerInstance.setDate(formatDateKey(currentDate), false);
        }

        renderSupportWeatherForecast().catch((e) => {
            console.warn('[SUPPORT] rendu météo impossible:', e?.message || e);
        });
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
        lastSupportMeta = null;
        currentDayUpdatedAt = null;
        currentDayLockToken = null;
        
        // Tenter de charger depuis Supabase (si connecté)
        if(window.SupportStore && window.supabaseClient) {
            try {
                const row = await window.SupportStore.loadSupport({ jour: key });
                if (row?.payload?._meta && typeof row.payload._meta === 'object') {
                    lastSupportMeta = row.payload._meta;
                } else if (row?.updated_at || row?.updated_by) {
                    lastSupportMeta = {
                        updatedAt: row.updated_at || null,
                        updatedBy: row.updated_by || null,
                    };
                }
                if (row?.updated_at) currentDayUpdatedAt = row.updated_at;
                if(row?.payload && Object.keys(row.payload).length > 1) {
                    // Supabase a des données → on met à jour le localStorage local aussi
                    localStorage.setItem('demat_day_' + key, JSON.stringify(row.payload));
                    console.log("☁️ Données chargées depuis Supabase pour", key);
                }
            } catch(e) {
                console.warn("⚠️ Chargement Supabase échoué, fallback localStorage :", e.message);
            }
        }

        if (!lastSupportMeta) {
            try {
                const savedDay = JSON.parse(localStorage.getItem('demat_day_' + key) || '{}');
                if (savedDay?._meta) lastSupportMeta = savedDay._meta;
            } catch (_e) {}
        }
        renderLastUpdate(lastSupportMeta);
        await ensureEditLockForCurrentDay({ silent: true });
        
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
        if (!Array.isArray(techs) || techs.length === 0) {
            console.warn('[SUPPORT] renderTable: aucun technicien chargé (window.TECHNICIANS vide).');
        }

        let cptPres = 0, cptAbs = 0, cptGrv = 0;

        techs.forEach((tech, idx) => {
            const techId = getSupportTechStableId(tech);
            const rowData = getSupportRowData(savedDay, tech);
            
            // Récupération de l'activité
            const actName = String(rowData.act || '').trim();
            let actObj = findActivityByValue(actName);
            if (actName && !actObj) {
                // V3.3 — activité historique inconnue: création temporaire en mémoire
                actObj = normalizeActivity({
                    label: actName,
                    color: DEFAULT_ACTIVITY_COLOR,
                    attendanceType: 'present',
                    code: `tmp_${slugify(actName)}_${Date.now()}`
                });
                if (actObj) activities.push(actObj);
            }
            const actLabel = actObj ? activityDisplayLabel(actObj) : actName;
            
            // Gestion Couleur
            const bgColor = sanitizeActivityColor(actObj?.color, DEFAULT_ACTIVITY_COLOR);
            const fgColor = isLight(bgColor) ? '#000' : '#fff';
            const borderColor = bgColor || '#e2e8f0';

            // Calculs KPI (V3.3 basé sur attendanceType)
            const attendanceType = actObj?.attendanceType || sanitizeAttendanceType('', actName);
            if(attendanceType === 'absent') cptAbs++;
            else if (attendanceType === 'present') cptPres++;
            
            if(rowData.Grv === 'OUI') cptGrv++;

            // Création de la ligne
            const tr = document.createElement('tr');
            
            // Si absent, on met toute la ligne en rouge pâle
            if(attendanceType === 'absent' || ABSENCE_CODES.has(actName)) {
                tr.classList.add('row-absent');
            }

            // Formatage Qualification (PTC/PTD)
            let qualif = '';
            if(tech.ptc === true && tech.ptd === true) qualif = 'PTC-PTD';
            else if (tech.ptc === 'PTC - PTD') qualif = 'PTC-PTD';
            else if (tech.ptc) qualif = 'PTC';

            const indexCell = document.createElement('td');
            indexCell.style.textAlign = 'center';
            indexCell.style.color = '#94a3b8';
            indexCell.style.fontSize = '10px';
            indexCell.textContent = String(idx + 1);
            tr.appendChild(indexCell);

            const nameCell = document.createElement('td');
            nameCell.className = 'cell-name';
            nameCell.textContent = tech.name || '';
            tr.appendChild(nameCell);

            tr.dataset.techId = techId;
            tr.dataset.techName = tech.name || '';

            const qualifCell = document.createElement('td');
            qualifCell.className = 'cell-ptc';
            qualifCell.textContent = qualif;
            tr.appendChild(qualifCell);

            const activityCell = document.createElement('td');
            activityCell.appendChild(createActivitySelect({
                techId,
                selectedLabel: actLabel,
                backgroundColor: bgColor,
                foregroundColor: fgColor,
                borderColor,
            }));
            tr.appendChild(activityCell);

            const obsCell = document.createElement('td');
            const obsInput = document.createElement('input');
            obsInput.className = 'editable-input input-obs';
            obsInput.dataset.tech = techId;
            obsInput.value = sanitizeActivityText(rowData.obs || '');
            obsInput.placeholder = '...';
            obsCell.appendChild(obsInput);
            tr.appendChild(obsCell);

            tr.appendChild(createTableControlCell(createBinarySelect('briefA', rowData.briefA, techId)));
            tr.appendChild(createTableControlCell(createBinarySelect('briefD', rowData.briefD, techId)));
            tr.appendChild(createTableControlCell(createBinarySelect('debriefA', rowData.debriefA, techId)));
            tr.appendChild(createTableControlCell(createBinarySelect('debriefD', rowData.debriefD, techId)));
            tr.appendChild(createTableControlCell(createSingleYesSelect('Grv', rowData.Grv, techId)));

            tbody.appendChild(tr);
        });

        console.log(`[SUPPORT] renderTable: ${techs.length} techniciens, ${tbody.querySelectorAll('tr').length} lignes rendues.`);

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

    function createTableControlCell(control) {
        const cell = document.createElement('td');
        cell.appendChild(control);
        return cell;
    }

    function createActivitySelect({ techId, selectedLabel, backgroundColor, foregroundColor, borderColor }) {
        const select = document.createElement('select');
        select.className = 'editable-select input-act';
        select.dataset.tech = techId || '';
        select.style.backgroundColor = backgroundColor || '';
        select.style.color = foregroundColor || '';
        select.style.borderColor = borderColor || '#e2e8f0';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-';
        select.appendChild(emptyOption);

        const knownLabels = new Set();
        activities.forEach((activity) => {
            const label = activityDisplayLabel(activity);
            if (!label || knownLabels.has(label)) return;
            knownLabels.add(label);
            const option = document.createElement('option');
            option.value = label;
            option.textContent = label;
            option.selected = selectedLabel === label;
            select.appendChild(option);
        });

        if (selectedLabel && !knownLabels.has(selectedLabel)) {
            const option = document.createElement('option');
            option.value = selectedLabel;
            option.textContent = selectedLabel;
            option.selected = true;
            select.appendChild(option);
        }

        return select;
    }

    function createBinarySelect(field, val, techId) {
        const select = document.createElement('select');
        select.className = 'editable-select';
        if(val === 'OUI') select.classList.add('val-oui');
        else if(val === 'NON') select.classList.add('val-non');
        select.dataset.tech = techId || '';
        select.dataset.field = field;

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-';
        select.appendChild(emptyOption);

        const yesOption = document.createElement('option');
        yesOption.value = 'OUI';
        yesOption.textContent = 'OUI';
        yesOption.selected = val === 'OUI';
        select.appendChild(yesOption);

        const noOption = document.createElement('option');
        noOption.value = 'NON';
        noOption.textContent = 'NON';
        noOption.selected = val === 'NON';
        select.appendChild(noOption);

        return select;
    }

    function createSingleYesSelect(field, val, techId) {
        const select = document.createElement('select');
        select.className = 'editable-select';
        select.dataset.tech = techId || '';
        select.dataset.field = field;
        select.style.fontSize = '10px';
        select.style.width = '50px';

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-';
        select.appendChild(emptyOption);

        const yesOption = document.createElement('option');
        yesOption.value = 'OUI';
        yesOption.textContent = 'OUI';
        yesOption.selected = val === 'OUI';
        select.appendChild(yesOption);

        return select;
    }

    // ============================================================
    // 5. GESTION DES ÉVÉNEMENTS & SAUVEGARDE
    // ============================================================

    function handleTableChange(e) {
        const el = e.target;
        
        // 1. Changement visuel immédiat
        if(el.classList.contains('input-act')) {
            const actName = el.value;
            const actObj = findActivityByValue(actName);
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
            const techId = normalizeSupportTechId(tr.dataset.techId);
            if (!techId) return;
            
            // Récupération sécurisée des valeurs
            const getVal = (selector) => {
                const el = tr.querySelector(selector);
                return el ? el.value : '';
            };
            
            // Pour les champs select du tableau support
            const getFieldVal = (field) => {
                const el = tr.querySelector(`[data-field="${field}"]`);
                return el ? el.value : '';
            };

            dayData[techId] = {
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
        if (hasMeaningfulDayData(dayData)) supportDaysWithData.add(key);
        else supportDaysWithData.delete(key);
        redrawSupportDatePickerMarkers();
        
        // FIX v11.1 : Synchronisation Supabase (si connecté)
        if(window.SupportStore && window.supabaseClient) {
            queueSupportSave(dayData, key)
                .then((savedRow) => {
                    if (!savedRow) return;
                    if (key !== formatDateKey(currentDate)) {
                        console.log("[SUPPORT] sauvegarde confirmée pour une autre journée, UI courante inchangée.");
                        return;
                    }
                    const meta = savedRow?.payload?._meta || dayData?._meta || null;
                    lastSupportMeta = meta;
                    renderLastUpdate(lastSupportMeta);
                    if (savedRow?.updated_at) currentDayUpdatedAt = savedRow.updated_at;
                    const lockObj = savedRow?.payload?._lock || null;
                    if (lockObj?.token) currentDayLockToken = lockObj.token;
                    renderLockStatus('acquired', lockObj);
                    // Feedback visuel discret
                    const btn = document.getElementById('btnSupportSave');
                    if(btn) {
                        const orig = btn.textContent;
                        btn.textContent = "✅ Enregistré";
                        setTimeout(() => btn.textContent = orig, 2000);
                    }
                    console.log("☁️ Support sauvegardé sur Supabase pour", key);
                })
                .catch(e => {
                    console.error("❌ Erreur sauvegarde Supabase :", e.message);
                    const category = String(e?.category || '').toLowerCase();
                    if (category === 'conflict') {
                        alert("⚠️ Conflit détecté : cette journée a été modifiée ailleurs.\nRecharge de la journée en cours.");
                        loadAndRenderTable();
                        return;
                    }
                    if (category === 'lock') {
                        alert("⛔ Sauvegarde refusée : un autre utilisateur édite cette journée.");
                        ensureEditLockForCurrentDay({ silent: false });
                        return;
                    }
                    alert("⚠️ Sauvegarde locale OK, mais Supabase a échoué :\n" + e.message);
                });
        }
        
        // Mise à jour de l'historique pour la recherche
        updateHistoryLog(key, dayData);
    }

    function queueSupportSave(dayData, key) {
        const payloadSnapshot = JSON.parse(JSON.stringify(dayData || {}));
        supportSaveQueue = supportSaveQueue
            .catch(() => null)
            .then(() => window.SupportStore.saveSupport(payloadSnapshot, {
                jour: key,
                site: "VLG",
                expectedUpdatedAt: currentDayUpdatedAt,
                lockToken: currentDayLockToken,
            }));

        return supportSaveQueue;
    }

    function updateHistoryLog(dateKey, data) {
        // On retire les anciennes entrées de ce jour pour éviter les doublons
        history = history.filter(h => h.date !== dateKey);
        
        // On ajoute les nouvelles données significatives
        Object.keys(data).forEach(agentKey => {
            if(agentKey === '__GLOBAL_OBS' || agentKey === '__PARAM_ACTIVITIES' || agentKey === '_meta' || agentKey === '_lock') return;
            
            const d = data[agentKey];
            // On ne garde en historique que si il y a une activité ou une obs
            if(d.act || d.obs || d.briefA === 'OUI' || d.Grv === 'OUI') {
                history.push({
                    date: dateKey,
                    agent: getSupportTechDisplayName(agentKey, agentKey),
                    agentId: normalizeSupportTechId(agentKey),
                    act: d.act,
                    obs: d.obs,
                    brief: (d.briefA === 'OUI' || d.briefD === 'OUI') ? 'OK' : '',
                    debrief: (d.debriefA === 'OUI' || d.debriefD === 'OUI') ? 'OK' : ''
                });
            }
        });
        
        localStorage.setItem('demat_history', JSON.stringify(history));
    }

    async function clearDay() {
        if(confirm("Voulez-vous vraiment vider toutes les saisies de ce jour ?")) {
            const dayKey = formatDateKey(currentDate);
            const applyLocalClear = () => {
                localStorage.removeItem('demat_day_' + dayKey);
                supportDaysWithData.delete(dayKey);
                redrawSupportDatePickerMarkers();
                updateHistoryLog(dayKey, {});
                renderTable();
            };

            if(window.SupportStore && window.supabaseClient) {
                try {
                    const clearedPayload = { __GLOBAL_OBS: "" };
                    const savedRow = await window.SupportStore.saveSupport(clearedPayload, {
                        jour: dayKey,
                        site: "VLG",
                        expectedUpdatedAt: currentDayUpdatedAt,
                        lockToken: currentDayLockToken,
                    });
                    if (savedRow?.updated_at) currentDayUpdatedAt = savedRow.updated_at;
                    const lockObj = savedRow?.payload?._lock || null;
                    if (lockObj?.token) currentDayLockToken = lockObj.token;
                    renderLockStatus('acquired', lockObj);
                    applyLocalClear();
                    if (typeof window.setSupabaseConnectionStatus === "function") {
                        window.setSupabaseConnectionStatus(true, "Supabase connecté");
                    }
                    return;
                } catch (e) {
                    const category = String(e?.category || '').toLowerCase();
                    if (category === 'conflict') {
                        alert("⚠️ Conflit détecté : la journée a été modifiée ailleurs. Rechargement.");
                        await loadAndRenderTable();
                        return;
                    }
                    if (category === 'lock') {
                        alert("⛔ Suppression refusée : un autre utilisateur édite cette journée.");
                        await ensureEditLockForCurrentDay({ silent: false });
                        return;
                    }
                    if (typeof window.setSupabaseConnectionStatus === "function") {
                        window.setSupabaseConnectionStatus(false, "Supabase indisponible");
                    }
                    alert("⚠️ Suppression cloud échouée. Aucune suppression appliquée.\n" + (e?.message || e));
                    return;
                }
            }

            applyLocalClear();
        }
    }

    // ============================================================
    // 6. GESTION DES PARAMÈTRES (Activités)
    // ============================================================

    function renderParams() {
        renderActivitiesGrid();
    }

    function renderActivitiesGrid() {
        const grid = document.getElementById('paramGrid');
        if(!grid) return;

        if (editingActivityIndex !== null && !activities[editingActivityIndex]) {
            editingActivityIndex = null;
        }

        const filteredActivities = activities
            .map((a, index) => ({ a, index }))
            .filter(({ a }) => !activitySearchTerm || activityDisplayLabel(a).toLowerCase().includes(activitySearchTerm));

        if (activitySearchTerm) {
            console.log('[ACTIVITY] search filter active');
        }

        grid.replaceChildren();

        const buildAttendanceOption = (value, label, selectedValue) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            option.selected = selectedValue === value;
            return option;
        };

        for (const { a, index } of filteredActivities) {
            const card = document.createElement('div');
            card.className = 'param-card';
            if (editingActivityIndex === index) card.classList.add('param-card--editing');

            const colorZone = document.createElement('div');
            colorZone.className = 'param-card__color-zone';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = sanitizeActivityColor(a?.color, DEFAULT_ACTIVITY_COLOR);
            colorInput.className = 'param-color-input';
            colorInput.title = 'Changer la couleur';
            colorInput.addEventListener('change', () => {
                SupportModule.updateActivityColor(index, colorInput.value);
            });
            colorZone.appendChild(colorInput);

            const mainZone = document.createElement('div');
            mainZone.className = 'param-card__main-zone';

            if (editingActivityIndex === index) {
                const editGrid = document.createElement('div');
                editGrid.className = 'param-edit-grid';

                const nameInput = document.createElement('input');
                nameInput.id = `editActName_${index}`;
                nameInput.type = 'text';
                nameInput.className = 'input';
                nameInput.value = activityDisplayLabel(a);
                nameInput.placeholder = 'Nom activité';

                const attendanceSelect = document.createElement('select');
                attendanceSelect.id = `editActAttendanceType_${index}`;
                attendanceSelect.className = 'select';
                const attendanceValue = sanitizeAttendanceType(a?.attendanceType, activityDisplayLabel(a));
                attendanceSelect.append(
                    buildAttendanceOption('present', 'Présent', attendanceValue),
                    buildAttendanceOption('absent', 'Absent', attendanceValue),
                    buildAttendanceOption('neutral', 'Neutre', attendanceValue)
                );

                editGrid.append(nameInput, attendanceSelect);
                mainZone.appendChild(editGrid);
            } else {
                const label = document.createElement('div');
                label.className = 'param-card__label';
                label.textContent = activityDisplayLabel(a);

                const badgeCfg = attendanceBadge(a?.attendanceType || 'present');
                const badge = document.createElement('span');
                badge.className = 'param-badge';
                badge.style.background = badgeCfg.bg;
                badge.style.color = badgeCfg.fg;
                badge.textContent = badgeCfg.text;

                mainZone.append(label, badge);
            }

            const actions = document.createElement('div');
            actions.className = 'param-card__actions';

            if (editingActivityIndex === index) {
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn btn--secondary param-action-btn';
                cancelBtn.title = 'Annuler';
                cancelBtn.textContent = 'Annuler';
                cancelBtn.addEventListener('click', () => SupportModule.cancelEditActivity());

                const saveBtn = document.createElement('button');
                saveBtn.className = 'btn param-action-btn';
                saveBtn.title = 'Valider';
                saveBtn.textContent = 'Enregistrer';
                saveBtn.addEventListener('click', () => SupportModule.saveEditedActivity(index));

                actions.append(cancelBtn, saveBtn);
            } else {
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn--secondary param-action-btn';
                editBtn.title = 'Modifier cette activité';
                editBtn.textContent = 'Modifier';
                editBtn.addEventListener('click', () => SupportModule.startEditActivity(index));

                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn--secondary param-action-btn param-action-btn--danger';
                deleteBtn.title = 'Supprimer cette activité';
                deleteBtn.textContent = 'Supprimer';
                deleteBtn.addEventListener('click', () => SupportModule.deleteActivity(index));

                actions.append(editBtn, deleteBtn);
            }

            card.append(colorZone, mainZone, actions);
            grid.appendChild(card);
        }

        if (!grid.firstChild) {
            const emptyCard = document.createElement('div');
            emptyCard.className = 'param-card';
            const mainZone = document.createElement('div');
            mainZone.className = 'param-card__main-zone';
            const label = document.createElement('div');
            label.className = 'param-card__label';
            label.textContent = 'Aucune activité trouvée.';
            mainZone.appendChild(label);
            emptyCard.appendChild(mainZone);
            grid.appendChild(emptyCard);
        }
    }

    function addActivity() {
        const nameInput = document.getElementById('newActName');
        const colorInput = document.getElementById('newActColor');
        const attendanceInput = document.getElementById('newActAttendanceType');
        
        const label = nameInput?.value?.trim() || '';
        const color = sanitizeActivityColor(colorInput?.value, DEFAULT_ACTIVITY_COLOR);
        const selectedType = sanitizeAttendanceType(attendanceInput?.value, label);

        if(label) {
            const candidate = normalizeActivity({
                label,
                color,
                attendanceType: selectedType,
                code: `${slugify(label)}_${Date.now()}`
            });
            const duplicate = activities.some(a => {
                const sameCode = String(a?.code || '').toLowerCase() === String(candidate?.code || '').toLowerCase();
                const sameLabel = activityDisplayLabel(a).toLowerCase() === activityDisplayLabel(candidate).toLowerCase();
                return sameCode || sameLabel;
            });
            if(duplicate) {
                showActivityToast("Cette activité existe déjà.", 'warn');
                return;
            }
            activities.push(candidate);
            saveActivities({ successMessage: "Activité enregistrée dans la base." });
            nameInput.value = ''; // Reset champ
        } else {
            showActivityToast("Veuillez entrer un nom d'activité.", 'warn');
        }
    }

    function deleteActivity(index) {
        if (!activities[index]) {
            console.warn(`[ACTIVITY] delete ignored: invalid index=${index}, size=${activities.length}`);
            return;
        }
        const actName = activityDisplayLabel(activities[index]);
        if(confirm(`Supprimer définitivement l'activité "${actName}" ?`)) {
            activities.splice(index, 1);
            if (editingActivityIndex === index) editingActivityIndex = null;
            if (editingActivityIndex !== null && editingActivityIndex > index) editingActivityIndex -= 1;
            saveActivities({ successMessage: "Activité supprimée." });
        }
    }

    function startEditActivity(index) {
        if (!activities[index]) return;
        editingActivityIndex = index;
        renderParams();
    }

    function cancelEditActivity() {
        editingActivityIndex = null;
        renderParams();
    }

    function saveEditedActivity(index) {
        if (!activities[index]) return;

        const nameInput = document.getElementById(`editActName_${index}`);
        const attendanceInput = document.getElementById(`editActAttendanceType_${index}`);
        const nextLabel = nameInput?.value?.trim() || '';
        const nextAttendance = sanitizeAttendanceType(attendanceInput?.value, nextLabel);

        if (!nextLabel) {
            showActivityToast("Le nom de l'activité ne peut pas être vide.", 'warn');
            return;
        }

        const duplicate = activities.some((a, idx) => {
            if (idx === index) return false;
            return activityDisplayLabel(a).toLowerCase() === nextLabel.toLowerCase();
        });

        if (duplicate) {
            showActivityToast("Une activité avec ce nom existe déjà.", 'warn');
            return;
        }

        activities[index] = normalizeActivity({
            ...activities[index],
            label: nextLabel,
            name: nextLabel,
            attendanceType: nextAttendance,
        }, activities[index]?.color || DEFAULT_ACTIVITY_COLOR);

        editingActivityIndex = null;
        saveActivities({ successMessage: "Activité mise à jour dans la base." });
    }

    function updateActivityColor(index, newColor) {
        if (!activities[index]) return;
        activities[index].color = sanitizeActivityColor(newColor, activities[index]?.color || DEFAULT_ACTIVITY_COLOR);
        saveActivities({ successMessage: "Activité mise à jour dans la base." });
    }

    async function saveActivities({ successMessage = '' } = {}) {
        activities = mergeActivities(activities).activities;
        localStorage.setItem('demat_activities', JSON.stringify(activities));

        const saveAttemptId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        console.log(`[ACTIVITY][${saveAttemptId}] 💾 local save done (${activities.length} activités)`);

        // Mettre à jour l'UI immédiatement pour éviter les actions sur index obsolètes
        renderParams();
        renderTable();

        // Synchronisation cloud best-effort (sans bloquer l'UI)
        const syncResult = await saveActivitiesToSupabase({ saveAttemptId });

        if (successMessage) {
            if (syncResult.status === 'ok') {
                showActivityToast(successMessage);
            } else if (syncResult.status === 'local') {
                showActivityToast("Sauvegarde locale OK. Supabase indisponible/non connecté.", 'warn');
            } else if (syncResult.status === 'error') {
                showActivityToast(syncResult.toastMessage || "Erreur lors de l'enregistrement.", 'error');
            }
        }
    }

    function mapSaveFailureToToast(category) {
        if (category === 'auth') return "Échec Supabase: session expirée / authentification requise.";
        if (category === 'network') return "Échec Supabase: problème réseau (sauvegarde locale conservée).";
        if (category === 'rls') return "Échec Supabase: accès refusé par les règles RLS.";
        if (category === 'sql') return "Échec Supabase: erreur d'écriture SQL/upsert.";
        return "Erreur lors de l'enregistrement Supabase (sauvegarde locale conservée).";
    }

    // V3.3 — Param activités partagés via support_settings (avec attendanceType)
    async function saveActivitiesToSupabase({ saveAttemptId = 'n/a' } = {}) {
        if (!window.SupportStore || !window.supabaseClient) {
            console.warn(`[ACTIVITY][${saveAttemptId}] ⚠️ Supabase non disponible -> local only`);
            if (typeof window.setSupabaseConnectionStatus === "function") {
                window.setSupabaseConnectionStatus(false, "Supabase indisponible");
            }
            return { status: 'local', category: 'auth', toastMessage: "Sauvegarde locale OK. Supabase indisponible." };
        }

        const start = performance.now();
        try {
            const payload = { activities: mergeActivities(activities).activities };
            console.log(`[ACTIVITY][${saveAttemptId}] ⏳ supabase saveSetting start rows=${payload.activities.length}`);

            const result = await window.SupportStore.saveSetting("PARAM_ACTIVITIES", payload, { site: "VLG" });

            const durationMs = Math.round(performance.now() - start);
            console.log(`[ACTIVITY][${saveAttemptId}] ✅ Supabase confirmed write in ${durationMs}ms`, result);
            if (typeof window.setSupabaseConnectionStatus === "function") {
                window.setSupabaseConnectionStatus(true, "Supabase connecté");
            }
            return { status: 'ok', category: null, result };
        } catch (e) {
            const durationMs = Math.round(performance.now() - start);
            const category = String(e?.category || e?.original?.category || '').toLowerCase();
            const normalizedCategory = ['auth', 'network', 'rls', 'sql'].includes(category) ? category : 'unknown';
            console.warn(`[ACTIVITY][${saveAttemptId}] ❌ Supabase save failed category=${normalizedCategory} in ${durationMs}ms`, e);
            if (typeof window.setSupabaseConnectionStatus === "function") {
                window.setSupabaseConnectionStatus(false, "Supabase indisponible");
            }
            return {
                status: 'error',
                category: normalizedCategory,
                toastMessage: mapSaveFailureToToast(normalizedCategory),
                error: e,
            };
        }
    }

    function showActivityToast(message, level = 'ok') {
        const toast = document.getElementById('activityToast');
        if (!toast) return;

        if (toastTimer) clearTimeout(toastTimer);
        toast.className = 'activity-toast';
        if (level === 'warn') toast.classList.add('activity-toast--warn');
        if (level === 'error') toast.classList.add('activity-toast--error');
        toast.textContent = String(message || 'Action effectuée.');
        toast.classList.add('activity-toast--show');
        console.log('[ACTIVITY] toast displayed');

        toastTimer = setTimeout(() => {
            toast.classList.remove('activity-toast--show');
        }, 2600);
    }

    function filterActivities(search) {
        activitySearchTerm = String(search || '').trim().toLowerCase();
        renderActivitiesGrid();
    }

    function clearActivitiesFilter() {
        activitySearchTerm = '';
        const input = document.getElementById('paramSearchInput');
        if (input) input.value = '';
        renderActivitiesGrid();
    }

    // V3.4 — Chargement paramètres activités:
    // - support_settings.PARAM_ACTIVITIES = source de vérité
    // - fallback historique uniquement au bootstrap (si aucun paramétrage en base)
    async function loadActivitiesFromSupabase() {
        const localActs = (() => {
            try { return JSON.parse(localStorage.getItem('demat_activities') || '[]'); }
            catch (_e) { return []; }
        })();

        let fromSettings = [];
        let fromHistory = [];
        let settingsLoaded = false;

        if (window.SupportStore && window.supabaseClient) {
            try {
                const payload = await window.SupportStore.loadSetting("PARAM_ACTIVITIES", { site: "VLG" });
                fromSettings = Array.isArray(payload?.activities)
                    ? payload.activities
                    : (Array.isArray(payload) ? payload : []);
                settingsLoaded = true;
            } catch (e) {
                console.warn("⚠️ V3.3 Chargement support_settings échoué (fallback local/historique):", e.message);
            }
        }
        
        // Si les paramètres cloud existent, ils priment.
        // On ne fusionne PAS avec l'historique pour éviter de ressusciter des activités supprimées.
        let merged;
        if (fromSettings.length > 0) {
            merged = mergeActivities(fromSettings);
        } else if (settingsLoaded) {
            // support_settings lu mais vide: bootstrap initial
            try {
                const { data: rows, error } = await window.supabaseClient
                    .from("support_journee")
                    .select("jour, payload")
                    .eq("site", "VLG")
                    .order("jour", { ascending: false })
                    .limit(120);
                if (error) throw error;
                fromHistory = extractHistoricalActivitiesFromRows(rows || []);
            } catch (e) {
                console.warn("⚠️ V3.3 Lecture historique support_journee échouée:", e.message);
            }

            merged = mergeActivities([
                ...DEFAULT_ACTIVITIES,
                ...localActs,
                ...fromHistory,
            ]);
        } else {
            // Impossible de lire support_settings (offline/auth): garder local pour ne pas écraser.
            merged = mergeActivities(localActs.length > 0 ? localActs : DEFAULT_ACTIVITIES);
        }

        activities = merged.activities;
        localStorage.setItem('demat_activities', JSON.stringify(activities));

        console.log(`[ACTIVITY] loaded ${fromSettings.length} activities`);
        console.log(`[ACTIVITY] merged historical activities: ${fromHistory.length}`);
        console.log(`[ACTIVITY] attendance types applied: ${activities.length}`);
        console.log('[ACTIVITY] UI improved V3.4.1');

        if (window.SupportStore && settingsLoaded && fromSettings.length === 0 && fromHistory.length > 0) {
            try {
                await window.SupportStore.saveSetting("PARAM_ACTIVITIES", { activities }, { site: "VLG" });
                console.log("☁️ V3.3 Référentiel fusionné repersisté dans support_settings");
            } catch (e) {
                console.warn("⚠️ V3.3 Persistance post-fusion ignorée:", e.message);
            }
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
                Object.keys(data).forEach(agentKey => {
                    if (agentKey === '__GLOBAL_OBS' || agentKey === '__PARAM_ACTIVITIES' || agentKey === '_meta' || agentKey === '_lock') return;
                    const d = data[agentKey];
                    if (d && (d.act || d.obs || d.briefA === 'OUI' || d.Grv === 'OUI' || d.greve === 'OUI')) {
                        newHistory.push({
                            date:    jour,
                            agent:   getSupportTechDisplayName(agentKey, agentKey),
                            agentId: normalizeSupportTechId(agentKey),
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
                window.TECHNICIANS.forEach((t) => {
                    const option = document.createElement('option');
                    option.value = t.name || '';
                    option.textContent = t.name || '';
                    select.appendChild(option);
                });
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

    function sanitizeCsvCell(value) {
        const cleaned = String(value ?? '')
            .replace(/\r?\n/g, ' ')
            .replace(/;/g, ',')
            .trim();
        const neutralized = /^[\s\t]*[=+\-@]/.test(cleaned)
            ? `'${cleaned}`
            : cleaned;
        return `"${neutralized.replace(/"/g, '""')}"`;
    }

    function exportCSV() {
        const key = formatDateKey(currentDate);
        const dayData = JSON.parse(localStorage.getItem('demat_day_' + key) || '{}');
        
        // En-tête CSV
        let csv = "Date;Agent;Activite;Observation;Brief_Agence;Brief_Dist;Debrief_Agence;Debrief_Dist;Grv\n";
        
        Object.keys(dayData).forEach(agentKey => {
            if(agentKey === '__GLOBAL_OBS' || agentKey === '__PARAM_ACTIVITIES' || agentKey === '_meta' || agentKey === '_lock') return;
            const d = dayData[agentKey];

            csv += [
                sanitizeCsvCell(key),
                sanitizeCsvCell(getSupportTechDisplayName(agentKey, agentKey)),
                sanitizeCsvCell(d.act || ''),
                sanitizeCsvCell(d.obs || ''),
                sanitizeCsvCell(d.briefA || ''),
                sanitizeCsvCell(d.briefD || ''),
                sanitizeCsvCell(d.debriefA || ''),
                sanitizeCsvCell(d.debriefD || ''),
                sanitizeCsvCell(d.Grv || '')
            ].join(';') + '\n';
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
        startEditActivity, cancelEditActivity, saveEditedActivity,
        renderActivitiesGrid, filterActivities, clearActivitiesFilter,
        
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
