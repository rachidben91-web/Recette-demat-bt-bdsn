/* js/state.js — DEMAT-BT v11.0.0 — 16/02/2026
   État global de l'application + constantes de configuration
   Mis à jour : Intégration FOR-113 et nouveaux types de pièces jointes
*/

const APP_VERSION = "V11.5.4";

/**
 * Configuration des types de documents détectables.
 * Chaque type possède une icône, une couleur et une description pour l'UI.
 */
const DOC_TYPES_CONFIG = {
  "BT":     { label: "BT",     icon: "📋", color: "#17499c", desc: "Bon de Travail" },
  "AT":     { label: "AT",     icon: "✅", color: "#059669", desc: "Autorisation de Travail" },
  "FOR113": { label: "FOR-113", icon: "📋", color: "#0ea5e9", desc: "Fiche de préparation et suivi (FOR-113)" },
  "PROC":   { label: "PROC",   icon: "📝", color: "#2563eb", desc: "Procédure d'exécution / Mode opératoire" },
  "PLAN":   { label: "PLAN",   icon: "🗺️", color: "#7c3aed", desc: "Plan de situation / Cartographie" },
  "PHOTO":  { label: "PHOTO",  icon: "📷", color: "#dc2626", desc: "Photos / Images terrain" },
  "STREET": { label: "STREET", icon: "🌍", color: "#ea580c", desc: "Vue Google Street View" },
  "DOC":    { label: "DOC",    icon: "📄", color: "#85ab95", desc: "Document générique / Annexe" }
};

// Liste des clés de types pour les itérations UI (filtres, badges)
const DOC_TYPES = Object.keys(DOC_TYPES_CONFIG);

/**
 * État global mutable de l'application.
 * Centralise les données PDF, la liste des BT extraits et les filtres actifs.
 */
const state = {
  // Données PDF sources
  pdf: null,           // Instance PDF.js
  pdfFile: null,       // File object binaire
  pdfName: "",         // Nom du fichier chargé
  totalPages: 0,       // Nombre total de pages du PDF
  
  // Données métier extraites
  bts: [],             // Tableau des objets BT détectés
  
  // Interface et navigation
  view: "referent",    // Vue actuelle : "referent" (globale) ou "brief" (technicien)
  layout: "grid",      // Layout en vue référent : "grid" (vignettes) ou "timeline" (activités)
  referentDisplayMode: "large", // Mode d'affichage référent : "large", "small" ou "list"
  
  // Filtres de recherche et d'affichage
  filters: {
    q: "",             // Recherche textuelle (ID, Client, Adresse...)
    types: new Set(),  // Types de documents sélectionnés (BT, AT, FOR113...)
    techId: ""         // ID (NNI) du technicien sélectionné pour le filtrage
  },
  
  // Statistiques calculées
  countsByTechId: new Map(), // Nombre de BT par technicien (clé: NNI)
  
  // État de la visionneuse (Modal)
  modal: {
    open: false,       // Visibilité de la modal
    currentBT: null,   // BT actuellement visualisé
    currentPage: 1     // Page du PDF affichée dans le canvas
  }
};
