/* BTB Academy admin - shared shell: auth guard, navigation, toasts, confirm dialog.
   The guard here is a convenience (redirects non-admins). The real protection is Row Level Security:
   without an admins row, the database and storage reject every write no matter what this script does. */
(function () {
  "use strict";
  var B = window.BTB, esc = B.esc;
  var A = (window.BTBAdmin = {});

  A.NAV = [
    ["index.html", "Dashboard", "speedometer2", "dashboard"],
    ["videos.html", "Videos", "camera-video", "videos"],
    ["courses.html", "Courses", "journal-bookmark", "courses"],
    ["ebooks.html", "Ebooks", "book", "ebooks"],
    ["bookings.html", "Bookings", "calendar-check", "bookings"],
    ["orders.html", "Orders", "credit-card", "orders"],
    ["settings.html", "Settings", "gear", "settings"]
  ];

  /* Verify a signed-in user is on the admins allow-list. Returns the user, or null. */
  A.checkAdmin = async function () {
    var s = await B.db.auth.getSession();
    var user = s.data && s.data.session && s.data.session.user;
    if (!user) { return null; }
    var r = await B.db.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
    return (!r.error && r.data) ? user : null;
  };

  A.logout = async function () {
    try { await B.db.auth.signOut(); } catch (e) { /* ignore */ }
    window.location.href = "login.html";
  };

  /* Call at the top of every admin page. Resolves with the admin user once access is confirmed. */
  A.start = async function (current) {
    var main = B.$(".admin-main");
    if (!B.isConfigured() || !B.db) {
      main.innerHTML = B.notConfiguredHtml(); main.hidden = false; return null;
    }
    var user;
    try { user = await A.checkAdmin(); }
    catch (e) { main.hidden = false; B.showError(main, B.friendlyError(e), function () { window.location.reload(); }); return null; }
    if (!user) { window.location.replace("login.html"); return null; }

    var links = A.NAV.map(function (n) {
      return '<li><a href="' + n[0] + '"' + (n[3] === current ? ' aria-current="page"' : "") + '><i class="bi bi-' + n[2] + '" aria-hidden="true"></i>' + n[1] + "</a></li>";
    }).join("");
    B.$("#adminSide").innerHTML =
      '<a class="admin-brand" href="index.html"><img src="../assets/images/btb-logo.png" alt="" width="60" height="38"><span>BTB Admin<small>Speak Beyond Limits.</small></span></a>' +
      '<nav aria-label="Admin"><ul class="admin-nav">' + links + '<li><button type="button" data-logout><i class="bi bi-box-arrow-right" aria-hidden="true"></i>Logout</button></li></ul></nav>';
    B.$("#adminMobile").innerHTML = A.NAV.map(function (n) {
      return '<a href="' + n[0] + '"' + (n[3] === current ? ' aria-current="page"' : "") + ">" + n[1] + "</a>";
    }).join("") + '<button type="button" data-logout>Logout</button>';
    B.$$("[data-logout]").forEach(function (b) { b.addEventListener("click", A.logout); });
    main.hidden = false;
    return user;
  };

  /* ---- toast --------------------------------------------------------------- */
  A.toast = function (message, type) {
    var area = B.$("#toastArea");
    if (!area) { area = document.createElement("div"); area.id = "toastArea"; area.className = "toast-area"; area.setAttribute("role", "status"); area.setAttribute("aria-live", "polite"); document.body.appendChild(area); }
    var t = document.createElement("div");
    t.className = "toast-msg is-" + (type || "ok");
    t.textContent = message;
    area.appendChild(t);
    setTimeout(function () { t.remove(); }, type === "error" ? 9000 : 4500);
  };

  /* ---- confirm dialog (Bootstrap modal) -> Promise<boolean> ------------------- */
  A.confirm = function (title, bodyHtml, okLabel, danger) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.className = "modal fade"; wrap.tabIndex = -1; wrap.setAttribute("aria-hidden", "true");
      wrap.innerHTML = '<div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5">' + esc(title) +
        '</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body">' + bodyHtml +
        '</div><div class="modal-footer"><button type="button" class="btn-btb-outline btn-sm-btb" data-bs-dismiss="modal">Cancel</button><button type="button" class="btn-sm-btb ' +
        (danger ? "btn-btb btn-danger-btb" : "btn-btb") + '" data-ok>' + esc(okLabel || "Confirm") + "</button></div></div></div>";
      document.body.appendChild(wrap);
      var modal = new window.bootstrap.Modal(wrap), result = false;
      wrap.querySelector("[data-ok]").addEventListener("click", function () { result = true; modal.hide(); });
      wrap.addEventListener("hidden.bs.modal", function () { modal.dispose(); wrap.remove(); resolve(result); });
      modal.show();
    });
  };

  /* Info-only dialog (e.g. "cannot delete because...") */
  A.notice = function (title, bodyHtml) {
    return A.confirm(title, bodyHtml, "OK", false);
  };

  /* ---- shared data helpers ------------------------------------------------------ */
  A.must = async function (q) { var r = await q; if (r.error) { throw r.error; } return r.data || []; };
  A.byOrder = function (a, b) { return (a.display_order - b.display_order) || String(a.created_at).localeCompare(String(b.created_at)); };

  A.reorder = async function (table, ids) {
    var r = await B.db.rpc("reorder_items", { p_table: table, p_ids: ids });
    if (r.error) { throw r.error; }
  };

  /* Remove files from a bucket. Returns the list of paths that could NOT be removed. */
  A.removeFiles = async function (bucket, paths) {
    paths = paths.filter(Boolean);
    if (!paths.length) { return []; }
    var r = await B.db.storage.from(bucket).remove(paths);
    if (r.error) { return paths; }
    var gone = (r.data || []).map(function (o) { return o.name; });
    return paths.filter(function (p) { return gone.indexOf(p) === -1; });
  };

  A.fileExt = function (file) {
    var m = /\.([a-z0-9]{2,5})$/i.exec(file.name || "");
    if (m) { return m[1].toLowerCase(); }
    return ({ "video/mp4": "mp4", "video/webm": "webm", "application/pdf": "pdf", "application/epub+zip": "epub", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[file.type] || "bin";
  };

  /* Validate a chosen file. Returns an error string or "". */
  A.checkFile = function (file, kind) {
    var C = B.config, isVideo = kind === "video";
    var types = isVideo ? C.videoTypes : kind === "ebook" ? C.ebookTypes : C.thumbTypes, maxMB = isVideo ? C.maxVideoMB : kind === "ebook" ? C.maxEbookMB : C.maxThumbMB;
    if (types.indexOf(file.type) === -1) {
      return "Unsupported file type" + (file.type ? " (" + file.type + ")" : "") + ". Allowed: " + types.map(function (t) { return t.split("/")[1].toUpperCase(); }).join(", ") + ".";
    }
    if (file.size > maxMB * 1048576) { return "File is too large (" + B.fmtBytes(file.size) + "). The limit is " + maxMB + " MB."; }
    if (file.size === 0) { return "The file is empty."; }
    return "";
  };

  /* Upload a small file (thumbnail) through the standard API. */
  A.uploadSmall = async function (bucket, path, file) {
    var r = await B.db.storage.from(bucket).upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
    if (r.error) { throw r.error; }
  };

  /* Resumable (TUS) upload for videos. `ctl.abort()` cancels. onProgress(percent). */
  A.uploadVideo = function (file, path, onProgress, ctl) { return A.uploadResumable(B.config.videoBucket, file, path, onProgress, ctl); };
  A.uploadResumable = function (bucket, file, path, onProgress, ctl) {
    var C = B.config;
    return new Promise(function (resolve, reject) {
      if (!window.tus) { reject(new Error("Upload library failed to load.")); return; }
      var upload = new window.tus.Upload(file, {
        endpoint: C.supabaseUrl + "/storage/v1/upload/resumable",
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: { apikey: C.supabaseKey, "x-upsert": "false" },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        chunkSize: 6 * 1024 * 1024,
        metadata: { bucketName: bucket, objectName: path, contentType: file.type, cacheControl: "3600" },
        onBeforeRequest: async function (req) {
          var s = await B.db.auth.getSession();
          if (s.data && s.data.session) { req.setHeader("Authorization", "Bearer " + s.data.session.access_token); }
        },
        onError: function (err) { reject(err); },
        onProgress: function (sent, total) { onProgress(Math.floor(sent / total * 100)); },
        onSuccess: function () { resolve(); }
      });
      ctl.abort = function () {
        upload.abort(true).catch(function () { /* already gone */ });
        reject(new Error("Upload cancelled"));
      };
      upload.start();
    });
  };

  A.fillSelect = function (sel, items, placeholder, selected) {
    sel.innerHTML = '<option value="">' + esc(placeholder) + "</option>" + items.map(function (i) {
      return '<option value="' + esc(i.id) + '"' + (i.id === selected ? " selected" : "") + ">" + esc(i.title) + "</option>";
    }).join("");
  };
})();
