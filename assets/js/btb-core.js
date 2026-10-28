/* BTB Academy - shared helpers + Supabase client. Used by the public site and the admin area.
   Exposes window.BTB. Requires assets/js/config.js and assets/vendor/supabase/supabase.js first. */
(function () {
  "use strict";
  var C = window.BTB_CONFIG || {};
  var B = (window.BTB = {});
  B.config = C;

  /* A legacy service_role key is a JWT whose payload says role=service_role. Refuse it in the browser. */
  function isServiceRoleJwt(key) {
    try {
      var part = String(key).split(".")[1] || "";
      var json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
      return JSON.parse(json).role === "service_role";
    } catch (e) { return false; }
  }

  B.isConfigured = function () {
    return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(C.supabaseUrl || "") &&
      !/YOUR-/i.test(C.supabaseUrl || "") && !!C.supabaseKey && !/YOUR-/i.test(C.supabaseKey);
  };

  /* Only the password-reset page reads tokens from the URL (the emailed recovery link); every other page ignores them. */
  var onResetPage = !!document.body && document.body.getAttribute("data-page") === "reset";

  B.db = null;
  if (B.isConfigured() && !/sb_secret_/i.test(C.supabaseKey) && !isServiceRoleJwt(C.supabaseKey) && window.supabase && window.supabase.createClient) {
    B.db = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: onResetPage }
    });
  }

  /* ---- small utilities ---------------------------------------------------- */
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  B.esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); };
  B.$ = function (sel, root) { return (root || document).querySelector(sel); };
  B.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  B.param = function (name) { return new URLSearchParams(window.location.search).get(name) || ""; };

  B.slugify = function (text) {
    return String(text).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
  };
  B.randomSuffix = function () {
    var a = new Uint8Array(3); (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  };
  B.uuid = function () {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16);
    });
  };

  B.fmtDuration = function (s) {
    if (s == null || isNaN(s)) { return ""; }
    s = Math.round(s);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return h ? h + ":" + pad(m) + ":" + pad(sec) : m + ":" + pad(sec);
  };
  B.fmtBytes = function (n) {
    if (n < 1024) { return n + " B"; }
    if (n < 1048576) { return (n / 1024).toFixed(0) + " KB"; }
    if (n < 1073741824) { return (n / 1048576).toFixed(1) + " MB"; }
    return (n / 1073741824).toFixed(2) + " GB";
  };
  B.plural = function (n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); };

  /* ---- storage URLs ------------------------------------------------------- */
  B.thumbUrl = function (path) {
    if (!path || !B.db) { return ""; }
    return B.db.storage.from(C.thumbBucket).getPublicUrl(path).data.publicUrl;
  };
  /* Short-lived signed link to a lesson video. RLS only allows this for published lessons (admins: all). */
  B.signedVideoUrl = async function (path) {
    var r = await B.db.storage.from(C.videoBucket).createSignedUrl(path, C.signedUrlSeconds || 7200);
    if (r.error || !r.data || !r.data.signedUrl) { throw r.error || new Error("Could not create video link"); }
    return r.data.signedUrl;
  };

  /* ---- thumbnails: placeholder when missing, and never a broken image ----- */
  B.thumbHtml = function (path, alt, cls) {
    var url = B.thumbUrl(path);
    var ph = '<span class="thumb-ph" aria-hidden="true"><i class="bi bi-play-circle"></i></span>';
    return '<span class="thumb ' + (cls || "") + '">' + ph +
      (url ? '<img src="' + B.esc(url) + '" alt="' + B.esc(alt || "") + '" loading="lazy" decoding="async" data-thumb>' : "") + "</span>";
  };
  document.addEventListener("error", function (e) {
    var t = e.target;
    if (t && t.tagName === "IMG" && t.hasAttribute("data-thumb")) { t.remove(); }
  }, true);

  /* ---- loading / empty / error states ------------------------------------- */
  B.showLoading = function (el, label) {
    el.innerHTML = '<div class="state-box" role="status"><div class="spinner-border text-secondary" aria-hidden="true"></div><p class="mb-0 mt-3">' + B.esc(label || "Loading...") + "</p></div>";
  };
  B.showEmpty = function (el, icon, title, text, actionHtml) {
    el.innerHTML = '<div class="state-box"><i class="bi bi-' + B.esc(icon || "collection-play") + ' state-icon" aria-hidden="true"></i><h3>' +
      B.esc(title) + "</h3><p>" + B.esc(text || "") + "</p>" + (actionHtml || "") + "</div>";
  };
  B.showError = function (el, message, retry) {
    el.innerHTML = '<div class="state-box state-box--error" role="alert"><i class="bi bi-exclamation-triangle state-icon" aria-hidden="true"></i><h3>Something went wrong</h3><p>' +
      B.esc(message || "Please check your connection and try again.") + '</p><button type="button" class="btn-btb btn-sm-btb" data-retry>Try again</button></div>';
    var b = el.querySelector("[data-retry]");
    if (b && retry) { b.addEventListener("click", retry); }
  };
  /* Say exactly what is wrong so the fix is obvious. Returns "" when everything is fine. */
  B.configProblem = function () {
    var url = C.supabaseUrl || "", key = C.supabaseKey || "";
    if (!url || /YOUR-/i.test(url)) { return "supabaseUrl in assets/js/config.js is still the placeholder. Paste your Project URL (https://xxxx.supabase.co)."; }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url)) { return "supabaseUrl must look like https://YOUR-REF.supabase.co (no trailing slash, no /rest/v1 path)."; }
    if (!key || /YOUR-/i.test(key)) { return "supabaseKey in assets/js/config.js is still the placeholder. Paste your publishable (anon) key."; }
    if (/sb_secret_/i.test(key) || isServiceRoleJwt(key)) { return "That looks like a SECRET (service_role) key. Never put it in frontend code - use the publishable/anon key."; }
    if (!window.supabase || !window.supabase.createClient) { return "The Supabase library (assets/vendor/supabase/supabase.js) did not load."; }
    return "";
  };
  B.notConfiguredHtml = function () {
    var why = B.configProblem();
    return '<div class="state-box state-box--error" role="alert"><i class="bi bi-gear state-icon" aria-hidden="true"></i><h3>Site not connected yet</h3>' +
      "<p>" + B.esc(why || "Could not connect to Supabase.") + " See the README, section Setup.</p></div>";
  };
  B.friendlyError = function (err) {
    var m = (err && (err.message || err.error_description)) || "";
    if (/failed to fetch|network|load failed/i.test(m)) { return "Network problem. Please check your internet connection."; }
    return m || "Unexpected error.";
  };

  /* ---- footer year, shared across pages ----------------------------------- */
  B.$$("[data-year]").forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
