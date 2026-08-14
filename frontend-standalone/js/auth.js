/*
 * Autenticación de Tasora: registro e inicio de sesión.
 * - La sesión se guarda en localStorage (token de acceso).
 * - El registro guarda el correo del usuario en la base de datos.
 * - Sin sesión no se puede tasar: app.js llama a Auth.requireLogin(...).
 */
(() => {
  "use strict";

  const AUTH_KEY = "tasadorAuthV1";

  let session = null;
  let pendingCb = null;

  function aUrl(path) {
    return (typeof window.apiUrl === "function") ? window.apiUrl(path) : path;
  }

  /* ---------- Estado de la sesión ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) { session = null; }
    return session;
  }

  function save(s) {
    session = s;
    try { localStorage.setItem(AUTH_KEY, JSON.stringify(s)); } catch (e) { /* se ignora */ }
  }

  function clear() {
    session = null;
    try { localStorage.removeItem(AUTH_KEY); } catch (e) { /* se ignora */ }
  }

  function isLoggedIn() { return !!(session && session.token); }
  function getToken() { return session ? session.token : null; }
  function getUser() { return session ? session.user : null; }

  function authHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    const t = getToken();
    if (t) headers["Authorization"] = "Bearer " + t;
    return headers;
  }

  /* fetch que incluye el token de sesión en las APIs protegidas */
  function fetchAuth(url, opts) {
    opts = opts || {};
    const headers = authHeaders(opts.headers || {});
    if (!headers["Accept"]) headers["Accept"] = "application/json";
    return fetch(aUrl(url), Object.assign({}, opts, { headers }));
  }

  /* ---------- Llamadas al servidor ---------- */
  async function register({ name, email, password }) {
    const res = await fetch(aUrl("/api/auth/registro"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo crear la cuenta.");
    if (data.token) save(data);
    return data;
  }

  async function login({ email, password }) {
    const res = await fetch(aUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo iniciar sesión.");
    if (data.token) save(data);
    return data;
  }

  async function logout() {
    const t = getToken();
    clear();
    updateUI();
    if (!t) return;
    try {
      await fetch(aUrl("/api/auth/logout"), {
        method: "POST",
        headers: { "Authorization": "Bearer " + t }
      });
    } catch (e) { /* se ignora */ }
  }

  /* Valida el token guardado contra el servidor (solo limpia si responde 401). */
  async function refresh() {
    if (!getToken()) { updateUI(); return false; }
    try {
      const res = await fetchAuth("/api/auth/me");
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data && data.user) {
          session.user = data.user;
          save(session);
          updateUI();
          return true;
        }
        clear(); updateUI(); return false;
      }
      if (res.status === 401) { clear(); updateUI(); return false; }
      updateUI();
      return true;
    } catch (e) {
      updateUI(); /* red caída: se conserva la sesión */
      return true;
    }
  }

  /* ---------- UI: botón de la barra superior ---------- */
  function updateUI() {
    const btn = document.getElementById("authBtn");
    const userEl = document.getElementById("authUser");
    if (!btn) return;
    const u = getUser();
    if (u) {
      btn.textContent = "Salir";
      btn.title = "Cerrar sesión";
      if (userEl) {
        userEl.textContent = (u.name || u.email || "").split(" ")[0];
        userEl.classList.remove("hidden");
      }
    } else {
      btn.textContent = "Ingresar";
      btn.title = "Iniciar sesión o crear cuenta";
      if (userEl) userEl.classList.add("hidden");
    }
  }

  /* ---------- UI: modal de inicio de sesión / registro ---------- */
  let modal, tabLogin, tabRegister, form, nameWrap, nameInput, emailInput,
      passInput, submitBtn, statusEl, noteEl;

  function els() {
    modal = modal || document.getElementById("authModal");
    tabLogin = tabLogin || document.getElementById("authTabLogin");
    tabRegister = tabRegister || document.getElementById("authTabRegister");
    form = form || document.getElementById("authForm");
    nameWrap = nameWrap || document.getElementById("authNameWrap");
    nameInput = nameInput || document.getElementById("authName");
    emailInput = emailInput || document.getElementById("authEmail");
    passInput = passInput || document.getElementById("authPass");
    submitBtn = submitBtn || document.getElementById("authSubmit");
    statusEl = statusEl || document.getElementById("authStatus");
    noteEl = noteEl || document.getElementById("authNote");
  }

  function setStatus(msg, isErr) {
    els();
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("hidden", !msg);
    statusEl.classList.toggle("err", !!isErr && !!msg);
    statusEl.classList.toggle("ok", !isErr && !!msg);
  }

  function setMode(mode) {
    els();
    const isReg = mode === "register";
    if (tabLogin) tabLogin.classList.toggle("active", !isReg);
    if (tabRegister) tabRegister.classList.toggle("active", isReg);
    if (nameWrap) nameWrap.classList.toggle("hidden", !isReg);
    if (passInput) passInput.setAttribute("autocomplete", isReg ? "new-password" : "current-password");
    if (submitBtn) submitBtn.textContent = isReg ? "Crear cuenta y empezar" : "Ingresar";
    if (noteEl) {
      noteEl.textContent = isReg
        ? "Al crear tu cuenta, tu correo queda guardado en nuestra base de datos y podrás tasar propiedades."
        : "Ingresa con tu correo y contraseña para realizar tasaciones.";
    }
    setStatus("");
  }

  function show(message) {
    els();
    if (!modal) return;
    setMode(getUser() ? "login" : "register");
    if (form) form.reset();
    const msgEl = document.getElementById("authMessage");
    if (msgEl) {
      if (message) { msgEl.textContent = message; msgEl.classList.remove("hidden"); }
      else msgEl.classList.add("hidden");
    }
    setStatus("");
    modal.classList.remove("hidden");
    document.body.classList.add("no-scroll");
    setTimeout(() => {
      if (emailInput) emailInput.focus();
    }, 50);
  }

  function hide() {
    els();
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.classList.remove("no-scroll");
  }

  /* Pide iniciar sesión: si ya hay sesión ejecuta cb; si no, muestra el modal. */
  function requireLogin(cb, message) {
    if (isLoggedIn()) { if (cb) cb(); return; }
    pendingCb = cb || null;
    show(message || "Inicia sesión o crea tu cuenta para poder tasar tu propiedad.");
  }

  function bindUI() {
    els();
    if (!modal) return;
    const closeBtn = document.getElementById("authClose");
    if (closeBtn) closeBtn.addEventListener("click", hide);
    modal.addEventListener("click", (e) => { if (e.target === modal) hide(); });
    if (tabLogin) tabLogin.addEventListener("click", () => setMode("login"));
    if (tabRegister) tabRegister.addEventListener("click", () => setMode("register"));
    if (form) form.addEventListener("submit", onSubmit);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) hide();
    });
    const btn = document.getElementById("authBtn");
    if (btn) {
      btn.addEventListener("click", () => {
        if (isLoggedIn()) {
          if (window.confirm("¿Cerrar tu sesión?")) logout();
        } else {
          show();
        }
      });
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    els();
    const isReg = tabRegister && tabRegister.classList.contains("active");
    const email = (emailInput.value || "").trim();
    const password = passInput.value || "";
    const name = (nameInput.value || "").trim();
    if (!email || !password) { setStatus("Ingresa tu correo y contraseña.", true); return; }
    setStatus("");
    submitBtn.disabled = true;
    const original = submitBtn.textContent;
    submitBtn.textContent = isReg ? "Creando cuenta…" : "Ingresando…";
    try {
      if (isReg) {
        if (!name) { throw new Error("Ingresa tu nombre completo."); }
        await register({ name, email, password });
      } else {
        await login({ email, password });
      }
      hide();
      updateUI();
      const cb = pendingCb;
      pendingCb = null;
      if (cb) setTimeout(cb, 0);
    } catch (err) {
      setStatus(err.message || "Ocurrió un error.", true);
      submitBtn.disabled = false;
      submitBtn.textContent = original;
    }
  }

  /* ---------- Inicialización ---------- */
  load();
  bindUI();
  updateUI();
  refresh();

  window.Auth = {
    load, save, clear,
    isLoggedIn, getToken, getUser,
    authHeaders, fetchAuth,
    register, login, logout, refresh,
    show, hide, requireLogin
  };
})();
