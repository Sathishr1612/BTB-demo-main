/* BTB Academy admin - page controllers. Every success message is shown only after Supabase confirms the write. */
(function () {
  "use strict";
  var B = window.BTB, A = window.BTBAdmin, C = B.config, esc = B.esc, $ = B.$;
  var page = document.body.getAttribute("data-page");
  var badge = function (s) { return '<span class="badge-status is-' + esc(s) + '">' + (s === "published" ? "Published" : "Draft") + "</span>"; };
  var setErr = function (el, msg) { el.textContent = msg || ""; el.hidden = !msg; };

  /* ===== Login ============================================================= */
  async function initLogin() {
    var form = $("#loginForm"), err = $("#loginError"), btn = $("#loginBtn");
    if (!B.db) { form.hidden = true; $("#loginSetup").innerHTML = B.notConfiguredHtml(); return; }
    if (B.param("denied")) { setErr(err, "That account is not an administrator."); }
    try { if (await A.checkAdmin()) { window.location.replace("index.html"); return; } } catch (e) { /* show form */ }
    form.addEventListener("submit", async function (e) {
      e.preventDefault(); setErr(err, "");
      if (!form.checkValidity()) { form.classList.add("was-validated"); return; }
      btn.disabled = true; btn.textContent = "Signing in...";
      try {
        var r = await B.db.auth.signInWithPassword({ email: form.elements.email.value.trim(), password: form.elements.password.value });
        if (r.error) { throw r.error; }
        if (!(await A.checkAdmin())) { await B.db.auth.signOut(); throw new Error("This account is not an administrator."); }
        window.location.replace("index.html");
      } catch (ex) {
        setErr(err, /invalid login/i.test(ex.message) ? "Incorrect email or password." : B.friendlyError(ex));
        btn.disabled = false; btn.textContent = "Sign in";
      }
    });
  }

  /* ===== Dashboard ========================================================= */
  async function initDashboard() {
    var cards = $("#statCards"), enq = $("#enquiries");
    var count = function (table, status) {
      var q = B.db.from(table).select("id", { count: "exact", head: true });
      if (status) { q = q.eq("status", status); }
      return q;
    };
    var load = async function () {
      B.showLoading(cards, "Loading...");
      try {
        var r = await Promise.all([count("courses"), count("modules"), count("videos"), count("videos", "published"), count("ebooks"),
          B.db.from("bookings").select("id", { count: "exact", head: true }).eq("status", "new"),
          B.db.from("orders").select("amount_paise").eq("status", "paid").limit(5000)]);
        r.forEach(function (x) { if (x.error) { throw x.error; } });
        var revenue = r[6].data.reduce(function (t, o) { return t + o.amount_paise; }, 0);
        var items = [["Total courses", r[0].count], ["Total modules", r[1].count], ["Total videos", r[2].count], ["Published videos", r[3].count],
          ["Ebooks", r[4].count], ["New booking requests", r[5].count], ["Paid orders", r[6].data.length], ["Verified revenue", "\u20B9" + (revenue / 100).toLocaleString("en-IN")]];
        cards.innerHTML = '<div class="row g-3">' + items.map(function (i) {
          return '<div class="col-6 col-xl-3"><div class="stat-card"><strong>' + i[1] + "</strong><span>" + i[0] + "</span></div></div>";
        }).join("") + "</div>";
      } catch (e) { B.showError(cards, B.friendlyError(e), load); }
    };
    var loadEnq = async function () {
      try {
        var rows = await A.must(B.db.from("enquiries").select("*").order("created_at", { ascending: false }).limit(8));
        if (!rows.length) { enq.innerHTML = '<p class="text-muted mb-0">No messages yet.</p>'; return; }
        enq.innerHTML = rows.map(function (m) {
          return '<div class="border-bottom py-2"><div class="d-flex justify-content-between gap-2 flex-wrap"><strong>' + esc(m.name) + (m.is_read ? "" : ' <span class="badge-status is-draft">New</span>') + "</strong><small class=\"text-muted\">" +
            esc(new Date(m.created_at).toLocaleString()) + "</small></div><div class=\"text-muted small\">" + esc(m.contact) + "</div><p class=\"mb-1\">" + esc(m.message) + "</p>" +
            '<div class="row-actions">' + (m.is_read ? "" : '<button class="btn btn-outline-secondary btn-xs" data-read="' + esc(m.id) + '">Mark as read</button>') +
            '<button class="btn btn-outline-danger btn-xs" data-del="' + esc(m.id) + '">Delete</button></div></div>';
        }).join("");
      } catch (e) { B.showError(enq, B.friendlyError(e), loadEnq); }
    };
    enq.addEventListener("click", async function (e) {
      var rid = e.target.getAttribute("data-read"), did = e.target.getAttribute("data-del");
      try {
        if (rid) {
          var u = await B.db.from("enquiries").update({ is_read: true }).eq("id", rid).select();
          if (u.error || !u.data.length) { throw u.error || new Error("Not updated"); }
          loadEnq();
        } else if (did && await A.confirm("Delete message", "<p>Delete this message permanently?</p>", "Delete", true)) {
          var d = await B.db.from("enquiries").delete().eq("id", did).select();
          if (d.error || !d.data.length) { throw d.error || new Error("Not deleted"); }
          A.toast("Message deleted."); loadEnq();
        }
      } catch (ex) { A.toast(B.friendlyError(ex), "error"); }
    });
    load(); loadEnq();
  }

  /* ===== Videos list ======================================================= */
  async function initVideos() {
    var box = $("#videoList"), fSearch = $("#fSearch"), fCourse = $("#fCourse"), fModule = $("#fModule"), fStatus = $("#fStatus");
    var data = { courses: [], modules: [], videos: [] };
    if (B.param("saved")) { A.toast("Video saved.", "ok"); window.history.replaceState(null, "", "videos.html"); }

    var render = function () {
      var q = fSearch.value.trim().toLowerCase();
      var rows = data.videos.filter(function (v) {
        return (!q || v.title.toLowerCase().indexOf(q) !== -1) && (!fCourse.value || v.course_id === fCourse.value) &&
          (!fModule.value || v.module_id === fModule.value) && (!fStatus.value || v.status === fStatus.value);
      });
      if (!data.videos.length) { B.showEmpty(box, "camera-video", "No videos yet", "Upload your first lesson to get started.", '<a class="btn-btb btn-sm-btb" href="video-edit.html">Add New Video</a>'); return; }
      if (!rows.length) { B.showEmpty(box, "search", "No videos match your filters", "Try clearing the search or filters."); return; }
      var cn = {}, mn = {};
      data.courses.forEach(function (c) { cn[c.id] = c.title; }); data.modules.forEach(function (m) { mn[m.id] = m.title; });
      box.innerHTML = '<div class="admin-card p-0"><table class="table table-admin table-responsive-stack align-middle mb-0"><thead><tr><th scope="col">Thumbnail</th><th scope="col">Title</th><th scope="col">Course</th><th scope="col">Module</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' +
        rows.map(function (v) {
          return "<tr><td><div class=\"row-thumb\">" + B.thumbHtml(v.thumbnail_path, "") + "</div></td><td><strong>" + esc(v.title) + "</strong></td><td>" + esc(cn[v.course_id] || "") + "</td><td>" + esc(mn[v.module_id] || "") +
            "</td><td>" + (v.duration_seconds != null ? B.fmtDuration(v.duration_seconds) : "-") + "</td><td>" + badge(v.status) +
            '</td><td><div class="row-actions"><a class="btn btn-outline-secondary btn-xs" href="video-edit.html?id=' + esc(v.id) + '">Edit</a>' +
            '<button type="button" class="btn btn-outline-secondary btn-xs" data-toggle="' + esc(v.id) + '">' + (v.status === "published" ? "Unpublish" : "Publish") + "</button>" +
            '<button type="button" class="btn btn-outline-danger btn-xs" data-del="' + esc(v.id) + '">Delete</button></div></td></tr>';
        }).join("") + "</tbody></table></div>";
    };
    var fillModules = function () {
      var list = data.modules.filter(function (m) { return !fCourse.value || m.course_id === fCourse.value; });
      A.fillSelect(fModule, list, "All modules", fModule.value);
    };
    var load = async function () {
      B.showLoading(box, "Loading videos...");
      try {
        var r = await Promise.all([A.must(B.db.from("courses").select("id,title,display_order,created_at")), A.must(B.db.from("modules").select("id,title,course_id,display_order,created_at")), A.must(B.db.from("videos").select("*"))]);
        data.courses = r[0].sort(A.byOrder); data.modules = r[1].sort(A.byOrder); data.videos = r[2].sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
        A.fillSelect(fCourse, data.courses, "All courses", fCourse.value); fillModules(); render();
      } catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    fSearch.addEventListener("input", render); fStatus.addEventListener("change", render); fModule.addEventListener("change", render);
    fCourse.addEventListener("change", function () { fModule.value = ""; fillModules(); render(); });
    $("#filterForm").addEventListener("submit", function (e) { e.preventDefault(); });

    box.addEventListener("click", async function (e) {
      var btn = e.target.closest("button"); if (!btn) { return; }
      var tid = btn.getAttribute("data-toggle"), did = btn.getAttribute("data-del");
      var v = data.videos.filter(function (x) { return x.id === (tid || did); })[0]; if (!v) { return; }
      try {
        if (tid) {
          var to = v.status === "published" ? "draft" : "published";
          btn.disabled = true;
          var u = await B.db.from("videos").update({ status: to }).eq("id", v.id).select();
          if (u.error || !u.data.length) { btn.disabled = false; throw u.error || new Error("The change was not saved."); }
          v.status = to; A.toast(to === "published" ? "Video published." : "Video unpublished. It is hidden from the website."); render();
        } else if (did) {
          var ok = await A.confirm("Delete this video?", "<p><strong>" + esc(v.title) + "</strong> will be removed from the website and its video file and thumbnail will be deleted from storage. This cannot be undone.</p>", "Delete video", true);
          if (!ok) { return; }
          btn.disabled = true;
          var d = await B.db.from("videos").delete().eq("id", v.id).select();
          if (d.error || !d.data.length) { btn.disabled = false; throw d.error || new Error("The video was not deleted."); }
          data.videos = data.videos.filter(function (x) { return x.id !== v.id; }); render();
          var left = (await A.removeFiles(C.videoBucket, [v.video_storage_path])).concat(await A.removeFiles(C.thumbBucket, [v.thumbnail_path]));
          if (left.length) { A.toast("Video record deleted, but these files could not be removed from storage: " + left.join(", ") + ". Remove them in the Supabase Storage page.", "error"); }
          else { A.toast("Video and its files were deleted."); }
        }
      } catch (ex) { A.toast("Error: " + B.friendlyError(ex), "error"); }
    });
    load();
  }

  /* ===== Add / edit video ================================================== */
  async function initVideoForm() {
    var f = $("#videoForm"), editId = B.param("id");
    var els = { title: $("#vTitle"), course: $("#vCourse"), module: $("#vModule"), order: $("#vOrder"), preview: $("#vPreview"), desc: $("#vDesc"), thumb: $("#vThumb"), file: $("#vFile"), status: $("#vStatus") };
    var fileInfo = $("#fileInfo"), thumbInfo = $("#thumbInfo"), thumbPrev = $("#thumbPreview"), cur = $("#currentFile"), formErr = $("#formError");
    var prog = $("#progressBox"), bar = $("#progressBar"), progText = $("#progressText");
    var buttons = B.$$("#videoForm button[type=submit], #cancelBtn");
    var courses = [], modules = [], existing = null, duration = null, busy = false, ctl = { abort: null }, cancelled = false, pickedPreview = "";

    $("#pageTitle").textContent = editId ? "Edit Video" : "Add New Video";
    $("#vLimit").textContent = "MP4 or WebM, up to " + C.maxVideoMB + " MB.";
    $("#tLimit").textContent = "JPG, PNG or WebP, up to " + C.maxThumbMB + " MB.";

    try {
      var r = await Promise.all([A.must(B.db.from("courses").select("id,title,display_order,created_at")), A.must(B.db.from("modules").select("id,title,course_id,display_order,created_at"))]);
      courses = r[0].sort(A.byOrder); modules = r[1].sort(A.byOrder);
      if (editId) {
        var rows = await A.must(B.db.from("videos").select("*").eq("id", editId).limit(1));
        if (!rows.length) { f.innerHTML = '<p class="text-danger mb-0">Video not found. <a href="videos.html">Back to videos</a></p>'; return; }
        existing = rows[0];
      }
    } catch (e) { B.showError(f, B.friendlyError(e), function () { window.location.reload(); }); return; }

    var preCourse = existing ? existing.course_id : B.param("course"), preModule = existing ? existing.module_id : B.param("module");
    A.fillSelect(els.course, courses, "Select a course", preCourse);
    var fillMods = function (selected) {
      var list = modules.filter(function (m) { return m.course_id === els.course.value; });
      A.fillSelect(els.module, list, els.course.value ? (list.length ? "Select a module" : "No modules in this course yet") : "Select a course first", selected);
      els.module.disabled = !list.length;
    };
    fillMods(preModule);
    els.course.addEventListener("change", function () { fillMods(""); });

    if (existing) {
      els.order.value = existing.display_order; els.preview.checked = !!existing.is_preview; els.title.value = existing.title; els.desc.value = existing.description || ""; els.status.value = existing.status;
      duration = existing.duration_seconds;
      cur.hidden = false;
      cur.innerHTML = '<i class="bi bi-film" aria-hidden="true"></i> Current video: <code>' + esc(existing.video_storage_path.split("/").pop()) + "</code>" + (duration != null ? " (" + B.fmtDuration(duration) + ")" : "") + ". Choose a new file only if you want to replace it.";
      els.file.required = false;
      if (existing.thumbnail_path) { thumbPrev.innerHTML = B.thumbHtml(existing.thumbnail_path, "Current thumbnail"); thumbPrev.hidden = false; }
    } else { els.file.required = true; }
    $("#vFileLabel").classList.toggle("req", !existing);

    /* file pickers: validate immediately and show name + size */
    els.file.addEventListener("change", function () {
      var file = els.file.files[0]; duration = existing ? existing.duration_seconds : null; els.file.setCustomValidity("");
      if (!file) { fileInfo.textContent = ""; return; }
      var bad = A.checkFile(file, "video");
      if (bad) { els.file.setCustomValidity(bad); fileInfo.innerHTML = '<span class="text-danger">' + esc(bad) + "</span>"; return; }
      fileInfo.textContent = file.name + " - " + B.fmtBytes(file.size);
      var url = URL.createObjectURL(file), probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = function () { duration = isFinite(probe.duration) ? Math.round(probe.duration) : null; fileInfo.textContent = file.name + " - " + B.fmtBytes(file.size) + (duration != null ? " - " + B.fmtDuration(duration) : ""); URL.revokeObjectURL(url); };
      probe.onerror = function () { fileInfo.textContent += " - could not read the duration (this browser may not be able to play this file)"; URL.revokeObjectURL(url); };
      probe.src = url;
    });
    els.thumb.addEventListener("change", function () {
      var file = els.thumb.files[0]; els.thumb.setCustomValidity(""); if (pickedPreview) { URL.revokeObjectURL(pickedPreview); pickedPreview = ""; }
      if (!file) { thumbInfo.textContent = ""; return; }
      var bad = A.checkFile(file, "thumb");
      if (bad) { els.thumb.setCustomValidity(bad); thumbInfo.innerHTML = '<span class="text-danger">' + esc(bad) + "</span>"; return; }
      thumbInfo.textContent = file.name + " - " + B.fmtBytes(file.size);
      pickedPreview = URL.createObjectURL(file);
      thumbPrev.hidden = false; thumbPrev.innerHTML = '<span class="thumb"><img src="' + esc(pickedPreview) + '" alt="New thumbnail preview"></span>';
    });

    var lock = function (on) { busy = on; buttons.forEach(function (b) { if (b.id !== "cancelBtn") { b.disabled = on; } }); };
    window.addEventListener("beforeunload", function (e) { if (busy) { e.preventDefault(); e.returnValue = ""; } });

    $("#cancelBtn").addEventListener("click", async function () {
      if (busy) {
        if (await A.confirm("Cancel upload?", "<p>The upload will stop and nothing will be saved.</p>", "Stop upload", true)) { cancelled = true; if (ctl.abort) { ctl.abort(); } }
        return;
      }
      window.location.href = "videos.html";
    });

    var submit = async function (status) {
      if (busy) { return; }
      setErr(formErr, "");
      els.status.value = status;
      els.title.setCustomValidity(els.title.value.trim().length >= 2 ? "" : "Enter a title (at least 2 characters).");
      f.classList.add("was-validated");
      if (!f.checkValidity()) { setErr(formErr, "Please fix the highlighted fields."); var bad = f.querySelector(":invalid"); if (bad) { bad.focus(); } return; }
      var videoFile = els.file.files[0] || null, thumbFile = els.thumb.files[0] || null;
      if (!existing && !videoFile) { setErr(formErr, "Choose a video file to upload."); return; }

      lock(true); cancelled = false;
      var id = existing ? existing.id : B.uuid(), newVideo = "", newThumb = "";
      var rollback = async function () { await A.removeFiles(C.videoBucket, [newVideo]); await A.removeFiles(C.thumbBucket, [newThumb]); };
      try {
        if (thumbFile) {
          newThumb = "videos/" + id + "/" + B.randomSuffix() + "." + A.fileExt(thumbFile);
          progText.textContent = "Uploading thumbnail..."; prog.hidden = false;
          await A.uploadSmall(C.thumbBucket, newThumb, thumbFile);
        }
        if (videoFile) {
          newVideo = els.course.value + "/" + id + "/" + B.randomSuffix() + "." + A.fileExt(videoFile);
          prog.hidden = false; bar.style.width = "0%";
          await A.uploadVideo(videoFile, newVideo, function (p) {
            bar.style.width = p + "%"; bar.setAttribute("aria-valuenow", p); progText.textContent = "Uploading video... " + p + "%";
          }, ctl);
          bar.style.width = "100%"; progText.textContent = "Upload complete. Saving details...";
        } else { progText.textContent = "Saving details..."; prog.hidden = false; }

        var payload = {
          course_id: els.course.value, module_id: els.module.value, title: els.title.value.trim(),
          description: els.desc.value.trim() || null, status: status, duration_seconds: duration, is_preview: els.preview.checked
        };
        var wantOrder = parseInt(els.order.value, 10);
        if (wantOrder > 0) { payload.display_order = wantOrder; }
        if (newVideo) { payload.video_storage_path = newVideo; }
        if (newThumb) { payload.thumbnail_path = newThumb; }
        var res;
        if (existing) {
          res = await B.db.from("videos").update(payload).eq("id", id).select();
        } else {
          var last = await A.must(B.db.from("videos").select("display_order").eq("module_id", payload.module_id).order("display_order", { ascending: false }).limit(1));
          payload.id = id; if (!payload.display_order) { payload.display_order = last.length ? last[0].display_order + 1 : 1; }
          payload.slug = B.slugify(payload.title) + "-" + B.randomSuffix();
          payload.thumbnail_path = payload.thumbnail_path || null;
          res = await B.db.from("videos").insert(payload).select();
        }
        if (res.error || !res.data || !res.data.length) { throw res.error || new Error("The database did not confirm the save."); }

        var leftovers = [];
        if (existing && newVideo) { leftovers = leftovers.concat(await A.removeFiles(C.videoBucket, [existing.video_storage_path])); }
        if (existing && newThumb) { leftovers = leftovers.concat(await A.removeFiles(C.thumbBucket, [existing.thumbnail_path])); }
        if (leftovers.length) { A.toast("Saved, but old files could not be removed from storage: " + leftovers.join(", "), "error"); }
        window.location.href = "videos.html?saved=1";
      } catch (ex) {
        await rollback();
        prog.hidden = true; lock(false);
        setErr(formErr, cancelled ? "Upload cancelled. Nothing was saved." : "Not saved: " + B.friendlyError(ex) + (/exceeded the maximum|too large|payload/i.test(ex.message || "") ? " (Check the file-size limit in your Supabase plan and in Storage settings.)" : ""));
      }
    };
    f.addEventListener("submit", function (e) { e.preventDefault(); submit(e.submitter && e.submitter.value === "published" ? "published" : "draft"); });
  }

  /* ===== Courses ========================================================== */
  async function initCourses() {
    var box = $("#courseList"), modalEl = $("#courseModal"), modal = new window.bootstrap.Modal(modalEl);
    var f = $("#courseForm"), err = $("#courseError"), saveBtn = $("#courseSave");
    var courses = [], modules = [], videos = [], editing = null, saving = false;

    var load = async function () {
      B.showLoading(box, "Loading courses...");
      try {
        var r = await Promise.all([A.must(B.db.from("courses").select("*")), A.must(B.db.from("modules").select("id,course_id")), A.must(B.db.from("videos").select("id,course_id"))]);
        courses = r[0].sort(A.byOrder); modules = r[1]; videos = r[2]; render();
      } catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    var stat = function (c) {
      return { m: modules.filter(function (x) { return x.course_id === c.id; }).length, v: videos.filter(function (x) { return x.course_id === c.id; }).length };
    };
    var render = function () {
      if (!courses.length) { B.showEmpty(box, "journal-bookmark", "No courses yet", "Add your first course, then add modules and videos to it.", '<button type="button" class="btn-btb btn-sm-btb" data-add>Add Course</button>'); return; }
      box.innerHTML = '<div class="admin-card p-0"><table class="table table-admin table-responsive-stack align-middle mb-0"><thead><tr><th scope="col">Thumbnail</th><th scope="col">Course</th><th scope="col">Level</th><th scope="col">Price</th><th scope="col">Modules</th><th scope="col">Videos</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' +
        courses.map(function (c, i) {
          var s = stat(c);
          return '<tr><td><div class="row-thumb">' + B.thumbHtml(c.thumbnail_path, "") + "</div></td><td><strong>" + esc(c.title) + "</strong></td><td>" + esc(c.level || "-") + "</td><td>" + (c.price_paise ? "₹" + (c.price_paise / 100).toLocaleString("en-IN") : "Free") + "</td><td>" + s.m + "</td><td>" + s.v + "</td><td>" + badge(c.status) +
            '</td><td><div class="row-actions"><button class="btn btn-outline-secondary btn-xs" data-edit="' + esc(c.id) + '">Edit</button><a class="btn btn-outline-secondary btn-xs" href="modules.html?course=' + esc(c.id) + '">Modules</a>' +
            '<span class="order-btns"><button class="btn btn-outline-secondary btn-xs" data-up="' + esc(c.id) + '" aria-label="Move ' + esc(c.title) + ' up"' + (i === 0 ? " disabled" : "") + '><i class="bi bi-arrow-up" aria-hidden="true"></i></button>' +
            '<button class="btn btn-outline-secondary btn-xs" data-down="' + esc(c.id) + '" aria-label="Move ' + esc(c.title) + ' down"' + (i === courses.length - 1 ? " disabled" : "") + '><i class="bi bi-arrow-down" aria-hidden="true"></i></button></span>' +
            '<button class="btn btn-outline-danger btn-xs" data-del="' + esc(c.id) + '">Delete</button></div></td></tr>';
        }).join("") + "</tbody></table></div>";
    };
    var openForm = function (c) {
      editing = c || null; f.reset(); f.classList.remove("was-validated"); setErr(err, "");
      $("#courseModalTitle").textContent = c ? "Edit course" : "Add course";
      $("#cThumbInfo").textContent = "";
      var prev = $("#cThumbPreview"); prev.hidden = !(c && c.thumbnail_path); prev.innerHTML = c && c.thumbnail_path ? B.thumbHtml(c.thumbnail_path, "Current thumbnail") : "";
      if (c) { f.elements.title.value = c.title; f.elements.description.value = c.description || ""; f.elements.objectives.value = c.objectives || ""; f.elements.level.value = c.level || ""; f.elements.status.value = c.status; f.elements.price.value = (c.price_paise || 0) / 100;
        f.elements.compare.value = c.compare_price_paise ? c.compare_price_paise / 100 : ""; f.elements.taxnote.value = c.tax_note || "";
        f.elements.delivery.value = c.delivery || "recorded"; f.elements.duration.value = c.duration_label || "";
        f.elements.batches.value = c.batch_times || ""; f.elements.highlights.value = c.highlights || ""; }
      modal.show();
    };
    $("#addCourse").addEventListener("click", function () { openForm(null); });
    f.elements.thumb.addEventListener("change", function () {
      var file = f.elements.thumb.files[0]; f.elements.thumb.setCustomValidity(""); if (!file) { return; }
      var bad = A.checkFile(file, "thumb"); if (bad) { f.elements.thumb.setCustomValidity(bad); $("#cThumbInfo").innerHTML = '<span class="text-danger">' + esc(bad) + "</span>"; }
      else { $("#cThumbInfo").textContent = file.name + " - " + B.fmtBytes(file.size); }
    });

    f.addEventListener("submit", async function (e) {
      e.preventDefault(); if (saving) { return; }
      f.elements.title.setCustomValidity(f.elements.title.value.trim().length >= 2 ? "" : "Enter a title.");
      f.classList.add("was-validated"); if (!f.checkValidity()) { return; }
      var priceP = Math.round(parseFloat(f.elements.price.value || "0") * 100), cmpRaw = f.elements.compare.value.trim();
      var cmpP = cmpRaw === "" ? null : Math.round(parseFloat(cmpRaw) * 100);
      if (cmpP !== null && !(cmpP > priceP)) { setErr(err, "The original price must be higher than the price, or left empty."); return; }
      saving = true; saveBtn.disabled = true; saveBtn.textContent = "Saving..."; setErr(err, "");
      var file = f.elements.thumb.files[0] || null, id = editing ? editing.id : B.uuid(), newThumb = "";
      try {
        if (file) { newThumb = "courses/" + id + "/" + B.randomSuffix() + "." + A.fileExt(file); await A.uploadSmall(C.thumbBucket, newThumb, file); }
        var p = { title: f.elements.title.value.trim(), description: f.elements.description.value.trim() || null, objectives: f.elements.objectives.value.trim() || null, level: f.elements.level.value || null, status: f.elements.status.value, price_paise: priceP,
          compare_price_paise: cmpP, tax_note: f.elements.taxnote.value.trim() || null, delivery: f.elements.delivery.value,
          duration_label: f.elements.duration.value.trim() || null, batch_times: f.elements.batches.value.trim() || null, highlights: f.elements.highlights.value.trim() || null };
        if (newThumb) { p.thumbnail_path = newThumb; }
        var res;
        if (editing) { res = await B.db.from("courses").update(p).eq("id", id).select(); }
        else {
          p.id = id; p.display_order = courses.length ? Math.max.apply(null, courses.map(function (c) { return c.display_order; })) + 1 : 1;
          var base = B.slugify(p.title); p.slug = base;
          res = await B.db.from("courses").insert(p).select();
          if (res.error && res.error.code === "23505") { p.slug = base + "-" + B.randomSuffix(); res = await B.db.from("courses").insert(p).select(); }
        }
        if (res.error || !res.data || !res.data.length) { throw res.error || new Error("The database did not confirm the save."); }
        if (editing && newThumb && editing.thumbnail_path) { await A.removeFiles(C.thumbBucket, [editing.thumbnail_path]); }
        modal.hide(); A.toast(editing ? "Course updated." : "Course added."); await load();
      } catch (ex) {
        if (newThumb) { await A.removeFiles(C.thumbBucket, [newThumb]); }
        setErr(err, "Not saved: " + B.friendlyError(ex));
      }
      saving = false; saveBtn.disabled = false; saveBtn.textContent = "Save course";
    });

    box.addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) { return; }
      if (b.hasAttribute("data-add")) { openForm(null); return; }
      var id = b.getAttribute("data-edit") || b.getAttribute("data-up") || b.getAttribute("data-down") || b.getAttribute("data-del");
      var idx = courses.findIndex(function (c) { return c.id === id; }); if (idx < 0) { return; }
      var c = courses[idx];
      try {
        if (b.hasAttribute("data-edit")) { openForm(c); }
        else if (b.hasAttribute("data-up") || b.hasAttribute("data-down")) {
          var to = idx + (b.hasAttribute("data-up") ? -1 : 1);
          var order = courses.map(function (x) { return x.id; }); order.splice(to, 0, order.splice(idx, 1)[0]);
          await A.reorder("courses", order); await load();
        } else if (b.hasAttribute("data-del")) {
          var s = stat(c);
          if (s.m || s.v) {
            await A.notice("Cannot delete this course yet", "<p><strong>" + esc(c.title) + "</strong> still contains " + B.plural(s.m, "module") + " and " + B.plural(s.v, "video") + ". Videos are never deleted automatically. Delete or move every video, then delete the modules, and then delete the course.</p>");
            return;
          }
          if (!(await A.confirm("Delete course?", "<p>Delete <strong>" + esc(c.title) + "</strong>? This cannot be undone.</p>", "Delete course", true))) { return; }
          var d = await B.db.from("courses").delete().eq("id", c.id).select();
          if (d.error || !d.data.length) { throw d.error || new Error("The course was not deleted."); }
          await A.removeFiles(C.thumbBucket, [c.thumbnail_path]); A.toast("Course deleted."); await load();
        }
      } catch (ex) { A.toast("Error: " + B.friendlyError(ex), "error"); }
    });
    load();
  }

  /* ===== Modules (+ lessons) of one course =================================== */
  async function initModules() {
    var box = $("#moduleList"), courseId = B.param("course");
    var modalEl = $("#moduleModal"), modal = new window.bootstrap.Modal(modalEl), f = $("#moduleForm"), err = $("#moduleError"), saveBtn = $("#moduleSave");
    var course = null, modules = [], videos = [], editing = null, saving = false;
    if (!courseId) { B.showEmpty(box, "journal-bookmark", "No course selected", "", '<a class="btn-btb btn-sm-btb" href="courses.html">Go to Courses</a>'); return; }

    var load = async function () {
      B.showLoading(box, "Loading modules...");
      try {
        var r = await Promise.all([A.must(B.db.from("courses").select("id,title").eq("id", courseId).limit(1)), A.must(B.db.from("modules").select("*").eq("course_id", courseId)), A.must(B.db.from("videos").select("id,title,module_id,status,display_order,created_at").eq("course_id", courseId))]);
        course = r[0][0]; modules = r[1].sort(A.byOrder); videos = r[2].sort(A.byOrder);
        if (!course) { B.showEmpty(box, "search", "Course not found", "", '<a class="btn-btb btn-sm-btb" href="courses.html">Go to Courses</a>'); return; }
        $("#courseName").textContent = course.title; render();
      } catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    var render = function () {
      if (!modules.length) { B.showEmpty(box, "layers", "No modules yet", "Add a module such as \"Module 1: English Basics\", then add lessons to it.", '<button type="button" class="btn-btb btn-sm-btb" data-add>Add Module</button>'); return; }
      box.innerHTML = modules.map(function (m, i) {
        var ls = videos.filter(function (v) { return v.module_id === m.id; });
        return '<section class="admin-card mb-3" aria-label="' + esc(m.title) + '"><div class="d-flex flex-wrap justify-content-between gap-2"><div><span class="module-no">Module ' + (i + 1) + "</span><h2 class=\"h5 d-inline\">" + esc(m.title) + "</h2>" +
          '<div class="text-muted small">' + badge(m.status) + " " + B.plural(ls.length, "lesson") + (m.description ? " - " + esc(m.description) : "") + "</div></div>" +
          '<div class="row-actions align-self-start"><a class="btn btn-btb btn-xs" href="video-edit.html?course=' + esc(courseId) + "&module=" + esc(m.id) + '">Add lesson</a><button class="btn btn-outline-secondary btn-xs" data-edit="' + esc(m.id) + '">Rename / edit</button><button class="btn btn-outline-secondary btn-xs" data-mtoggle="' + esc(m.id) + '">' + (m.status === "published" ? "Unpublish" : "Publish") + '</button>' +
          '<span class="order-btns"><button class="btn btn-outline-secondary btn-xs" data-mup="' + esc(m.id) + '" aria-label="Move module up"' + (i === 0 ? " disabled" : "") + '><i class="bi bi-arrow-up" aria-hidden="true"></i></button><button class="btn btn-outline-secondary btn-xs" data-mdown="' + esc(m.id) + '" aria-label="Move module down"' + (i === modules.length - 1 ? " disabled" : "") + '><i class="bi bi-arrow-down" aria-hidden="true"></i></button></span>' +
          '<button class="btn btn-outline-danger btn-xs" data-del="' + esc(m.id) + '">Delete</button></div></div>' +
          (ls.length ? '<ol class="lesson-list">' + ls.map(function (v, j) {
            return '<li><div class="d-flex align-items-center gap-2 py-2 flex-wrap"><span class="lesson-title">' + esc(v.title) + "</span>" + badge(v.status) +
              '<a class="btn btn-outline-secondary btn-xs" href="video-edit.html?id=' + esc(v.id) + '">Edit</a><span class="order-btns"><button class="btn btn-outline-secondary btn-xs" data-lup="' + esc(v.id) + '" aria-label="Move lesson up"' + (j === 0 ? " disabled" : "") + '><i class="bi bi-arrow-up" aria-hidden="true"></i></button><button class="btn btn-outline-secondary btn-xs" data-ldown="' + esc(v.id) + '" aria-label="Move lesson down"' + (j === ls.length - 1 ? " disabled" : "") + '><i class="bi bi-arrow-down" aria-hidden="true"></i></button></span></div></li>';
          }).join("") + "</ol>" : '<p class="module-empty mb-0">No lessons in this module yet.</p>') + "</section>";
      }).join("");
    };
    var openForm = function (m) {
      editing = m || null; f.reset(); f.classList.remove("was-validated"); setErr(err, "");
      $("#moduleModalTitle").textContent = m ? "Edit module" : "Add module";
      f.elements.status.value = m ? m.status : "published";
      if (m) { f.elements.title.value = m.title; f.elements.description.value = m.description || ""; }
      modal.show();
    };
    $("#addModule").addEventListener("click", function () { openForm(null); });
    f.addEventListener("submit", async function (e) {
      e.preventDefault(); if (saving) { return; }
      f.elements.title.setCustomValidity(f.elements.title.value.trim().length >= 2 ? "" : "Enter a title.");
      f.classList.add("was-validated"); if (!f.checkValidity()) { return; }
      saving = true; saveBtn.disabled = true; setErr(err, "");
      try {
        var p = { title: f.elements.title.value.trim(), description: f.elements.description.value.trim() || null, status: f.elements.status.value }, res;
        if (editing) { res = await B.db.from("modules").update(p).eq("id", editing.id).select(); }
        else { p.course_id = courseId; p.display_order = modules.length ? Math.max.apply(null, modules.map(function (m) { return m.display_order; })) + 1 : 1; res = await B.db.from("modules").insert(p).select(); }
        if (res.error || !res.data || !res.data.length) { throw res.error || new Error("The database did not confirm the save."); }
        modal.hide(); A.toast(editing ? "Module updated." : "Module added."); await load();
      } catch (ex) { setErr(err, "Not saved: " + B.friendlyError(ex)); }
      saving = false; saveBtn.disabled = false;
    });
    var move = async function (table, list, id, dir) {
      var idx = list.findIndex(function (x) { return x.id === id; }), order = list.map(function (x) { return x.id; });
      order.splice(idx + dir, 0, order.splice(idx, 1)[0]); await A.reorder(table, order); await load();
    };
    box.addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) { return; }
      try {
        if (b.hasAttribute("data-add")) { openForm(null); }
        else if (b.hasAttribute("data-edit")) { openForm(modules.filter(function (m) { return m.id === b.getAttribute("data-edit"); })[0]); }
        else if (b.hasAttribute("data-mtoggle")) {
          var tm = modules.filter(function (m) { return m.id === b.getAttribute("data-mtoggle"); })[0], to = tm.status === "published" ? "draft" : "published";
          var tu = await B.db.from("modules").update({ status: to }).eq("id", tm.id).select();
          if (tu.error || !tu.data.length) { throw tu.error || new Error("The change was not saved."); }
          A.toast(to === "published" ? "Module published." : "Module unpublished. It is hidden from the website."); await load();
        }
        else if (b.hasAttribute("data-mup")) { await move("modules", modules, b.getAttribute("data-mup"), -1); }
        else if (b.hasAttribute("data-mdown")) { await move("modules", modules, b.getAttribute("data-mdown"), 1); }
        else if (b.hasAttribute("data-lup") || b.hasAttribute("data-ldown")) {
          var vid = b.getAttribute("data-lup") || b.getAttribute("data-ldown");
          var v = videos.filter(function (x) { return x.id === vid; })[0];
          await move("videos", videos.filter(function (x) { return x.module_id === v.module_id; }), vid, b.hasAttribute("data-lup") ? -1 : 1);
        } else if (b.hasAttribute("data-del")) {
          var m = modules.filter(function (x) { return x.id === b.getAttribute("data-del"); })[0];
          var n = videos.filter(function (v) { return v.module_id === m.id; }).length;
          if (n) { await A.notice("Cannot delete this module yet", "<p><strong>" + esc(m.title) + "</strong> still has " + B.plural(n, "lesson") + ". Delete the lessons from the Videos page first (videos are never deleted automatically).</p>"); return; }
          if (!(await A.confirm("Delete module?", "<p>Delete <strong>" + esc(m.title) + "</strong>? This cannot be undone.</p>", "Delete module", true))) { return; }
          var d = await B.db.from("modules").delete().eq("id", m.id).select();
          if (d.error || !d.data.length) { throw d.error || new Error("The module was not deleted."); }
          A.toast("Module deleted."); await load();
        }
      } catch (ex) { A.toast("Error: " + B.friendlyError(ex), "error"); }
    });
    load();
  }


  /* ===== Ebooks ============================================================== */
  async function initEbooks() {
    var box = $("#ebookList"), modalEl = $("#ebookModal"), modal = new window.bootstrap.Modal(modalEl);
    var f = $("#ebookForm"), err = $("#ebookError"), saveBtn = $("#ebookSave");
    var prog = $("#eProgressBox"), bar = $("#eProgressBar"), progText = $("#eProgressText");
    var ebooks = [], editing = null, saving = false, ctl = { abort: null };
    $("#eCoverLimit").textContent = "JPG, PNG or WebP, up to " + C.maxThumbMB + " MB.";
    $("#eFileLimit").textContent = "PDF or EPUB, up to " + C.maxEbookMB + " MB.";

    var load = async function () {
      B.showLoading(box, "Loading ebooks...");
      try { ebooks = (await A.must(B.db.from("ebooks").select("*"))).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }); render(); }
      catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    var render = function () {
      if (!ebooks.length) { B.showEmpty(box, "book", "No ebooks yet", "Add your first ebook.", '<button type="button" class="btn-btb btn-sm-btb" data-add>Add Ebook</button>'); return; }
      box.innerHTML = '<div class="admin-card p-0"><table class="table table-admin table-responsive-stack align-middle mb-0"><thead><tr><th scope="col">Cover</th><th scope="col">Title</th><th scope="col">Download</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>' +
        ebooks.map(function (b) {
          return '<tr><td><div class="row-thumb">' + B.thumbHtml(b.cover_path, "") + "</div></td><td><strong>" + esc(b.title) + "</strong></td><td>" +
            (b.file_path ? "Uploaded file" : b.download_url ? "External link" : "-") + "</td><td>" + badge(b.status) +
            '</td><td><div class="row-actions"><button class="btn btn-outline-secondary btn-xs" data-edit="' + esc(b.id) + '">Edit</button>' +
            '<button class="btn btn-outline-secondary btn-xs" data-toggle="' + esc(b.id) + '">' + (b.status === "published" ? "Unpublish" : "Publish") + "</button>" +
            '<button class="btn btn-outline-danger btn-xs" data-del="' + esc(b.id) + '">Delete</button></div></td></tr>';
        }).join("") + "</tbody></table></div>";
    };
    var openForm = function (b) {
      editing = b || null; f.reset(); f.classList.remove("was-validated"); setErr(err, ""); prog.hidden = true;
      $("#ebookModalTitle").textContent = b ? "Edit ebook" : "Add ebook";
      $("#eCoverInfo").textContent = ""; $("#eFileInfo").textContent = "";
      var prev = $("#eCoverPreview"); prev.hidden = !(b && b.cover_path); prev.innerHTML = b && b.cover_path ? B.thumbHtml(b.cover_path, "Current cover") : "";
      var cur = $("#eCurrentFile"); cur.hidden = !(b && b.file_path); cur.textContent = b && b.file_path ? "Current file: " + b.file_path.split("/").pop() + ". Choose a new file only to replace it." : "";
      if (b) { f.elements.title.value = b.title; f.elements.description.value = b.description || ""; f.elements.url.value = b.download_url || ""; f.elements.status.value = b.status; }
      modal.show();
    };
    var pick = function (input, kind, info) {
      input.addEventListener("change", function () {
        var file = input.files[0]; input.setCustomValidity(""); info.textContent = ""; if (!file) { return; }
        var bad = A.checkFile(file, kind);
        if (bad) { input.setCustomValidity(bad); info.innerHTML = '<span class="text-danger">' + esc(bad) + "</span>"; } else { info.textContent = file.name + " - " + B.fmtBytes(file.size); }
      });
    };
    pick(f.elements.cover, "thumb", $("#eCoverInfo")); pick(f.elements.file, "ebook", $("#eFileInfo"));
    $("#addEbook").addEventListener("click", function () { openForm(null); });

    f.addEventListener("submit", async function (e) {
      e.preventDefault(); if (saving) { return; }
      var g = f.elements, url = g.url.value.trim();
      g.title.setCustomValidity(g.title.value.trim().length >= 2 ? "" : "Enter a title.");
      g.url.setCustomValidity(!url || /^https:\/\/[^\s]+$/i.test(url) ? "" : "Enter a full https:// link.");
      f.classList.add("was-validated"); if (!f.checkValidity()) { return; }
      var cover = g.cover.files[0] || null, file = g.file.files[0] || null;
      var hasSource = !!(file || url || (editing && (editing.file_path || editing.download_url)));
      if (g.status.value === "published" && !hasSource) { setErr(err, "Add a file or a download link before publishing."); return; }
      saving = true; saveBtn.disabled = true; saveBtn.textContent = "Saving..."; setErr(err, "");
      var id = editing ? editing.id : B.uuid(), newCover = "", newFile = "";
      try {
        if (cover) { newCover = "ebooks/" + id + "/" + B.randomSuffix() + "." + A.fileExt(cover); await A.uploadSmall(C.thumbBucket, newCover, cover); }
        if (file) {
          newFile = id + "/" + B.randomSuffix() + "." + A.fileExt(file);
          prog.hidden = false; bar.style.width = "0%";
          await A.uploadResumable(C.ebookBucket, file, newFile, function (p) { bar.style.width = p + "%"; bar.setAttribute("aria-valuenow", p); progText.textContent = "Uploading file... " + p + "%"; }, ctl);
        }
        var p = { title: g.title.value.trim(), description: g.description.value.trim() || null, download_url: url || null, status: g.status.value };
        if (newCover) { p.cover_path = newCover; }
        if (newFile) { p.file_path = newFile; }
        var res = editing ? await B.db.from("ebooks").update(p).eq("id", id).select() : await B.db.from("ebooks").insert(Object.assign({ id: id }, p)).select();
        if (res.error || !res.data || !res.data.length) { throw res.error || new Error("The database did not confirm the save."); }
        if (editing && newCover) { await A.removeFiles(C.thumbBucket, [editing.cover_path]); }
        if (editing && newFile) { await A.removeFiles(C.ebookBucket, [editing.file_path]); }
        modal.hide(); A.toast(editing ? "Ebook updated." : "Ebook added."); await load();
      } catch (ex) {
        await A.removeFiles(C.thumbBucket, [newCover]); await A.removeFiles(C.ebookBucket, [newFile]);
        setErr(err, "Not saved: " + B.friendlyError(ex));
      }
      prog.hidden = true; saving = false; saveBtn.disabled = false; saveBtn.textContent = "Save ebook";
    });

    box.addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) { return; }
      if (b.hasAttribute("data-add")) { openForm(null); return; }
      var id = b.getAttribute("data-edit") || b.getAttribute("data-toggle") || b.getAttribute("data-del");
      var eb = ebooks.filter(function (x) { return x.id === id; })[0]; if (!eb) { return; }
      try {
        if (b.hasAttribute("data-edit")) { openForm(eb); }
        else if (b.hasAttribute("data-toggle")) {
          var to = eb.status === "published" ? "draft" : "published";
          var u = await B.db.from("ebooks").update({ status: to }).eq("id", eb.id).select();
          if (u.error || !u.data.length) { throw u.error || new Error("The change was not saved."); }
          A.toast(to === "published" ? "Ebook published." : "Ebook unpublished."); await load();
        } else if (await A.confirm("Delete ebook?", "<p>Delete <strong>" + esc(eb.title) + "</strong> and its files? This cannot be undone.</p>", "Delete ebook", true)) {
          var d = await B.db.from("ebooks").delete().eq("id", eb.id).select();
          if (d.error || !d.data.length) { throw d.error || new Error("The ebook was not deleted."); }
          var left = (await A.removeFiles(C.ebookBucket, [eb.file_path])).concat(await A.removeFiles(C.thumbBucket, [eb.cover_path]));
          A.toast(left.length ? "Ebook deleted, but these files remain in storage: " + left.join(", ") : "Ebook deleted.", left.length ? "error" : "ok"); await load();
        }
      } catch (ex) { A.toast("Error: " + B.friendlyError(ex), "error"); }
    });
    load();
  }

  /* ===== Live class bookings ================================================== */
  async function initBookings() {
    var box = $("#bookingList"), fStatus = $("#bkStatus"), rows = [];
    var STATUS = { "new": "New", confirmed: "Confirmed", completed: "Completed", cancelled: "Cancelled" };
    var load = async function () {
      B.showLoading(box, "Loading bookings...");
      try { rows = (await A.must(B.db.from("bookings").select("*"))).sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); }); render(); }
      catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    var render = function () {
      var list = rows.filter(function (r) { return !fStatus.value || r.status === fStatus.value; });
      if (!rows.length) { B.showEmpty(box, "calendar-check", "No booking requests yet", "Requests sent from the Contact page appear here."); return; }
      if (!list.length) { B.showEmpty(box, "search", "No bookings with this status", ""); return; }
      box.innerHTML = list.map(function (r) {
        return '<section class="admin-card mb-3" aria-label="Booking from ' + esc(r.name) + '"><div class="d-flex justify-content-between flex-wrap gap-2"><div><strong>' + esc(r.name) + '</strong> <span class="badge-status is-' + (r.status === "new" ? "draft" : "published") + '">' + esc(STATUS[r.status] || r.status) + '</span>' +
          '<div class="text-muted small">' + esc(r.contact) + "</div></div><small class=\"text-muted\">" + esc(new Date(r.created_at).toLocaleString()) + "</small></div>" +
          (r.preferred_slot ? '<p class="mb-1 mt-2"><strong>Preferred time:</strong> ' + esc(r.preferred_slot) + "</p>" : "") +
          (r.message ? '<p class="mb-2 admin-note">' + esc(r.message) + "</p>" : "") +
          '<div class="row g-2 align-items-end mt-1"><div class="col-sm-4"><label class="form-label small" for="st-' + esc(r.id) + '">Status</label><select class="form-select form-select-sm" id="st-' + esc(r.id) + '">' +
          Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === r.status ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select></div>" +
          '<div class="col-sm-8"><label class="form-label small" for="nt-' + esc(r.id) + '">Internal notes</label><input class="form-control form-control-sm" id="nt-' + esc(r.id) + '" maxlength="1000" value="' + esc(r.admin_notes || "") + '"></div></div>' +
          '<div class="row-actions mt-2"><button class="btn btn-btb btn-xs" data-save="' + esc(r.id) + '">Save</button><button class="btn btn-outline-danger btn-xs" data-del="' + esc(r.id) + '">Delete</button></div></section>';
      }).join("");
    };
    fStatus.addEventListener("change", render); $("#bkFilter").addEventListener("submit", function (e) { e.preventDefault(); });
    box.addEventListener("click", async function (e) {
      var b = e.target.closest("button"); if (!b) { return; }
      var sid = b.getAttribute("data-save"), did = b.getAttribute("data-del");
      try {
        if (sid) {
          var u = await B.db.from("bookings").update({ status: $("#st-" + sid).value, admin_notes: $("#nt-" + sid).value.trim() || null }).eq("id", sid).select();
          if (u.error || !u.data.length) { throw u.error || new Error("The change was not saved."); }
          var row = rows.filter(function (r) { return r.id === sid; })[0]; row.status = u.data[0].status; row.admin_notes = u.data[0].admin_notes;
          A.toast("Booking updated."); render();
        } else if (did && await A.confirm("Delete booking?", "<p>Delete this booking request permanently?</p>", "Delete", true)) {
          var d = await B.db.from("bookings").delete().eq("id", did).select();
          if (d.error || !d.data.length) { throw d.error || new Error("Not deleted"); }
          rows = rows.filter(function (r) { return r.id !== did; }); A.toast("Booking deleted."); render();
        }
      } catch (ex) { A.toast("Error: " + B.friendlyError(ex), "error"); }
    });
    load();
  }

  /* ===== Orders & payments (read-only) ======================================== */
  async function initOrders() {
    var box = $("#orderList"), statsEl = $("#orderStats"), fSearch = $("#oSearch"), fStatus = $("#oStatus"), orders = [], titles = {};
    var LABEL = { paid: "Paid", pending: "Awaiting confirmation", created: "Not completed", failed: "Failed", cancelled: "Cancelled" };
    var rupees = function (p) { return "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: p % 100 ? 2 : 0 }); };
    var load = async function () {
      B.showLoading(box, "Loading orders...");
      try {
        var r = await Promise.all([A.must(B.db.from("orders").select("*, payments(razorpay_payment_id,status,method,error_description)").order("created_at", { ascending: false }).limit(1000)), A.must(B.db.from("courses").select("id,title"))]);
        orders = r[0]; r[1].forEach(function (c) { titles[c.id] = c.title; }); render();
      } catch (e) { B.showError(box, B.friendlyError(e), load); }
    };
    var render = function () {
      var paid = orders.filter(function (o) { return o.status === "paid"; });
      statsEl.innerHTML = '<div class="row g-3">' + [["Paid orders", paid.length], ["Verified revenue", rupees(paid.reduce(function (t, o) { return t + o.amount_paise; }, 0))],
        ["Awaiting confirmation", orders.filter(function (o) { return o.status === "pending"; }).length], ["Failed / cancelled", orders.filter(function (o) { return o.status === "failed" || o.status === "cancelled"; }).length]]
        .map(function (i) { return '<div class="col-6 col-xl-3"><div class="stat-card"><strong>' + i[1] + "</strong><span>" + i[0] + "</span></div></div>"; }).join("") + "</div>";
      var q = fSearch.value.trim().toLowerCase();
      var list = orders.filter(function (o) {
        return (!fStatus.value || o.status === fStatus.value) &&
          (!q || ((o.student_email || "") + " " + (o.student_name || "") + " " + (titles[o.course_id] || "")).toLowerCase().indexOf(q) !== -1);
      });
      if (!orders.length) { B.showEmpty(box, "credit-card", "No orders yet", "Orders appear here when a student starts checkout for a paid course."); return; }
      if (!list.length) { B.showEmpty(box, "search", "No orders match your filters", ""); return; }
      box.innerHTML = '<div class="admin-card p-0"><table class="table table-admin table-responsive-stack align-middle mb-0"><thead><tr><th scope="col">Date</th><th scope="col">Student</th><th scope="col">Course</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Payment reference</th></tr></thead><tbody>' +
        list.map(function (o) {
          var pay = (o.payments || []).slice().sort(function (a, b) { return (b.status === "captured") - (a.status === "captured"); })[0];
          return "<tr><td>" + esc(new Date(o.created_at).toLocaleString()) + "</td><td>" + esc(o.student_name || "") + '<div class="small text-muted">' + esc(o.student_email || "-") + "</div></td><td>" + esc(titles[o.course_id] || "-") + (o.batch_choice ? '<div class="small text-muted">Batch: ' + esc(o.batch_choice) + "</div>" : "") + "</td><td>" + rupees(o.amount_paise) +
            '</td><td><span class="pay-status is-' + esc(o.status) + '">' + esc(LABEL[o.status] || o.status) + "</span></td><td><small>" +
            (pay ? esc(pay.razorpay_payment_id) + (pay.method ? " (" + esc(pay.method) + ")" : "") + (pay.status === "failed" && pay.error_description ? "<br>" + esc(pay.error_description) : "") : esc(o.razorpay_order_id || "-")) + "</small></td></tr>";
        }).join("") + "</tbody></table></div>";
    };
    fSearch.addEventListener("input", render); fStatus.addEventListener("change", render); $("#ordFilter").addEventListener("submit", function (e) { e.preventDefault(); });
    load();
  }

  /* ===== Settings ============================================================= */
  function initSettings(user) {
    $("#acctEmail").textContent = user.email || "";
    $("#cfgUrl").textContent = C.supabaseUrl; $("#cfgVideo").textContent = C.maxVideoMB + " MB"; $("#cfgThumb").textContent = C.maxThumbMB + " MB";
    var f = $("#pwForm"), msg = $("#pwMsg");
    f.addEventListener("submit", async function (e) {
      e.preventDefault(); msg.className = "form-status";
      var a = f.elements.pw.value, b = f.elements.pw2.value;
      f.elements.pw2.setCustomValidity(a === b ? "" : "Passwords do not match.");
      f.classList.add("was-validated"); if (!f.checkValidity()) { return; }
      var r = await B.db.auth.updateUser({ password: a });
      if (r.error) { msg.className = "form-status is-error"; msg.textContent = "Not changed: " + B.friendlyError(r.error); return; }
      f.reset(); f.classList.remove("was-validated"); msg.className = "form-status is-ok"; msg.textContent = "Password changed.";
    });
    f.elements.pw2.addEventListener("input", function () { f.elements.pw2.setCustomValidity(""); });
  }

  /* ===== boot ================================================================== */
  (async function () {
    if (page === "login") { initLogin(); return; }
    var user = await A.start({ modules: "courses", "video-edit": "videos" }[page] || page);
    if (!user) { return; }
    ({ dashboard: initDashboard, videos: initVideos, "video-edit": initVideoForm, courses: initCourses, modules: initModules, ebooks: initEbooks, bookings: initBookings, orders: initOrders, settings: function () { initSettings(user); } })[page]();
  })();
})();
