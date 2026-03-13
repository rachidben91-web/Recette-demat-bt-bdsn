/* js/weather.js — DEMAT-BT v11.1.0 — 13/03/2026
   Module météo autonome — Open-Meteo (sans clé API)
   Affiche : icône + commune + température + probabilité de pluie (heure courante)
   + prévisions journalières pour Support Journée avec indicateur RSF
*/

const WEATHER_COMMUNES = [
  { name: "Villeneuve_la_Garenne", lat: 48.9369, lon: 2.3260 },
  { name: "Groslay", lat: 48.9867, lon: 2.3444 },
  { name: "Bois_Colombes", lat: 48.9169, lon: 2.2694 },
  { name: "Saint_Denis", lat: 48.9362, lon: 2.3574 }
];

const WEATHER_TIMEZONE = "Europe/Paris";
const WEATHER_FORECAST_DAYS = 7;
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const WEATHER_CACHE = new Map();

// Open-Meteo weather codes: https://open-meteo.com/en/docs
function getOpenMeteoIcon(code) {
  const c = Number(code);

  if (c === 0) return "☀️";
  if (c === 1) return "🌤️";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";

  if (c === 45 || c === 48) return "🌫️";

  if (c === 51 || c === 53 || c === 55) return "🌦️";
  if (c === 56 || c === 57) return "🌧️";

  if (c === 61 || c === 63 || c === 65) return "🌧️";
  if (c === 66 || c === 67) return "🌧️";

  if (c === 71 || c === 73 || c === 75) return "🌨️";
  if (c === 77) return "❄️";

  if (c === 80 || c === 81 || c === 82) return "🌦️";

  if (c === 85 || c === 86) return "🌨️";

  if (c === 95) return "⛈️";
  if (c === 96 || c === 99) return "⛈️";

  return "🌡️";
}

// Trouve l’index de l’heure la plus proche dans un tableau Open-Meteo (ISO strings)
function nearestHourIndex(times) {
  if (!Array.isArray(times) || times.length === 0) return -1;

  const now = Date.now();
  let bestIdx = 0;
  let bestDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function prettyName(name) {
  return String(name || "").replace(/_/g, " ");
}

function weatherDateKey(dateLike) {
  const d = (dateLike instanceof Date) ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CA");
}

function getCurrentWeatherCode(payload) {
  return payload?.current?.weather_code ?? payload?.current?.weathercode ?? null;
}

function getRainRiskBadge(forecast) {
  const rainMm = Number(forecast?.rainMm || 0);
  const rainProb = Number(forecast?.rainProbMax || 0);
  const rainHours = Number(forecast?.rainHours || 0);
  const weatherCode = Number(forecast?.weatherCode || -1);
  const wetCode = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(weatherCode);

  if (rainMm >= 1 || rainProb >= 60 || rainHours >= 2 || wetCode) {
    return {
      level: "risk",
      label: "RSF deconseillee",
      summary: "Humidite probable du sol"
    };
  }

  if (rainMm >= 0.2 || rainProb >= 35 || rainHours >= 1) {
    return {
      level: "warn",
      label: "RSF a surveiller",
      summary: "Humidite possible"
    };
  }

  return {
    level: "good",
    label: "RSF favorable",
    summary: "Conditions seches probables"
  };
}

function buildDailyForecastByDate(payload) {
  const daily = payload?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  const weatherCodes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
  const tempMax = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max : [];
  const tempMin = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min : [];
  const rainProb = Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max : [];
  const rainHours = Array.isArray(daily.precipitation_hours) ? daily.precipitation_hours : [];
  const rainSum = Array.isArray(daily.rain_sum) ? daily.rain_sum : [];

  const byDate = {};
  for (let i = 0; i < times.length; i++) {
    const key = String(times[i] || "");
    if (!key) continue;
    const forecast = {
      date: key,
      weatherCode: Number(weatherCodes[i]),
      icon: getOpenMeteoIcon(weatherCodes[i]),
      tempMax: Number.isFinite(Number(tempMax[i])) ? Math.round(Number(tempMax[i])) : null,
      tempMin: Number.isFinite(Number(tempMin[i])) ? Math.round(Number(tempMin[i])) : null,
      rainProbMax: Number.isFinite(Number(rainProb[i])) ? Math.round(Number(rainProb[i])) : null,
      rainHours: Number.isFinite(Number(rainHours[i])) ? Number(rainHours[i]) : 0,
      rainMm: Number.isFinite(Number(rainSum[i])) ? Number(rainSum[i]) : 0
    };
    forecast.rsf = getRainRiskBadge(forecast);
    byDate[key] = forecast;
  }
  return byDate;
}

async function fetchCommuneWeather(commune, { force = false } = {}) {
  const cached = WEATHER_CACHE.get(commune.name);
  const now = Date.now();
  if (!force && cached && (now - cached.fetchedAt) < WEATHER_CACHE_TTL_MS) {
    return cached.data;
  }

  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${encodeURIComponent(commune.lat)}` +
    `&longitude=${encodeURIComponent(commune.lon)}` +
    `&current=temperature_2m,weather_code` +
    `&hourly=precipitation_probability` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_hours,rain_sum` +
    `&forecast_days=${WEATHER_FORECAST_DAYS}` +
    `&timezone=${encodeURIComponent(WEATHER_TIMEZONE)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const payload = await res.json();
  const current = payload?.current || {};
  const times = payload?.hourly?.time || [];
  const probs = payload?.hourly?.precipitation_probability || [];
  const idx = nearestHourIndex(times);
  const rainPct = idx >= 0 && Number.isFinite(Number(probs[idx]))
    ? Math.round(Number(probs[idx]))
    : null;

  const data = {
    name: commune.name,
    current: {
      temp: Number.isFinite(Number(current?.temperature_2m)) ? Math.round(Number(current.temperature_2m)) : "—",
      icon: getOpenMeteoIcon(getCurrentWeatherCode(payload)),
      rainPct,
      weatherCode: getCurrentWeatherCode(payload)
    },
    dailyByDate: buildDailyForecastByDate(payload)
  };

  WEATHER_CACHE.set(commune.name, { fetchedAt: now, data });
  return data;
}

async function updateWeather() {
  const el = $("topWeather");
  if (!el) return;

  try {
    const weatherPromises = WEATHER_COMMUNES.map(async (commune) => {
      try {
        const data = await fetchCommuneWeather(commune);
        return {
          name: commune.name,
          temp: data.current.temp,
          icon: data.current.icon,
          rainPct: data.current.rainPct
        };
      } catch (err) {
        console.error(`Erreur météo pour ${commune.name}:`, err);
        return { name: commune.name, temp: "—", icon: "🌡️", rainPct: null };
      }
    });

    const results = await Promise.all(weatherPromises);

    el.innerHTML = results
      .map(r => {
        const city = prettyName(r.name).split("-")[0];
        const rain = (r.rainPct == null) ? "" : ` <span style="opacity:.85;">(Pluie ${r.rainPct}%)</span>`;
        return `<span style="white-space:nowrap;">${r.icon} ${city}: ${r.temp}°C${rain}</span>`;
      })
      .join('<span style="margin:0 8px; opacity:0.3;">|</span>');
  } catch (err) {
    console.error("Erreur météo globale:", err);
    el.innerHTML = '<span style="opacity:0.6;">Météo indisponible</span>';
  }
}

async function getForecastForDate(dateLike) {
  const dateKey = weatherDateKey(dateLike);
  if (!dateKey) throw new Error("Date météo invalide.");

  const results = await Promise.all(WEATHER_COMMUNES.map(async (commune) => {
    try {
      const data = await fetchCommuneWeather(commune);
      return {
        name: commune.name,
        current: data.current,
        forecast: data.dailyByDate[dateKey] || null
      };
    } catch (err) {
      console.error(`Erreur prévision météo pour ${commune.name}:`, err);
      return {
        name: commune.name,
        current: { temp: "—", icon: "🌡️", rainPct: null, weatherCode: null },
        forecast: null
      };
    }
  }));

  return {
    dateKey,
    communes: results
  };
}

window.WeatherModule = {
  getForecastForDate,
  prettyName,
  getOpenMeteoIcon
};

function updateDateTime() {
  const el = $("topDatetime");
  if (!el) return;

  const now = new Date();
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const date = now.toLocaleDateString("fr-FR", opts);
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  el.textContent = `${date} — ${time}`;
}
