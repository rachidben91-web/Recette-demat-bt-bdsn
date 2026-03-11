// js/supabase.js
// DEMAT-BT — Connexion Supabase
// v1.4 — 2026-02-27
// V3.1: SupportStore expose loadSetting/saveSetting pour support_settings (Param activités)
// FIX: accolade manquante → setupSupportStore était imbriquée dans setupAuthUI
// FIX: todayISO() utilise l'heure locale (fr-CA) pour éviter décalage UTC
// FIX: saveSupport vérifie le verrou (locked) avant toute écriture
// NEW v1.2: SupportStore expose loadSupport/saveSupport génériques (multi-jour)
// NEW v1.3: Modal HTML avec autocomplete (Chrome/Edge gère les mots de passe)
// NEW v1.4: Forçage changement de mot de passe à la 1ère connexion
//           → flag user_metadata.must_change_password détecté après signIn
//           → modal dédié bloque l'interface jusqu'au changement effectif

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

function classifySupabaseError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || 0);

  if (message.includes("jwt") || message.includes("session") || message.includes("auth") || status === 401 || status === 403) {
    return "auth";
  }
  if (message.includes("lock") || message.includes("acquiretimeout") || message.includes("navigator lock")) {
    return "auth";
  }
  if (message.includes("failed to fetch") || message.includes("network") || status === 0 || status >= 500) {
    return "network";
  }
  if (code === "42501" || message.includes("row-level security") || message.includes("rls") || message.includes("permission denied")) {
    return "rls";
  }
  if (message.includes("upsert") || message.includes("duplicate") || message.includes("violates") || message.includes("invalid input") || message.includes("not-null")) {
    return "sql";
  }
  return "unknown";
}

async function getAuthContextRobust() {
  const client = window.supabaseClient;
  try {
    const { data, error } = await client.auth.getUser();
    if (error) throw error;
    if (data?.user) {
      return { user: data.user, source: "getUser" };
    }
  } catch (e) {
    console.warn("[SUPABASE][AUTH] getUser échoué, tentative fallback getSession:", e?.message || e);
  }

  try {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (data?.session?.user) {
      return { user: data.session.user, source: "getSession" };
    }
  } catch (e) {
    console.warn("[SUPABASE][AUTH] getSession échoué:", e?.message || e);
  }

  return { user: null, source: "none" };
}

// -------------------------
// Modal de connexion (autocomplete Chrome/Edge)
// -------------------------
function openLoginModal(supabaseClient) {
  const modal     = document.getElementById("loginModal");
  const form      = document.getElementById("loginForm");
  const errEl     = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmit");
  const cancelBtn = document.getElementById("loginCancel");
  if (!modal || !form) return;

  errEl.style.display = "none";
  errEl.textContent   = "";
  modal.style.display = "flex";
  setTimeout(() => document.getElementById("loginEmail")?.focus(), 80);

  function closeModal() {
    modal.style.display = "none";
    form.reset();
  }

  cancelBtn.onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const email    = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    submitBtn.disabled    = true;
    submitBtn.textContent = "Connexion…";
    errEl.style.display   = "none";

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    submitBtn.disabled    = false;
    submitBtn.textContent = "Se connecter";

    if (error) {
      errEl.textContent   = "❌ " + error.message;
      errEl.style.display = "block";
      return;
    }

    closeModal();

    // ── Vérifier si l'utilisateur doit changer son mot de passe ──
    const meta = data?.user?.user_metadata || {};
    if (meta.must_change_password === true) {
      console.warn("🔑 Première connexion — forçage changement de mot de passe.");
      openChangePasswordModal(supabaseClient);
    }
  };
}

// -------------------------
// Modal changement de mot de passe (première connexion)
// -------------------------
function openChangePasswordModal(supabaseClient) {
  const modal     = document.getElementById("changePasswordModal");
  const form      = document.getElementById("changePasswordForm");
  const errEl     = document.getElementById("changePasswordError");
  const submitBtn = document.getElementById("changePasswordSubmit");
  const newPwEl   = document.getElementById("newPassword");
  const confPwEl  = document.getElementById("confirmPassword");
  const fillEl    = document.getElementById("pwStrengthFill");
  const labelEl   = document.getElementById("pwStrengthLabel");
  if (!modal || !form) return;

  modal.style.display = "flex";
  setTimeout(() => newPwEl?.focus(), 80);

  // Indicateur de force du mot de passe
  function passwordStrength(pw) {
    let score = 0;
    if (pw.length >= 8)           score++;
    if (pw.length >= 12)          score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score; // 0-5
  }

  newPwEl.addEventListener("input", () => {
    const pw    = newPwEl.value;
    const score = passwordStrength(pw);
    const colors = ["#ef4444","#f97316","#eab308","#3b82f6","#10b981"];
    const labels = ["Très faible","Faible","Moyen","Bon","Excellent"];
    fillEl.style.width      = Math.min(100, score * 20) + "%";
    fillEl.style.background = colors[Math.max(0, score - 1)] || "#e5e7eb";
    labelEl.textContent     = pw.length ? labels[Math.max(0, score - 1)] : "";
    labelEl.style.color     = colors[Math.max(0, score - 1)] || "#9ca3af";
  });

  // Non fermable — l'utilisateur DOIT changer son mot de passe
  modal.onclick = (e) => e.stopPropagation();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const newPw  = newPwEl.value;
    const confPw = confPwEl.value;
    errEl.style.display = "none";

    if (newPw !== confPw) {
      errEl.textContent   = "❌ Les mots de passe ne correspondent pas.";
      errEl.style.display = "block";
      return;
    }
    if (newPw.length < 8) {
      errEl.textContent   = "❌ Le mot de passe doit contenir au moins 8 caractères.";
      errEl.style.display = "block";
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = "Enregistrement…";

    // 1) Changer le mot de passe
    const { error: pwError } = await supabaseClient.auth.updateUser({ password: newPw });
    if (pwError) {
      errEl.textContent   = "❌ " + pwError.message;
      errEl.style.display = "block";
      submitBtn.disabled    = false;
      submitBtn.textContent = "✅ Enregistrer mon mot de passe";
      return;
    }

    // 2) Retirer le flag must_change_password
    await supabaseClient.auth.updateUser({ data: { must_change_password: false } });

    // 3) Fermer et afficher toast
    modal.style.display = "none";
    form.reset();

    const toast = document.createElement("div");
    toast.textContent = "✅ Mot de passe mis à jour avec succès !";
    Object.assign(toast.style, {
      position:"fixed", bottom:"24px", right:"24px", zIndex:"99999",
      background:"#10b981", color:"#fff", padding:"12px 20px",
      borderRadius:"8px", fontWeight:"700", fontSize:".9rem",
      boxShadow:"0 4px 16px rgba(0,0,0,.2)"
    });
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity="0"; setTimeout(() => toast.remove(), 400); }, 3500);

    console.log("✅ Mot de passe changé et flag must_change_password retiré.");
  };
}

// -------------------------
// Auth UI
// -------------------------
(function setupAuthUI() {
  const btn    = document.getElementById("btnAuth");
  const status = document.getElementById("authStatus");
  const client = window.supabaseClient;

  if (!btn || !status || !client) {
    console.warn("Auth UI: éléments manquants (btnAuth/authStatus/supabaseClient).");
    return;
  }

  function setUI(user) {
    if (user?.email) {
      status.textContent = `Connecté : ${user.email}`;
      btn.textContent    = "Se déconnecter";
      btn.dataset.state  = "out";
    } else {
      status.textContent = "Non connecté";
      btn.textContent    = "Se connecter";
      btn.dataset.state  = "in";
    }
  }

  // État initial — vérifier aussi le flag si session déjà active
  client.auth.getUser().then(({ data }) => {
    setUI(data?.user);
    const meta = data?.user?.user_metadata || {};
    if (meta.must_change_password === true) {
      console.warn("🔑 Session active avec must_change_password — forçage.");
      openChangePasswordModal(client);
    }
  }).catch(() => setUI(null));

  // Changements de session
  client.auth.onAuthStateChange((_event, session) => {
    setUI(session?.user || null);
  });

  // Bouton connexion / déconnexion
  btn.addEventListener("click", async () => {
    if (btn.dataset.state === "out") {
      await client.auth.signOut();
      return;
    }
    openLoginModal(client);
  });

})();

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

  // V3.1 — Settings partagés (table support_settings)
  async function loadSetting(settingKey, { site = SITE } = {}) {
    if (!settingKey) throw new Error("settingKey requis");

    const { data, error } = await window.supabaseClient
      .from("support_settings")
      .select("payload")
      .eq("site", site)
      .eq("setting_key", settingKey)
      .maybeSingle();

    if (error) {
      console.warn(`[SUPABASE] ⚠️ loadSetting(${settingKey}) échoué:`, error.message);
      throw error;
    }

    console.log(`[SUPABASE] 📥 setting chargé: ${settingKey} (${site})`);
    return data?.payload ?? null;
  }

  async function saveSetting(settingKey, payload, { site = SITE } = {}) {
    if (!settingKey) throw new Error("settingKey requis");

    const saveId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const authContext = await getAuthContextRobust();
    const updatedBy = authContext.user?.id || null;
    const payloadKeys = (payload && typeof payload === "object") ? Object.keys(payload).length : 0;

    console.log(`[SUPABASE][${saveId}] ⏳ saveSetting start key=${settingKey} site=${site} updatedBy=${updatedBy ? "yes" : "no"} authSource=${authContext.source} payloadKeys=${payloadKeys}`);

    const startedAt = performance.now();
    const { data, error } = await window.supabaseClient
      .from("support_settings")
      .upsert(
        {
          site,
          setting_key: settingKey,
          payload,
          updated_at: new Date().toISOString(),
          updated_by: updatedBy,
        },
        { onConflict: "site,setting_key" }
      )
      .select("site, setting_key, updated_at")
      .single();

    const durationMs = Math.round(performance.now() - startedAt);

    if (error) {
      const category = classifySupabaseError(error);
      console.warn(`[SUPABASE][${saveId}] ❌ saveSetting failed category=${category} durationMs=${durationMs}:`, error);
      throw Object.assign(new Error(error.message || "saveSetting échoué"), {
        original: error,
        category,
        saveId,
        operation: "support_settings.upsert",
      });
    }

    console.log(`[SUPABASE][${saveId}] ✅ saveSetting success key=${settingKey} site=${site} durationMs=${durationMs}`, data);
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
    // V3.1 : paramètres partagés (support_settings)
    loadSetting: (settingKey, { site = SITE } = {}) => loadSetting(settingKey, { site }),
    saveSetting: (settingKey, payload, { site = SITE } = {}) => saveSetting(settingKey, payload, { site }),

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
