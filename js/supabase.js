// js/supabase.js
// DEMAT-BT — Connexion Supabase

const SUPABASE_URL = "https://TON_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TA_CLE_ICI";

// En v2 CDN, il faut passer par window.supabase
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("✅ Supabase client initialisé");
