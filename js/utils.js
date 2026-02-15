/* js/utils.js — DEMAT-BT v11.0.0 — 15/02/2026
   Fonctions utilitaires partagées (DOM, texte, formatage)
*/

// Raccourci getElementById
const $ = (id) => document.getElementById(id);

// Normalisation texte
function norm(s) {
  return (s || "")
    .replace(/\s+/g, " ")
    .replace(/[']/g, "'")
    .trim();
}

function safeUpper(s) {
  return norm(s).toUpperCase();
}

function extractDayFromFilename(input) {
  if (!input) return null;
  const str = String(input);

  // Attrape 20260119 où qu'il soit dans la chaîne (nom fichier, cache, etc.)
  const m = str.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;

  const yyyy = m[1], mm = m[2], dd = m[3];
  return `${dd}/${mm}/${yyyy}`;
}

// Formatage durée "01h00\n08h00 - 09h00" → "1h (08h00-09h00)"
function formatDuree(raw) {
  if (!raw) return "";
  const lines = raw.split(/\n/);
  const parts = [];
  for (const l of lines) {
    const t = l.trim();
    if (t) parts.push(t);
  }
  if (parts.length >= 2) return `${parts[0]} (${parts[1]})`;
  if (parts.length === 1) return parts[0];
  return raw;
}

// Extraction créneau horaire depuis BT
function extractTimeSlot(bt) {
  const duree = (bt.duree || "").toUpperCase();
  const desi = (bt.designation || "").toUpperCase();

  // Format GRDF dans DUREE: "01h00\n08h00 - 09h00"
  const grdfPattern = /(\d{1,2})h(\d{2})\s*[-–]\s*(\d{1,2})h(\d{2})/i;
  
  // Chercher d'abord sur la 2ème ligne de durée (horaire)
  const dureeLines = duree.split(/\n/);
  for (const line of dureeLines) {
    const match = line.match(grdfPattern);
    if (match) {
      return {
        start: parseInt(match[1]) + parseInt(match[2]) / 60,
        end: parseInt(match[3]) + parseInt(match[4]) / 60,
        text: `${match[1]}h${match[2]} - ${match[3]}h${match[4]}`
      };
    }
  }

  // Fallback sur designation
  const desiMatch = desi.match(grdfPattern);
  if (desiMatch) {
    return {
      start: parseInt(desiMatch[1]) + parseInt(desiMatch[2]) / 60,
      end: parseInt(desiMatch[3]) + parseInt(desiMatch[4]) / 60,
      text: `${desiMatch[1]}h${desiMatch[2]} - ${desiMatch[3]}h${desiMatch[4]}`
    };
  }

  return null;
}

// Recherche technicien par NNI dans la base TECHNICIANS
function mapTechByNni(nni) {
  const techs = window.TECHNICIANS || [];
  return techs.find(t => (t.nni || "").toUpperCase() === (nni || "").toUpperCase()) || null;
}

function techKey(tech) {
  return tech ? (tech.id || tech.nni) : "";
}
