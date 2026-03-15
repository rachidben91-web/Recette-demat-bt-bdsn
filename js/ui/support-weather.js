// js/ui/support-weather.js
// Sous-module météo du Support Journée

(function () {
    function formatSupportWeatherDateLabel(dateObj) {
        if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return '';
        return dateObj.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        });
    }

    function createWeatherLoadingCard(message) {
        const card = document.createElement('div');
        card.className = 'support-weather-card support-weather-card--loading';
        card.textContent = String(message || '');
        return card;
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

    async function renderForecast({ currentDate, formatDateKey }) {
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

    window.SupportWeather = {
        renderForecast,
    };
})();
