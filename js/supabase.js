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
    // -------------------------
// Support Journée (VLG) — TEST DB
// -------------------------
(function setupSupportStore() {
  const SITE = "VLG";

  function todayISO() {
    // Format YYYY-MM-DD (UTC) — ok pour une clé "jour"
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  async function requireUser() {
    const { data, error } = await window.supabaseClient.auth.getUser();
    if (error) throw error;
    if (!data?.user) throw new Error("Utilisateur non connecté");
    return data.user;
  }

  async function loadSupport({ jour = todayISO(), site = SITE } = {}) {
    // 1) Tenter de lire
    const { data, error } = await window.supabaseClient
      .from("support_journee")
      .select("id, jour, site, payload, locked, updated_at, updated_by")
      .eq("jour", jour)
      .eq("site", site)
      .maybeSingle();

    if (error) throw error;

    // 2) Si pas trouvé -> créer une ligne vide
    if (!data) {
      const user = await requireUser();
      const emptyPayload = { _meta: { createdAt: new Date().toISOString(), createdBy: user.email } };

      const { data: created, error: err2 } = await window.supabaseClient
        .from("support_journee")
        .upsert(
          {
            jour,
            site,
            payload: emptyPayload,
            updated_at: new Date().toISOString(),
            updated_by: user.id,
          },
          { onConflict: "jour,site" }
        )
        .select("id, jour, site, payload, locked, updated_at, updated_by")
        .single();

      if (err2) throw err2;
      console.log("🆕 Support créé en base :", created);
      return created;
    }

    console.log("📥 Support chargé depuis la base :", data);
    return data;
  }

  async function saveSupport(payload, { jour = todayISO(), site = SITE } = {}) {
    const user = await requireUser();

    const { data, error } = await window.supabaseClient
      .from("support_journee")
      .upsert(
        {
          jour,
          site,
          payload,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "jour,site" }
      )
      .select("id, jour, site, payload, locked, updated_at, updated_by")
      .single();

    if (error) throw error;

    console.log("💾 Support sauvegardé en base :", data);
    return data;
  }

  // Expose des helpers pour test console
  window.SupportStore = {
    SITE,
    todayISO,
    loadToday: () => loadSupport({ jour: todayISO(), site: SITE }),
    saveToday: (payload) => saveSupport(payload, { jour: todayISO(), site: SITE }),

    // Petit test prêt à l’emploi
    saveTest: () =>
      saveSupport(
        {
          test: true,
          message: "Hello Supabase ",
          at: new Date().toISOString(),
        },
        { jour: todayISO(), site: SITE }
      ),
  };

  console.log(" SupportStore prêt (console: SupportStore.loadToday(), SupportStore.saveTest())");
})();
