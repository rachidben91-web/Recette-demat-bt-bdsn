/* js/weather.js — DEMAT-BT v11.0.1 — 15/02/2026
   Module météo autonome — Open-Meteo (sans clé API)
   Remplace wttr.in par Open-Meteo pour + de stabilité (GitHub Pages OK)
*/

const WEATHER_COMMUNES = [
  { name: "Villeneuve-la-Garenne", lat: 48.9369, lon: 2.3260 },
  { name: "Gennevilliers",         lat: 48.9326, lon: 2.2927 },
  { name: "Asnières-sur-Seine",    lat: 48.9142, lon: 2.2872 },
  { name: "Colombes",              lat: 48.9233, lon: 2.2527 },
  { name: "Bois-Colombes",         lat: 48.9169, lon: 2.2694 },
  { name: "Saint-Denis",           lat: 48.9362, lon: 2.3574 }
];

// Open-Meteo weather codes: https://open-meteo.com/en/docs
function getOpenMeteoIcon(code) {
  const c = Number(code);

  // Clair / nuageux
  if (c === 0) return "☀️";
  if (c === 1) return "🌤️";
  if (c === 2) return "⛅";
  if (c === 3) return "☁️";

  // Brouillard
  if (c === 45 || c === 48) return "🌫️";

  // Bruine
  if (c === 51 || c === 53 || c === 55) return "🌦️";
  // Bruine verglaçante
  if (c === 56 || c === 57) return "🌧️";

  // Pluie
  if (c === 61 || c === 63 || c === 65) return "🌧️";
  // Pluie verglaçante
  if (c === 66 || c === 67) return "🌧️";

  // Neige
  if (c === 71 || c === 73 || c === 75) return "🌨️";
  if (c === 77) return "❄️";

  // Averses
  if (c === 80 || c === 81 || c === 82) return "🌦️";

  // Averses de neige
  if (c === 85 || c === 86) return "🌨️";

  // Orages
  if (c === 95) return "⛈️";
  if (c === 96 || c === 99) return "⛈️";

  return "🌡️";
}

async function updateWeather() {
  const el = $("topWeather");
  if (!el) return;

  try {
    const weatherPromises = WEATHER_COMMUNES.map(async (commune) => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${encodeURIComponent(commune.lat)}` +
          `&longitude=${encodeURIComponent(commune.lon)}` +
          `&current=temperature_2m,weathercode` +
          `&timezone=Europe%2FParis`;

        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const current = data?.current;

        const temp = current?.temperature_2m;
        const code = current?.weathercode;

        return {
          name: commune.name,
          temp: Number.isFinite(temp) ? Math.round(temp) : "—",
          icon: getOpenMeteoIcon(code)
        };
      } catch (err) {
        console.error(`Erreur météo pour ${commune.name}:`, err);
        return { name: commune.name, temp: "—", icon: "🌡️" };
      }
    });

    const results = await Promise.all(weatherPromises);

    el.innerHTML = results
      .map(r => `<span style="white-space:nowrap;">${r.icon} ${r.name.split('-')[0]}: ${r.temp}°C</span>`)
      .join('<span style="margin:0 8px; opacity:0.3;">|</span>');
  } catch (err) {
    console.error("Erreur météo globale:", err);
    el.innerHTML = '<span style="opacity:0.6;">Météo indisponible</span>';
  }
}

function updateDateTime() {
  const el = $("topDatetime");
  if (!el) return;

  const now = new Date();
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  const date = now.toLocaleDateString("fr-FR", opts);
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  el.textContent = `${date} — ${time}`;
}
