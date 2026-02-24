// js/supabase.js
// DEMAT-BT — Connexion Supabase

// ⚠️ Remplace par TES valeurs
const SUPABASE_URL = "https://tqeemwcnvafqvjnnrdpb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Z5fcSQtKwqktx_dbsO9nPQ_03HMnden";

// Création du client
window.supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// Petit log de confirmation
console.log("✅ Supabase client initialisé");
