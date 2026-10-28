/* Break the Barriers Academy — site behaviour (vanilla JS, no dependencies besides Bootstrap's bundle). */
(function () {
  "use strict";

  /* ---- Configuration: edit here ---------------------------------------- */
  var CONFIG = {
    whatsappNumber: "919360046012", // international format, digits only (+91 93600 46012)
    academyName: "Break the Barriers Academy",
    maxNameLength: 60,
    maxMessageLength: 300
  };
  var VIDEO_PATH = /^assets\/videos\/[a-z0-9-]+\.mp4$/;

  /* ---- Header: subtle shadow once the page scrolls ---------------------- */
  var header = document.querySelector(".site-header");
  if (header) {
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }


  /* ---- Scroll reveal: soft fade-up as sections enter the viewport ------- */
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    var targets = document.querySelectorAll(
      ".stat-list, .section-head, .benefits-visual, .benefit-card, .about-visual, .about-copy, .course-card, .info-tile, " +
      ".video-card, .quote-card, .cta-panel, .site-footer .row > div"
    );
    var seen = new WeakMap();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) { return; }
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) {
      var parent = el.parentElement;
      var n = seen.get(parent) || 0;
      seen.set(parent, n + 1);
      el.style.setProperty("--reveal-delay", Math.min(n, 5) * 90 + "ms");
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  /* ---- Current-section highlight in the menu (single-page demo) --------- */
  var spyLinks = Array.prototype.slice.call(document.querySelectorAll('.site-header .nav-link[href^="#"], .site-header .nav-link[href="index.html"]'));
  var spyMap = [];
  spyLinks.forEach(function (a) {
    var id = a.getAttribute("href").charAt(0) === "#" ? a.getAttribute("href").slice(1) : "";
    spyMap.push({ link: a, el: id ? document.getElementById(id) : null });
  });
  var spyUpdate = function () {
    var y = window.scrollY + 140, current = spyMap[0];
    spyMap.forEach(function (m) { if (m.el && m.el.offsetTop <= y) { current = m; } });
    spyMap.forEach(function (m) {
      if (m === current) { m.link.setAttribute("aria-current", "page"); } else { m.link.removeAttribute("aria-current"); }
    });
  };
  /* Home page only: on every other page the menu's current item is set in that page's own HTML. */
  if (spyMap.length && document.body.getAttribute("data-page") === "home") { spyUpdate(); window.addEventListener("scroll", spyUpdate, { passive: true }); }
  /* ---- Footer year ------------------------------------------------------ */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---- Video modal: sound never autoplays; viewer presses play ---------- */
  var modalEl = document.getElementById("videoModal");
  if (modalEl && window.bootstrap) {
    var video = modalEl.querySelector("video");
    var title = modalEl.querySelector(".modal-title");
    var modal = new window.bootstrap.Modal(modalEl);

    document.querySelectorAll("[data-video]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var src = btn.getAttribute("data-video") || "";
        if (!VIDEO_PATH.test(src)) { return; } // only local, whitelisted files
        title.textContent = btn.getAttribute("data-title") || "Video";
        video.setAttribute("poster", btn.getAttribute("data-poster") || "");
        video.setAttribute("src", src);
        video.load();
        modal.show();
      });
    });

    modalEl.addEventListener("hidden.bs.modal", function () {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
  }

  /* ---- Enquiry form (demo): builds a WhatsApp message in the browser ---- */
  /* Nothing is sent to or stored on a server. The visitor reviews and sends
     the message inside WhatsApp. For stored enquiries, wire the form to a
     trusted backend or form service with server-side validation and spam
     protection (see README). */
  var form = document.getElementById("enquiryForm");
  if (form) {
    var nameInput = form.elements.name;
    var courseInput = form.elements.course;
    var messageInput = form.elements.message;
    var counter = document.getElementById("messageCount");

    var clean = function (value, max) {
      // Collapse whitespace and strip control characters.
      return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    };

    if (counter && messageInput) {
      messageInput.addEventListener("input", function () {
        counter.textContent = String(messageInput.value.length) + " / " + CONFIG.maxMessageLength;
      });
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = clean(nameInput.value, CONFIG.maxNameLength);
      var valid = name.length >= 2 && /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u.test(name);
      nameInput.setCustomValidity(valid ? "" : "Please enter your name (letters only, at least 2 characters).");
      form.classList.add("was-validated");
      if (!form.checkValidity()) { return; }

      var course = courseInput.value;
      var note = clean(messageInput.value, CONFIG.maxMessageLength);
      var text = "Hello, I'm " + name + ". ";
      text += course
        ? "I would like to know more about " + course + " at " + CONFIG.academyName + "."
        : "I would like to know more about the spoken English classes at " + CONFIG.academyName + ".";
      if (note) { text += " " + note; }

      var url = "https://wa.me/" + CONFIG.whatsappNumber + "?text=" + encodeURIComponent(text);
      window.open(url, "_blank", "noopener,noreferrer");
    });

    nameInput.addEventListener("input", function () { nameInput.setCustomValidity(""); });
  }
})();
