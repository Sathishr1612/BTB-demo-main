/* BTB Academy - public pages (home featured courses, courses, course, videos library, watch, contact).
   Every list is read live from Supabase; nothing here is a hardcoded course or video. */
(function () {
  "use strict";
  var B = window.BTB, C = B.config, esc = B.esc, $ = B.$;
  var page = document.body.getAttribute("data-page");

  var byOrder = function (a, b) {
    return (a.display_order - b.display_order) || String(a.created_at).localeCompare(String(b.created_at));
  };

  /* ---- data layer: the public RLS policies already hide drafts ------------ */
  async function must(q) {
    var r = await q;
    if (r.error) { throw r.error; }
    return r.data || [];
  }
  var loadCourses = function () {
    return must(B.db.from("courses").select("*").eq("status", "published").order("display_order").order("created_at"));
  };
  var loadModules = function (courseIds) {
    var q = B.db.from("modules").select("*").eq("status", "published").order("display_order").order("created_at");
    return courseIds ? must(q.in("course_id", courseIds)) : must(q);
  };
  var loadVideos = function (filter) {
    var q = B.db.from("videos").select("id,course_id,module_id,title,slug,description,thumbnail_path,duration_seconds,display_order,created_at,is_preview").eq("status", "published");
    if (filter && filter.course_id) { q = q.eq("course_id", filter.course_id); }
    return must(q);
  };
  async function loadCatalog() {
    var r = await Promise.all([loadCourses(), loadModules(), loadVideos()]);
    var shown = {}; r[1].forEach(function (m) { shown[m.id] = true; });   // lessons of unpublished modules stay hidden
    var cat = { courses: r[0].sort(byOrder), modules: r[1].sort(byOrder), videos: r[2].filter(function (v) { return shown[v.module_id]; }).sort(byOrder) };
    cat.stats = {};
    cat.courses.forEach(function (c) {
      cat.stats[c.id] = {
        modules: cat.modules.filter(function (m) { return m.course_id === c.id; }).length,
        lessons: cat.videos.filter(function (v) { return v.course_id === c.id; }).length
      };
    });
    return cat;
  }

  /* ---- shared renderers ---------------------------------------------------- */
  /* The "original" price only counts when it is higher than the real price; the discount % is worked out from the two. */
  function priceInfo(c) {
    var cmp = c.compare_price_paise && c.compare_price_paise > c.price_paise ? c.compare_price_paise : 0;
    return { cmp: cmp, off: cmp ? Math.round((cmp - c.price_paise) / cmp * 100) : 0 };
  }
  function priceHtml(c) {
    var S = window.BTBStudent, pi = priceInfo(c);
    return '<div class="price-block"><span class="price-now">' + esc(S.formatPrice(c.price_paise)) + "</span>" +
      (pi.cmp ? '<s class="price-was"><span class="visually-hidden">Original price </span>' + esc(S.formatPrice(pi.cmp)) + '</s><span class="price-off">' + pi.off + "% OFF</span>" : "") + "</div>" +
      (c.price_paise && c.tax_note ? '<p class="price-note">' + esc(c.tax_note) + "</p>" : "");
  }
  function lines(text) { return (text || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean); }

  function courseCard(c, st) {
    var href = "course.html?c=" + encodeURIComponent(c.slug), pi = priceInfo(c);
    return '<div class="col-md-6 col-lg-4 d-flex"><article class="catalog-card">' +
      '<a class="catalog-thumb" href="' + href + '" tabindex="-1" aria-hidden="true">' + B.thumbHtml(c.thumbnail_path, "") + "</a>" +
      '<div class="catalog-body">' +
      (c.delivery === "live" ? '<span class="level-badge level-badge--live">Live</span> ' : "") +
      (c.level ? '<span class="level-badge">' + esc(c.level) + "</span>" : "") +
      '<h3><a href="' + href + '">' + esc(c.title) + "</a></h3>" +
      '<p class="clamp-3">' + esc(c.description || "") + "</p>" +
      '<ul class="meta-line"><li><i class="bi bi-layers" aria-hidden="true"></i>' + B.plural(st.modules, "module") + "</li>" +
      '<li><i class="bi bi-play-btn" aria-hidden="true"></i>' + B.plural(st.lessons, "lesson") + "</li>" +
      '<li class="price-tag"><i class="bi bi-tag" aria-hidden="true"></i>' + esc(window.BTBStudent.formatPrice(c.price_paise)) +
      (pi.cmp ? ' <s class="price-was"><span class="visually-hidden">Original price </span>' + esc(window.BTBStudent.formatPrice(pi.cmp)) + "</s>" : "") + "</li></ul>" +
      '<a class="btn-btb-outline btn-sm-btb mt-auto" href="' + href + '">View Course</a></div></article></div>';
  }
  function videoCard(v, extra) {
    var href = "watch.html?v=" + encodeURIComponent(v.slug);
    return '<div class="col-sm-6 col-lg-4 d-flex"><article class="catalog-card">' +
      '<a class="catalog-thumb" href="' + href + '" tabindex="-1" aria-hidden="true">' + B.thumbHtml(v.thumbnail_path, "") +
      (v.duration_seconds != null ? '<span class="dur-badge">' + B.fmtDuration(v.duration_seconds) + "</span>" : "") + "</a>" +
      '<div class="catalog-body">' + (extra ? '<span class="level-badge">' + esc(extra) + "</span>" : "") +
      '<h3><a href="' + href + '">' + esc(v.title) + "</a></h3>" +
      (v.description ? '<p class="clamp-3">' + esc(v.description) + "</p>" : "") +
      '<a class="btn-btb btn-sm-btb mt-auto" href="' + href + '"><i class="bi bi-play-fill" aria-hidden="true"></i>Watch Video</a></div></article></div>';
  }
  function emptyCourses(el) {
    B.showEmpty(el, "journal-bookmark", "Courses are coming soon", "No courses are published yet. Please check back shortly, or message us on WhatsApp.");
  }
  function guard(el, loader) {
    if (!B.db) { el.innerHTML = B.notConfiguredHtml(); return; }
    var run = function () {
      B.showLoading(el, "Loading...");
      loader().catch(function (e) { B.showError(el, B.friendlyError(e), run); });
    };
    run();
  }
  function setMeta(title, desc) {
    document.title = title;
    var d = $('meta[name="description"]');
    if (d && desc) { d.setAttribute("content", desc); }
    [["og:title", title], ["og:description", desc]].forEach(function (p) {
      var m = $('meta[property="' + p[0] + '"]'); if (m && p[1]) { m.setAttribute("content", p[1]); }
    });
    var can = $('link[rel="canonical"]');
    if (can) { can.setAttribute("href", (C.siteUrl || window.location.origin) + window.location.pathname + window.location.search); }
  }

  /* ---- Home: featured courses --------------------------------------------- */
  function initHome() {
    var el = $("#featuredCourses"); if (!el) { return; }
    guard(el, async function () {
      var cat = await loadCatalog();
      if (!cat.courses.length) { emptyCourses(el); return; }
      el.innerHTML = '<div class="row g-4 justify-content-center">' +
        cat.courses.slice(0, 3).map(function (c) { return courseCard(c, cat.stats[c.id]); }).join("") + "</div>";
    });
  }

  /* ---- Courses page --------------------------------------------------------- */
  function initCourses() {
    var el = $("#courseGrid");
    guard(el, async function () {
      var cat = await loadCatalog();
      if (!cat.courses.length) { emptyCourses(el); return; }
      el.innerHTML = '<div class="row g-4">' + cat.courses.map(function (c) { return courseCard(c, cat.stats[c.id]); }).join("") + "</div>";
    });
  }

  /* ---- Course details ------------------------------------------------------- */
  function initCourse() {
    var el = $("#courseView"), slug = B.param("c");
    if (!slug) { B.showEmpty(el, "search", "No course selected", "Choose a course from the courses page.", '<a class="btn-btb btn-sm-btb" href="courses.html">Browse courses</a>'); return; }
    guard(el, async function () {
      var rows = await must(B.db.from("courses").select("*").eq("slug", slug).eq("status", "published").limit(1));
      if (!rows.length) { B.showEmpty(el, "search", "Course not found", "This course does not exist or is not published.", '<a class="btn-btb btn-sm-btb" href="courses.html">Browse courses</a>'); return; }
      var c = rows[0];
      var r = await Promise.all([loadModules([c.id]), loadVideos({ course_id: c.id })]);
      var mods = r[0].sort(byOrder), vids = r[1].sort(byOrder);
      var S = window.BTBStudent, enrolled = false;
      if (c.price_paise) { try { enrolled = await S.isEnrolled(c.id); } catch (e) { enrolled = false; } }
      var unlocked = !c.price_paise || enrolled;
      setMeta(c.title + " | Break the Barriers Academy", (c.description || "").slice(0, 155) || "Spoken English course at Break the Barriers Academy.");
      var objs = (c.objectives || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
      var thumb = B.thumbUrl(c.thumbnail_path);

      var batches = lines(c.batch_times), perks = lines(c.highlights);
      var html = '<div class="row g-4 g-lg-5 align-items-start"><div class="col-lg-7">' +
        (c.delivery === "live" ? '<span class="level-badge level-badge--live mb-2">Live</span> ' : "") +
        (c.level ? '<span class="level-badge mb-2">' + esc(c.level) + "</span>" : "") +
        "<h1 class=\"h2 mb-3\">" + esc(c.title) + "</h1>" +
        '<p class="lead-text">' + esc(c.description || "").replace(/\n/g, "<br>") + "</p>" +
        '<ul class="meta-line mb-3"><li><i class="bi bi-layers" aria-hidden="true"></i>' + B.plural(mods.length, "module") + "</li>" +
        '<li><i class="bi bi-play-btn" aria-hidden="true"></i>' + B.plural(vids.length, "lesson") + "</li>" +
        (c.duration_label ? '<li><i class="bi bi-calendar3" aria-hidden="true"></i>' + esc(c.duration_label) + "</li>" : "") + "</ul>" +
        "</div>" +
        /* purchase card: image, price, batch choice, what you get, one clear button */
        '<div class="col-lg-5"><aside class="buy-card" aria-label="Enrol in this course">' +
        (thumb ? '<div class="course-hero-img">' + B.thumbHtml(c.thumbnail_path, c.title) + "</div>" : "") +
        '<div class="buy-card-body">' +
        (enrolled ? '<p class="mb-3"><span class="badge-status is-published">Enrolled</span></p>' : (c.price_paise ? priceHtml(c) : '<div class="price-block"><span class="price-now">Free</span></div>')) +
        (!unlocked && batches.length
          ? '<fieldset class="batch-pick"><legend>Choose your batch time</legend>' + batches.map(function (b, i) {
              return '<label class="batch-opt"><input type="radio" name="batch" value="' + esc(b) + '"' + (batches.length === 1 ? " checked" : "") + '><span>' + esc(b) + "</span></label>";
            }).join("") + "</fieldset>"
          : "") +
        (unlocked
          ? (vids.length ? '<a class="btn-btb w-100" href="watch.html?v=' + encodeURIComponent(vids[0].slug) + '"><i class="bi bi-play-fill" aria-hidden="true"></i>Start learning</a>' : "")
          : '<button type="button" class="btn-btb w-100" id="buyBtn"><i class="bi bi-lock" aria-hidden="true"></i>Enrol Now – ' + esc(S.formatPrice(c.price_paise)) + "</button>" +
            (vids.some(function (v) { return v.is_preview; }) ? '<a class="btn-btb-outline w-100 mt-2" href="watch.html?v=' + encodeURIComponent(vids.filter(function (v) { return v.is_preview; })[0].slug) + '">Watch free preview</a>' : "")) +
        '<div class="form-status mt-3" id="buyMsg" role="status" aria-live="polite"></div>' +
        (perks.length ? '<ul class="perk-list">' + perks.map(function (p) { return '<li><i class="bi bi-check2-circle" aria-hidden="true"></i>' + esc(p) + "</li>"; }).join("") + "</ul>" : "") +
        "</div></aside></div></div>";

      if (objs.length) {
        html += '<section class="mt-5" aria-labelledby="objTitle"><h2 class="h4" id="objTitle">What you will learn</h2><ul class="objective-list">' +
          objs.map(function (o) { return '<li><i class="bi bi-check2-circle" aria-hidden="true"></i>' + esc(o) + "</li>"; }).join("") + "</ul></section>";
      }
      html += '<section class="mt-5" aria-labelledby="modTitle"><h2 class="h4 mb-3" id="modTitle">Course content</h2>';
      if (!mods.length) {
        html += '<div class="state-box"><i class="bi bi-layers state-icon" aria-hidden="true"></i><h3>Modules coming soon</h3><p>Lessons for this course will appear here once they are published.</p></div>';
      }
      mods.forEach(function (m, i) {
        var lessons = vids.filter(function (v) { return v.module_id === m.id; });
        html += '<article class="module-block"><header><h3><span class="module-no">Module ' + (i + 1) + "</span>" + esc(m.title) + "</h3>" +
          '<span class="module-count">' + B.plural(lessons.length, "lesson") + "</span></header>" +
          (m.description ? '<p class="module-desc">' + esc(m.description) + "</p>" : "");
        if (!lessons.length) { html += '<p class="module-empty">No lessons published in this module yet.</p>'; }
        else {
          html += '<ol class="lesson-list">' + lessons.map(function (v) {
            var locked = !unlocked && !v.is_preview;
            return '<li><a href="watch.html?v=' + encodeURIComponent(v.slug) + '"><i class="bi bi-' + (locked ? "lock" : "play-circle") + '" aria-hidden="true"></i><span class="lesson-title">' + esc(v.title) + (!unlocked && v.is_preview ? ' <span class="level-badge">Free preview</span>' : "") + "</span>" +
              (v.duration_seconds != null ? '<span class="lesson-dur">' + B.fmtDuration(v.duration_seconds) + "</span>" : "") + "</a></li>";
          }).join("") + "</ol>";
        }
        html += "</article>";
      });
      html += "</section>";
      el.innerHTML = html;

      var buy = $("#buyBtn"), msg = $("#buyMsg");
      if (buy) {
        var say = function (text, kind) { msg.className = "form-status" + (kind ? " is-" + kind : ""); msg.textContent = text; };
        buy.addEventListener("click", async function () {
          say("");
          var picked = null;
          if (batches.length) {
            picked = B.$$('input[name="batch"]', el).filter(function (x) { return x.checked; })[0] || null;
            if (!picked) { say("Please choose a batch time first.", "error"); return; }
          }
          buy.disabled = true;
          try {
            var res = await S.buy(c, { batch_time: picked ? picked.value : "" });
            if (res.status === "paid") { say("Payment verified. Your course is unlocked!", "ok"); setTimeout(function () { window.location.reload(); }, 1200); return; }
            if (res.status === "pending") { say("Your payment was received and is awaiting bank confirmation. Access unlocks automatically once it is confirmed - refresh this page in a few minutes.", "ok"); return; }
            if (res.status === "failed") { say("The payment failed and you have not been charged. Please try again.", "error"); }
            else { say("Payment was cancelled. You have not been charged."); }
          } catch (ex) { say(B.friendlyError(ex), "error"); }
          buy.disabled = false;
        });
      }
    });
  }

  /* ---- Videos / learning library ------------------------------------------- */
  function initLibrary() {
    var el = $("#libraryView"), search = $("#libSearch"), sel = $("#libCourse"), crumb = $("#libCrumb");
    var cat = null, timer = null;
    var state = { course: B.param("c"), q: "" };

    function render() {
      if (!cat) { return; }
      var course = cat.courses.filter(function (c) { return c.slug === state.course; })[0];
      var q = state.q.trim().toLowerCase();
      sel.value = course ? course.slug : "";
      crumb.innerHTML = course ? '<button type="button" class="btn-link-plain" id="libAll"><i class="bi bi-arrow-left" aria-hidden="true"></i> All courses</button>' : "";
      var back = $("#libAll"); if (back) { back.addEventListener("click", function () { go(""); }); }

      if (!cat.courses.length) { B.showEmpty(el, "collection-play", "No lessons yet", "The learning library is being prepared. New video lessons will appear here as soon as they are published."); return; }
      if (!cat.videos.length && !q) { B.showEmpty(el, "collection-play", "No published videos yet", "Video lessons will appear here as soon as the academy publishes them."); return; }

      if (q) {
        var hits = cat.videos.filter(function (v) {
          return v.title.toLowerCase().indexOf(q) !== -1 && (!course || v.course_id === course.id);
        });
        if (!hits.length) { B.showEmpty(el, "search", "No videos match \"" + state.q.trim() + "\"", "Try a different word, or clear the search."); return; }
        el.innerHTML = '<p class="result-note" role="status">' + B.plural(hits.length, "video") + ' found</p><div class="row g-4">' +
          hits.map(function (v) { return videoCard(v, courseTitle(v.course_id)); }).join("") + "</div>";
        return;
      }
      if (!course) {
        el.innerHTML = '<div class="row g-4">' + cat.courses.map(function (c) {
          var st = cat.stats[c.id], href = "videos.html?c=" + encodeURIComponent(c.slug);
          return '<div class="col-md-6 col-lg-4 d-flex"><article class="catalog-card"><a class="catalog-thumb" href="' + href + '" data-open="' + esc(c.slug) + '" tabindex="-1" aria-hidden="true">' + B.thumbHtml(c.thumbnail_path, "") + "</a>" +
            '<div class="catalog-body">' + (c.level ? '<span class="level-badge">' + esc(c.level) + "</span>" : "") +
            '<h3><a href="' + href + '" data-open="' + esc(c.slug) + '">' + esc(c.title) + "</a></h3>" +
            '<ul class="meta-line"><li><i class="bi bi-layers" aria-hidden="true"></i>' + B.plural(st.modules, "module") + "</li><li><i class=\"bi bi-play-btn\" aria-hidden=\"true\"></i>" + B.plural(st.lessons, "video") + "</li></ul>" +
            '<a class="btn-btb-outline btn-sm-btb mt-auto" href="' + href + '" data-open="' + esc(c.slug) + '">Open course videos</a></div></article></div>';
        }).join("") + "</div>";
        B.$$("[data-open]", el).forEach(function (a) { a.addEventListener("click", function (e) { e.preventDefault(); go(a.getAttribute("data-open")); }); });
        return;
      }
      var mods = cat.modules.filter(function (m) { return m.course_id === course.id; });
      var html = '<h2 class="h4 mb-3">' + esc(course.title) + "</h2>";
      var any = false;
      mods.forEach(function (m, i) {
        var vids = cat.videos.filter(function (v) { return v.module_id === m.id; });
        if (!vids.length) { return; }
        any = true;
        html += '<section class="mb-5"><h3 class="module-heading"><span class="module-no">Module ' + (i + 1) + "</span>" + esc(m.title) + '</h3><div class="row g-4">' +
          vids.map(function (v) { return videoCard(v); }).join("") + "</div></section>";
      });
      if (!any) { B.showEmpty(el, "collection-play", "No videos in this course yet", "Lessons will appear here as soon as they are published.", '<a class="btn-btb btn-sm-btb" href="course.html?c=' + encodeURIComponent(course.slug) + '">View course page</a>'); return; }
      el.innerHTML = html;
    }
    function courseTitle(id) { var c = cat.courses.filter(function (x) { return x.id === id; })[0]; return c ? c.title : ""; }
    function go(slug) {
      state.course = slug;
      var url = "videos.html" + (slug ? "?c=" + encodeURIComponent(slug) : "");
      try { window.history.replaceState(null, "", url); } catch (e) { /* ignore */ }
      render();
    }

    guard(el, async function () {
      cat = await loadCatalog();
      sel.innerHTML = '<option value="">All courses</option>' + cat.courses.map(function (c) { return '<option value="' + esc(c.slug) + '">' + esc(c.title) + "</option>"; }).join("");
      render();
    });
    sel.addEventListener("change", function () { go(sel.value); });
    search.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.q = search.value; render(); }, 200);
    });
    $("#libForm").addEventListener("submit", function (e) { e.preventDefault(); state.q = search.value; render(); });
  }

  /* ---- Video player ---------------------------------------------------------- */
  function initWatch() {
    var el = $("#watchView"), slug = B.param("v");
    if (!slug) { B.showEmpty(el, "search", "No video selected", "Pick a lesson from the learning library.", '<a class="btn-btb btn-sm-btb" href="videos.html">Open library</a>'); return; }
    guard(el, async function () {
      var rows = await must(B.db.from("videos").select("*").eq("slug", slug).eq("status", "published").limit(1));
      if (!rows.length) { B.showEmpty(el, "lock", "Video not available", "This lesson does not exist or is not published.", '<a class="btn-btb btn-sm-btb" href="videos.html">Open library</a>'); return; }
      var v = rows[0];
      var r = await Promise.all([
        must(B.db.from("courses").select("id,title,slug,price_paise").eq("id", v.course_id).limit(1)),
        loadModules([v.course_id]), loadVideos({ course_id: v.course_id })
      ]);
      var course = r[0][0], mods = r[1].sort(byOrder), all = r[2];
      if (!course) { B.showEmpty(el, "lock", "Video not available", "This lesson is not available right now."); return; }
      var S = window.BTBStudent, signedIn = false, unlocked = !course.price_paise || v.is_preview;
      if (!unlocked) {
        try { signedIn = !!(await S.user()); unlocked = signedIn && await S.isEnrolled(course.id); } catch (e) { unlocked = false; }
      }
      var modIdx = {}; mods.forEach(function (m, i) { modIdx[m.id] = i; });
      var seq = all.sort(function (a, b) { return ((modIdx[a.module_id] || 0) - (modIdx[b.module_id] || 0)) || byOrder(a, b); });
      var mod = mods.filter(function (m) { return m.id === v.module_id; })[0];
      var pos = seq.findIndex(function (x) { return x.id === v.id; });
      var prev = pos > 0 ? seq[pos - 1] : null, next = pos < seq.length - 1 ? seq[pos + 1] : null;
      var same = seq.filter(function (x) { return x.module_id === v.module_id; });
      setMeta(v.title + " | " + course.title + " | Break the Barriers Academy", (v.description || "").slice(0, 155) || ("Watch " + v.title + " from " + course.title));

      el.innerHTML = '<nav aria-label="Breadcrumb" class="crumbs"><a href="course.html?c=' + encodeURIComponent(course.slug) + '"><i class="bi bi-arrow-left" aria-hidden="true"></i> Back to Course</a></nav>' +
        '<div class="row g-4 g-xl-5"><div class="col-lg-8">' +
        '<div class="player-wrap"><video id="player" controls playsinline preload="metadata" ' + (v.thumbnail_path && B.thumbUrl(v.thumbnail_path) ? 'poster="' + esc(B.thumbUrl(v.thumbnail_path)) + '"' : "") + '></video>' +
        '<div class="player-msg" id="playerMsg" hidden role="alert"><p class="mb-3">This video could not be loaded. Check your connection and try again.</p><button type="button" class="btn-btb btn-sm-btb" id="playerRetry">Retry</button></div>' +
        (unlocked ? "" : '<div class="player-msg" id="lockMsg" role="alert"><i class="bi bi-lock-fill" aria-hidden="true"></i><p class="mb-3">' +
          (signedIn ? "This lesson is part of a paid course. Enrol to unlock all lessons (" + esc(S.formatPrice(course.price_paise)) + ")."
                    : "This lesson is part of a paid course. Sign in to continue, or enrol to unlock all lessons (" + esc(S.formatPrice(course.price_paise)) + ").") +
          '</p>' + (signedIn ? "" : '<a class="btn-btb-outline btn-sm-btb me-2" href="' + esc(S.loginUrl()) + '">Sign in</a>') +
          '<a class="btn-btb btn-sm-btb" href="course.html?c=' + encodeURIComponent(course.slug) + '">View course &amp; enrol</a></div>') + "</div>" +
        '<h1 class="h3 mt-3">' + esc(v.title) + "</h1>" +
        '<ul class="meta-line"><li><i class="bi bi-journal-text" aria-hidden="true"></i>' + esc(course.title) + "</li>" +
        (mod ? '<li><i class="bi bi-layers" aria-hidden="true"></i>Module ' + (modIdx[mod.id] + 1) + ": " + esc(mod.title) + "</li>" : "") +
        (v.duration_seconds != null ? '<li><i class="bi bi-clock" aria-hidden="true"></i>' + B.fmtDuration(v.duration_seconds) + "</li>" : "") + "</ul>" +
        (v.description ? '<p class="mt-3">' + esc(v.description).replace(/\n/g, "<br>") + "</p>" : "") +
        '<div class="d-flex flex-wrap gap-2 mt-4">' +
        (prev ? '<a class="btn-btb-outline btn-sm-btb" href="watch.html?v=' + encodeURIComponent(prev.slug) + '"><i class="bi bi-chevron-left" aria-hidden="true"></i>Previous lesson</a>' : "") +
        (next ? '<a class="btn-btb btn-sm-btb" href="watch.html?v=' + encodeURIComponent(next.slug) + '">Next lesson<i class="bi bi-chevron-right" aria-hidden="true"></i></a>' : "") +
        '<a class="btn-btb-outline btn-sm-btb ms-sm-auto" href="course.html?c=' + encodeURIComponent(course.slug) + '">Back to Course</a></div></div>' +
        '<aside class="col-lg-4" aria-labelledby="sideTitle"><div class="side-card"><h2 class="h6" id="sideTitle">' + (mod ? esc(mod.title) : "Lessons") + '</h2><ol class="lesson-list lesson-list--side">' +
        same.map(function (x) {
          return '<li><a href="watch.html?v=' + encodeURIComponent(x.slug) + '"' + (x.id === v.id ? ' aria-current="true" class="is-current"' : "") + '><i class="bi bi-' + (x.id === v.id ? "play-circle-fill" : "play-circle") + '" aria-hidden="true"></i><span class="lesson-title">' + esc(x.title) + "</span>" +
            (x.duration_seconds != null ? '<span class="lesson-dur">' + B.fmtDuration(x.duration_seconds) + "</span>" : "") + "</a></li>";
        }).join("") + "</ol></div></aside></div>";

      /* Load the exact file for this lesson. Signed link is requested now, never cached. */
      var player = $("#player"), msg = $("#playerMsg");
      var loadVideo = async function () {
        msg.hidden = true;
        try { player.src = await B.signedVideoUrl(v.video_storage_path); player.load(); }
        catch (e) { msg.hidden = false; }
      };
      player.addEventListener("error", function () { if (player.getAttribute("src")) { msg.hidden = false; } });
      $("#playerRetry").addEventListener("click", loadVideo);
      if (unlocked) { loadVideo(); } else { player.hidden = true; }   // locked: no signed URL is even requested (storage RLS also refuses it)
    });
  }

  /* ---- Contact ----------------------------------------------------------------- */
  function initContact() {
    var wa = "https://wa.me/" + C.whatsappNumber + "?text=" + encodeURIComponent("Hello, I would like to know more about the classes at " + C.academyName + ".");
    B.$$("[data-wa]").forEach(function (a) { a.setAttribute("href", wa); });
    var rows = [];
    if (C.contactPhone) { rows.push('<li><i class="bi bi-telephone" aria-hidden="true"></i><span>' + esc(C.contactPhone) + "</span></li>"); }
    if (C.contactEmail) { rows.push('<li><i class="bi bi-envelope" aria-hidden="true"></i><a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + "</a></li>"); }
    if (C.contactAddress) { rows.push('<li><i class="bi bi-geo-alt" aria-hidden="true"></i><span>' + esc(C.contactAddress) + "</span></li>"); }
    rows.push('<li><i class="bi bi-camera-video" aria-hidden="true"></i><span>Online classes via Google Meet, Monday to Friday</span></li>');
    $("#contactList").innerHTML = rows.join("");

    var form = $("#contactForm"), status = $("#formStatus"), btn = $("#sendBtn");
    var clean = function (s, max) { return String(s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); };
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      status.className = "form-status"; status.textContent = "";
      var f = form.elements;
      if (f.website.value) { return; } // honeypot: real visitors leave this empty
      var name = clean(f.name.value, 80), contact = clean(f.contact.value, 120), message = clean(f.message.value, 1000);
      f.name.setCustomValidity(name.length >= 2 ? "" : "Please enter your name.");
      var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^\+?[0-9][0-9\s-]{6,18}$/.test(contact);
      f.contact.setCustomValidity(ok ? "" : "Enter a valid email address or phone number.");
      f.message.setCustomValidity(message.length >= 5 ? "" : "Please write a short message.");
      form.classList.add("was-validated");
      if (!form.checkValidity()) { return; }
      if (!B.db) { status.className = "form-status is-error"; status.textContent = "The form is not connected yet. Please use WhatsApp."; return; }
      btn.disabled = true; btn.textContent = "Sending...";
      var r = await B.db.from("enquiries").insert({ name: name, contact: contact, message: message });
      btn.disabled = false; btn.textContent = "Send message";
      if (r.error) { status.className = "form-status is-error"; status.textContent = "Sorry, your message could not be sent (" + B.friendlyError(r.error) + "). Please try again or use WhatsApp."; return; }
      form.reset(); form.classList.remove("was-validated");
      status.className = "form-status is-ok"; status.textContent = "Thank you! Your message has been sent. We will get back to you soon.";
    });
    ["name", "contact", "message"].forEach(function (n) { form.elements[n].addEventListener("input", function () { form.elements[n].setCustomValidity(""); }); });

    /* Live-class booking request -> bookings table (admin reviews it under Admin > Bookings). */
    var bf = $("#bookingForm"), bs = $("#bookStatus"), bb = $("#bookBtn");
    bf.addEventListener("submit", async function (e) {
      e.preventDefault();
      bs.className = "form-status"; bs.textContent = "";
      var g = bf.elements;
      if (g.website.value) { return; }
      var name = clean(g.name.value, 80), contact = clean(g.contact.value, 120), slot = clean(g.slot.value, 120), message = clean(g.message.value, 1000);
      g.name.setCustomValidity(name.length >= 2 ? "" : "Please enter your name.");
      g.contact.setCustomValidity(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) || /^\+?[0-9][0-9\s-]{6,18}$/.test(contact) ? "" : "Enter a valid email address or phone number.");
      bf.classList.add("was-validated");
      if (!bf.checkValidity()) { return; }
      if (!B.db) { bs.className = "form-status is-error"; bs.textContent = "Booking is not connected yet. Please use WhatsApp."; return; }
      bb.disabled = true; bb.textContent = "Sending...";
      var r = await B.db.from("bookings").insert({ name: name, contact: contact, preferred_slot: slot || null, message: message || null });
      bb.disabled = false; bb.textContent = "Request booking";
      if (r.error) { bs.className = "form-status is-error"; bs.textContent = "Sorry, your request could not be sent (" + B.friendlyError(r.error) + "). Please try again or use WhatsApp."; return; }
      bf.reset(); bf.classList.remove("was-validated");
      bs.className = "form-status is-ok"; bs.textContent = "Thank you! We have received your booking request and will contact you to confirm the slot.";
    });
    ["name", "contact"].forEach(function (n) { bf.elements[n].addEventListener("input", function () { bf.elements[n].setCustomValidity(""); }); });
  }

  /* ---- Student account: sign in / register, my courses, payment history -------------------- */
  function initAccount() {
    var el = $("#accountView"), S = window.BTBStudent;
    if (!B.db) { el.innerHTML = B.notConfiguredHtml(); return; }
    var next = S.safeNext(B.param("next"));

    function showAuth() {
      el.innerHTML = '<div class="row justify-content-center"><div class="col-md-8 col-lg-5"><div class="form-card">' +
        '<div class="auth-tabs" role="tablist"><button type="button" class="is-active" data-tab="in" role="tab" aria-selected="true">Sign in</button><button type="button" data-tab="up" role="tab" aria-selected="false">Create account</button></div>' +
        '<form id="authForm" novalidate>' +
        '<div class="mb-3" id="nameRow" hidden><label class="form-label" for="aName">Full name</label><input class="form-control" id="aName" name="name" maxlength="80" autocomplete="name"><div class="invalid-feedback">Please enter your name.</div></div>' +
        '<div class="mb-3"><label class="form-label" for="aEmail">Email</label><input class="form-control" id="aEmail" name="email" type="email" autocomplete="email" required><div class="invalid-feedback">Enter a valid email address.</div></div>' +
        '<div class="mb-3"><label class="form-label" for="aPass">Password</label><input class="form-control" id="aPass" name="password" type="password" minlength="8" autocomplete="current-password" required><div class="invalid-feedback">Password must be at least 8 characters.</div></div>' +
        '<p class="text-end small mb-3" id="forgotRow"><button type="button" class="btn btn-link p-0 small" id="forgotBtn">Forgot password?</button></p>' +
        '<button class="btn-btb w-100" id="authBtn" type="submit">Sign in</button><div id="authStatus" class="form-status" role="status" aria-live="polite"></div></form></div></div></div>';
      var form = $("#authForm"), status = $("#authStatus"), btn = $("#authBtn"), mode = "in";
      var say = function (t, k) { status.className = "form-status" + (k ? " is-" + k : ""); status.textContent = t; };
      B.$$("[data-tab]", el).forEach(function (t) {
        t.addEventListener("click", function () {
          mode = t.getAttribute("data-tab");
          B.$$("[data-tab]", el).forEach(function (x) { var on = x === t; x.classList.toggle("is-active", on); x.setAttribute("aria-selected", on ? "true" : "false"); });
          $("#nameRow").hidden = mode !== "up";
          $("#forgotRow").hidden = mode === "up";
          form.elements.name.required = mode === "up";
          form.elements.password.autocomplete = mode === "up" ? "new-password" : "current-password";
          btn.textContent = mode === "up" ? "Create account" : "Sign in";
          form.classList.remove("was-validated"); say("");
        });
      });
      /* Forgot password: email a recovery link that opens reset-password.html. The reply is deliberately the same
         whether or not the address has an account, so this cannot be used to discover who is registered. */
      $("#forgotBtn").addEventListener("click", async function () {
        say("");
        var emailEl = form.elements.email;
        emailEl.classList.remove("is-invalid");
        if (!emailEl.value.trim() || !emailEl.checkValidity()) {
          emailEl.classList.add("is-invalid"); emailEl.focus();
          emailEl.addEventListener("input", function () { emailEl.classList.remove("is-invalid"); }, { once: true });
          say("Enter your email address above, then click Forgot password again.", "error"); return;
        }
        var fb = $("#forgotBtn"); fb.disabled = true;
        try {
          var rr = await B.db.auth.resetPasswordForEmail(emailEl.value.trim(), { redirectTo: new URL("reset-password.html", window.location.href).href });
          if (rr.error && /rate|seconds|too many/i.test(rr.error.message)) { say("Please wait a minute before asking for another email.", "error"); }
          else { say("If an account exists for that email, a password-reset link is on its way. Check your inbox and spam folder.", "ok"); }
        } catch (ex) { say(B.friendlyError(ex), "error"); }
        fb.disabled = false;
      });
      form.addEventListener("submit", async function (e) {
        e.preventDefault(); say("");
        form.classList.add("was-validated");
        if (!form.checkValidity()) { return; }
        btn.disabled = true;
        try {
          var email = form.elements.email.value.trim(), pw = form.elements.password.value, r;
          if (mode === "up") {
            r = await B.db.auth.signUp({ email: email, password: pw, options: { data: { full_name: form.elements.name.value.trim() } } });
            if (r.error) { throw r.error; }
            if (!r.data.session) { say("Account created. Please check your email and click the confirmation link, then sign in.", "ok"); btn.disabled = false; return; }
          } else {
            r = await B.db.auth.signInWithPassword({ email: email, password: pw });
            if (r.error) { throw r.error; }
          }
          if (next) { window.location.replace(next); } else { showAccount(); }
        } catch (ex) {
          say(/invalid login/i.test(ex.message) ? "Incorrect email or password." : /not confirmed/i.test(ex.message) ? "Please confirm your email first (check your inbox)." : B.friendlyError(ex), "error");
        }
        btn.disabled = false;
      });
    }

    async function showAccount() {
      B.showLoading(el, "Loading your account...");
      try {
        var u = await S.user(); if (!u) { showAuth(); return; }
        var r = await Promise.all([
          must(B.db.from("enrollments").select("course_id,granted_at").eq("user_id", u.id)),
          must(B.db.from("orders").select("id,course_id,amount_paise,status,created_at").eq("user_id", u.id).order("created_at", { ascending: false }))
        ]);
        var ids = {}; r[0].concat(r[1]).forEach(function (x) { ids[x.course_id] = true; });
        var courses = Object.keys(ids).length ? await must(B.db.from("courses").select("id,title,slug").in("id", Object.keys(ids))) : [];
        var byId = {}; courses.forEach(function (c) { byId[c.id] = c; });
        var html = '<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4"><div><h2 class="h4 mb-0">Welcome' +
          (u.user_metadata && u.user_metadata.full_name ? ", " + esc(u.user_metadata.full_name) : "") + '</h2><div class="text-muted">' + esc(u.email) + '</div></div><button type="button" class="btn-btb-outline btn-sm-btb" id="logoutBtn">Sign out</button></div>';
        html += '<h3 class="h5">My courses</h3>';
        var mine = r[0].filter(function (en) { return byId[en.course_id]; });
        html += mine.length ? '<div class="row g-3 mb-5">' + mine.map(function (en) {
          var c = byId[en.course_id];
          return '<div class="col-md-6 col-lg-4"><div class="side-card h-100"><h4 class="h6">' + esc(c.title) + '</h4><a class="btn-btb btn-sm-btb" href="course.html?c=' + encodeURIComponent(c.slug) + '">Open course</a></div></div>';
        }).join("") + "</div>" : '<p class="text-muted mb-5">You have not enrolled in any paid course yet. <a href="courses.html">Browse courses</a>.</p>';
        html += '<h3 class="h5">Payment history</h3>';
        html += r[1].length ? '<div class="table-wrap"><table class="table align-middle"><thead><tr><th scope="col">Date</th><th scope="col">Course</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead><tbody>' + r[1].map(function (o) {
          var c = byId[o.course_id];
          return "<tr><td>" + esc(new Date(o.created_at).toLocaleDateString()) + "</td><td>" + esc(c ? c.title : "Course") + "</td><td>" + esc(S.formatPrice(o.amount_paise)) +
            '</td><td><span class="pay-status is-' + esc(o.status) + '">' + esc(S.statusLabel(o.status)) + "</span></td></tr>";
        }).join("") + "</tbody></table></div><p class=\"small text-muted\">\"Awaiting confirmation\" means your bank has not confirmed the payment yet; access unlocks automatically when it does.</p>" : '<p class="text-muted">No payments yet.</p>';
        el.innerHTML = html;
        $("#logoutBtn").addEventListener("click", async function () { await B.db.auth.signOut(); window.location.reload(); });
      } catch (e) { B.showError(el, B.friendlyError(e), showAccount); }
    }
    showAccount();
  }

  /* ---- Password reset (the page opened from the emailed recovery link) ------------ */
  function initReset() {
    var el = $("#resetView");
    if (!B.db) { el.innerHTML = B.notConfiguredHtml(); return; }
    var shown = false;

    function showExpired(text) {
      el.innerHTML = '<div class="row justify-content-center"><div class="col-md-8 col-lg-5"><div class="form-card text-center">' +
        '<i class="bi bi-link-45deg state-icon" aria-hidden="true"></i><h2 class="h5">Reset link not valid</h2><p>' + esc(text) + '</p>' +
        '<a class="btn-btb btn-sm-btb" href="account.html">Back to sign in</a></div></div></div>';
    }
    function showForm() {
      if (shown) { return; } shown = true;
      el.innerHTML = '<div class="row justify-content-center"><div class="col-md-8 col-lg-5"><div class="form-card"><h2 class="h5 mb-3">Choose a new password</h2>' +
        '<form id="resetForm" novalidate>' +
        '<div class="mb-3"><label class="form-label" for="rPass">New password</label><input class="form-control" id="rPass" name="password" type="password" minlength="8" autocomplete="new-password" required><div class="invalid-feedback">Password must be at least 8 characters.</div></div>' +
        '<div class="mb-3"><label class="form-label" for="rPass2">Confirm new password</label><input class="form-control" id="rPass2" name="confirm" type="password" minlength="8" autocomplete="new-password" required><div class="invalid-feedback" id="rPass2Msg">Re-enter the same password.</div></div>' +
        '<button class="btn-btb w-100" id="resetBtn" type="submit">Save new password</button><div id="resetStatus" class="form-status" role="status" aria-live="polite"></div></form></div></div></div>';
      var form = $("#resetForm"), status = $("#resetStatus"), btn = $("#resetBtn");
      var say = function (t, k) { status.className = "form-status" + (k ? " is-" + k : ""); status.textContent = t; };
      form.addEventListener("submit", async function (e) {
        e.preventDefault(); say("");
        var p = form.elements.password.value, p2 = form.elements.confirm.value;
        form.elements.confirm.setCustomValidity(p === p2 ? "" : "Passwords do not match.");
        $("#rPass2Msg").textContent = p === p2 ? "Re-enter the same password." : "Passwords do not match.";
        form.classList.add("was-validated");
        if (!form.checkValidity()) { return; }
        btn.disabled = true;
        try {
          var r = await B.db.auth.updateUser({ password: p });
          if (r.error) { throw r.error; }
          el.innerHTML = '<div class="row justify-content-center"><div class="col-md-8 col-lg-5"><div class="form-card text-center"><i class="bi bi-check-circle state-icon" aria-hidden="true"></i>' +
            '<h2 class="h5">Password updated</h2><p>You are now signed in with your new password.</p><a class="btn-btb btn-sm-btb" href="account.html">Go to my account</a></div></div></div>';
        } catch (ex) {
          say(/same password|different from the old/i.test(ex.message) ? "Choose a password that is different from your old one." : B.friendlyError(ex), "error");
          btn.disabled = false;
        }
      });
    }

    var hash = window.location.hash || "";
    var hashErr = /error_description=([^&]+)/.exec(hash);
    if (hashErr) { showExpired("This link has expired or was already used. Ask for a new one from the sign-in page."); return; }
    B.showLoading(el, "Checking your reset link...");
    B.db.auth.onAuthStateChange(function (event) { if (event === "PASSWORD_RECOVERY") { showForm(); } });
    /* Without a valid recovery link in the address there is nothing to do here. */
    setTimeout(function () { if (!shown) { showExpired("Open this page from the link in your password-reset email, or request a new link from the sign-in page."); } }, 3500);
  }

  var init = { home: initHome, courses: initCourses, course: initCourse, videos: initLibrary, watch: initWatch, contact: initContact, account: initAccount, reset: initReset }[page];
  if (init) { init(); }
  if (window.BTBStudent) { window.BTBStudent.updateNav(); }
})();
