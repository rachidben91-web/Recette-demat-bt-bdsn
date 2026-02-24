// js/supabase.js
// DEMAT-BT — Connexion Supabase

const SUPABASE_URL = "https://tqeemwcnvafqvjnnrdpb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Z5fcSQtKwqktx_dbsO9nPQ_03HMnden";

// En v2 CDN, il faut passer par window.supabase
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("✅ Supabase client initialisé");

// -------------------------
// Auth UI (Magic link email)
// -------------------------
(function setupAuthUI() {
  const btn = document.getElementById("btnAuth");
  const status = document.getElementById("authStatus");
  const client = window.supabaseClient;

  if (!btn || !status || !client) {
    console.warn("Auth UI: éléments manquants (btnAuth/authStatus/supabaseClient).");
    return;
  }

  function setUI(user) {
    if (user?.email) {
      status.textContent = `Connecté : ${user.email}`;
      btn.textContent = "Se déconnecter";
      btn.dataset.state = "out";
    } else {
      status.textContent = "Non connecté";
      btn.textContent = "Se connecter";
      btn.dataset.state = "in";
    }
  }

  // État initial
  client.auth.getUser().then(({ data }) => setUI(data?.user)).catch(() => setUI(null));

  // Suivre les changements de session
  client.auth.onAuthStateChange((_event, session) => {
    setUI(session?.user || null);
  });

  // Click bouton
  btn.addEventListener("click", async () => {
    const state = btn.dataset.state;

    // Déconnexion
    if (state === "out") {
      await client.auth.signOut();
      return;
    }

    // Connexion (magic link)
    const email = prompt("Email pour connexion (lien magique) :");
    if (!email) return;

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.href
      }
    });

    if (error) {
      console.error("Auth error:", error);
      alert("Erreur connexion : " + error.message);
    } else {
      alert("✅ Lien envoyé par email. Clique dessus pour te connecter.");
    }
  });
})();
