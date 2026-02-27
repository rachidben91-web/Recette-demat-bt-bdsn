// js/supabase.js
// DEMAT-BT — Connexion Supabase
// v1.3 — 2026-02-27
// FIX: accolade manquante → setupSupportStore était imbriquée dans setupAuthUI
// FIX: todayISO() utilise maintenant l'heure locale (fr-CA) pour éviter décalage UTC
// FIX: saveSupport vérifie le verrou (locked) avant toute écriture
// NEW v1.2: SupportStore expose loadSupport/saveSupport génériques (multi-jour)
// NEW v1.3: Remplacement des prompt() par un vrai modal HTML avec autocomplete
//           → Chrome/Edge propose automatiquement l'email et le mot de passe enregistrés

const SUPABASE_URL = "https://tqeemwcnvafqvjnnrdpb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Z5fcSQtKwqktx_dbsO9nPQ_03HMnden";
// ⚠️ ATTENTION : vérifier que cette clé est bien la clé "anon/public" JWT (commence par eyJ...)
// dans Dashboard Supabase → Settings → API → Project API keys

// En v2 CDN, il faut passer par window.supabase
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

console.log("✅ Supabase client initialisé");

// -------------------------
// Modal de connexion (remplace prompt() pour activer autocomplete Chrome/Edge)
// -------------------------
function openLoginModal(supabaseClient) {
  const modal = document.getElementById("loginModal");
  const form  = document.getElementById("loginForm");
  const errEl = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmit");
  const cancelBtn = document.getElementById("loginCancel");
  if (!modal || !form) return;

  // Afficher le modal (flex pour centrage)
  errEl.style.display = "none";
  errEl.textContent = "";
  modal.style.display = "flex";

  // Focus automatique sur l'email (déclenche la suggestion du gestionnaire de mots de passe)
  setTimeout(() => document.getElementById("loginEmail")?.focus(), 80);

  // Fermer
  function closeModal() {
    modal.style.display = "none";
    form.reset();
  }

  cancelBtn.onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };

  // Soumettre
  form.onsubmit = async (e) => {
    e.preventDefault();
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    submitBtn.disabled = true;
    submitBtn.textContent = "Connexion…";
    errEl.style.display = "none";

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    submitBtn.disabled = false;
    submitBtn.textContent = "Se connecter";

    if (error) {
      errEl.textContent = "❌ " + error.message;
      errEl.style.display = "block";
    } else {
      closeModal();
      // Le gestionnaire onAuthStateChange mettra à jour le bouton automatiquement
    }
  };
}

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

    // Connexion → ouvrir le modal HTML (supporte autocomplete Chrome/Edge)
    openLoginModal(client);
  }); // ← FIX v1.1 : fermeture du addEventListener (manquait)

})(); // ← FIX v1.1 : fermeture de setupAuthUI (manquait)

// -------------------------
// Support Journée (VLG) — TEST DB
// -------------------------
(function setupSupportStore() {
  const SITE = "VLG";

  function todayISO() {
    // FIX v1.1 : utilise l'heure locale pour éviter décalage UTC en fin de journée
    // fr-CA retourne le format YYYY-MM-DD nativement
    return new Date().toLocaleDateString("fr-CA");
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

    // FIX v1.1 : vérifier le verrou avant d'écrire
    const { data: current, error: errCheck } = await window.supabaseClient
      .from("support_journee")
      .select("locked")
      .eq("jour", jour)
      .eq("site", site)
      .maybeSingle();

    if (errCheck) throw errCheck;

    if (current?.locked) {
      const msg = `⛔ La fiche du ${jour} est verrouillée. Sauvegarde annulée.`;
      console.warn(msg);
      throw new Error(msg);
    }

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
    // FIX v1.2 : méthodes génériques pour navigation multi-jour (support.js)
    loadSupport: ({ jour = todayISO(), site = SITE } = {}) => loadSupport({ jour, site }),
    saveSupport: (payload, { jour = todayISO(), site = SITE } = {}) => saveSupport(payload, { jour, site }),

    // Petit test prêt à l'emploi
    saveTest: () =>
      saveSupport(
        {
          test: true,
          message: "Hello Supabase ✅",
          at: new Date().toISOString(),
        },
        { jour: todayISO(), site: SITE }
      ),
  };

  console.log("✅ SupportStore prêt (console: SupportStore.loadToday(), SupportStore.saveTest())");
})();
