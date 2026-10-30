/* ============================================================
   Lớp chuyển động lấy cảm hứng từ Animate UI cho QLDA (vanilla).
   Chỉ dùng CSS + Web Animations API, không thêm thư viện.
   ============================================================ */
(function () {
  'use strict';

  var EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
  var EASE_SPRING = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var reduceQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var lite = false;
  var RIPPLE_SELECTOR = '.btn, .btn-icon, .nav-tab, .scope-btn, .btn-ai-float, .legal-qa-quick button, .motion-select-trigger';

  function prefersReduced() {
    return !!(reduceQuery && reduceQuery.matches);
  }

  function isLite() {
    return lite || prefersReduced();
  }

  function enableLite() {
    if (lite) return;
    lite = true;
    document.documentElement.classList.add('motion-lite');
    if (document.body) document.body.classList.add('motion-lite');
  }

  function setupPerformanceGuard() {
    if (prefersReduced()) {
      enableLite();
      return;
    }
    var cores = navigator.hardwareConcurrency || 8;
    var memory = navigator.deviceMemory || 8;
    if (cores <= 2 || (cores <= 4 && memory <= 2)) enableLite();

    if (!('PerformanceObserver' in window)) return;
    var longTasks = 0;
    function observeLongTasks() {
      try {
        new PerformanceObserver(function (list) {
          list.getEntries().forEach(function (entry) {
            if (entry.duration > 180) longTasks++;
          });
          if (longTasks >= 3) enableLite();
        }).observe({ entryTypes: ['longtask'] });
      } catch (_) { /* trình duyệt không hỗ trợ longtask */ }
    }
    setTimeout(observeLongTasks, 2500);
  }

  function animate(el, frames, options) {
    if (!el || typeof el.animate !== 'function' || isLite()) return null;
    var opts = Object.assign({ easing: EASE_OUT, fill: 'both' }, options || {});
    return el.animate(frames, opts);
  }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /* ---------- Count-up ---------- */

  function formatterFor(kind) {
    if (kind === 'currency') {
      return function (v) { return Math.round(v).toLocaleString('vi-VN') + ' \u20ab'; };
    }
    if (kind === 'percent') {
      return function (v) { return (Math.round(v * 10) / 10).toLocaleString('vi-VN') + '%'; };
    }
    return function (v) { return Math.round(v).toLocaleString('vi-VN'); };
  }

  function countUp(el, endValue, opts) {
    opts = opts || {};
    if (!el) return;
    var end = num(endValue);
    var format = typeof opts.format === 'function' ? opts.format : formatterFor(opts.kind);
    var duration = opts.duration == null ? 900 : opts.duration;

    if (el._motionCountRAF) {
      cancelAnimationFrame(el._motionCountRAF);
      el._motionCountRAF = null;
    }
    if (el._motionCountTimer) {
      clearTimeout(el._motionCountTimer);
      el._motionCountTimer = null;
    }
    if (isLite() || duration <= 0) {
      el.textContent = format(end);
      return;
    }

    var from = opts.from == null ? num(el.dataset.countFrom) : num(opts.from);
    var start = null;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };

    function finish() {
      if (el._motionCountRAF) {
        cancelAnimationFrame(el._motionCountRAF);
        el._motionCountRAF = null;
      }
      if (el._motionCountTimer) {
        clearTimeout(el._motionCountTimer);
        el._motionCountTimer = null;
      }
      el.textContent = format(end);
    }

    function tick(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / duration);
      el.textContent = format(from + (end - from) * ease(p));
      if (p < 1) {
        el._motionCountRAF = requestAnimationFrame(tick);
      } else {
        finish();
      }
    }

    el._motionCountRAF = requestAnimationFrame(tick);
    el._motionCountTimer = setTimeout(finish, duration + 150);
  }

  function animateProgressBars(root) {
    if (!root || isLite()) return;
    root.querySelectorAll('.kpi-progress > span').forEach(function (bar) {
      var target = bar.style.width;
      if (!target) return;
      bar.style.transition = 'none';
      bar.style.width = '0%';
      requestAnimationFrame(function () {
        bar.style.transition = '';
        requestAnimationFrame(function () { bar.style.width = target; });
      });
    });
  }

  function countUpAll(root) {
    if (!root) return;
    root.querySelectorAll('[data-countup]').forEach(function (el) {
      countUp(el, el.dataset.countup, {
        kind: el.dataset.countFormat || 'number',
        duration: el.dataset.countDuration ? num(el.dataset.countDuration) : 900
      });
    });
    animateProgressBars(root);
  }

  /* ---------- Reveal / stagger ---------- */

  function staggerChildren(container, opts) {
    if (!container || isLite()) return;
    opts = opts || {};
    var kids = Array.prototype.filter.call(container.children, function (el) {
      return el.nodeType === 1 && !el.classList.contains('hidden') && el.offsetParent !== null;
    });
    var max = opts.max == null ? 14 : opts.max;
    kids.slice(0, max).forEach(function (el, i) {
      var delay = Math.min(i * (opts.stagger == null ? 45 : opts.stagger), opts.maxDelay == null ? 320 : opts.maxDelay);
      var anim = animate(el, [
        { opacity: 0, transform: 'translateY(' + (opts.y == null ? 14 : opts.y) + 'px)' },
        { opacity: 1, transform: 'none' }
      ], { duration: opts.duration == null ? 460 : opts.duration, delay: delay, easing: EASE_SPRING });
      if (anim) anim.onfinish = function () { anim.cancel(); };
    });
  }

  function revealOnScroll(container, selector, opts) {
    if (!container || isLite() || !('IntersectionObserver' in window)) return;
    opts = opts || {};
    var nodes = Array.prototype.slice.call(container.querySelectorAll(selector || ':scope > *'));
    if (!nodes.length) return;
    nodes.forEach(function (el) {
      el.classList.add('motion-reveal');
      if (opts.stagger) el.style.transitionDelay = Math.min(240, nodes.indexOf(el) * opts.stagger) + 'ms';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    nodes.forEach(function (n) { io.observe(n); });
  }

  /* ---------- Modal ---------- */

  function sheetMode() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  function modalOpen(modal, backdrop) {
    if (!modal) return;
    modal._motionOpenId = (modal._motionOpenId || 0) + 1;
    stopAnimations(modal);
    stopAnimations(backdrop);
    animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out', fill: 'none' });
    if (sheetMode()) {
      var sheetAnim = animate(modal, [
        { opacity: 1, transform: 'translateY(100%)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 300, easing: EASE_SPRING, fill: 'none' });
      if (sheetAnim) sheetAnim.onfinish = function () { sheetAnim.cancel(); };
      return;
    }
    if (modal.querySelectorAll('*').length > 200) {
      var fade = animate(modal, [{ opacity: 0.8 }, { opacity: 1 }], { duration: 120, easing: 'ease-out', fill: 'none' });
      if (fade) fade.onfinish = function () { fade.cancel(); };
      return;
    }
    var anim = animate(modal, [
      { opacity: 0.65, transform: 'scale(0.97)' },
      { opacity: 1, transform: 'scale(1)' }
    ], { duration: 260, easing: EASE_SPRING, fill: 'none' });
    if (anim) anim.onfinish = function () { anim.cancel(); };
  }

  function stopAnimations(el) {
    if (!el || typeof el.getAnimations !== 'function') return;
    el.getAnimations().forEach(function (a) {
      try { a.cancel(); } catch (err) { /* ignore */ }
    });
  }

  function modalClose(modal, backdrop, done) {
    var openId = modal ? modal._motionOpenId : null;
    var finished = false;
    function finish() {
      if (finished) return;
      if (modal && modal._motionOpenId !== openId) return;
      finished = true;
      if (typeof done === 'function') done();
    }
    if (!modal || isLite()) { finish(); return; }
    if (modal.querySelectorAll('*').length > 200) { finish(); return; }
    stopAnimations(modal);
    stopAnimations(backdrop);
    var sheet = sheetMode();
    var anim = animate(modal, sheet ? [
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 1, transform: 'translateY(100%)' }
    ] : [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(0.97)' }
    ], { duration: 180, easing: EASE_IN });
    animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: EASE_IN });
    if (anim) {
      anim.onfinish = function () { anim.cancel(); finish(); };
    }
    setTimeout(finish, 260);
  }

  /* ---------- View transition ---------- */

  function enterView(view) {
    if (!view || isLite()) return;
    if (view.querySelectorAll('*').length > 260) {
      var header = view.querySelector('.section-header');
      if (header) {
        var hAnim = animate(header, [
          { opacity: 0, transform: 'translateY(6px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 200 });
        if (hAnim) hAnim.onfinish = function () { hAnim.cancel(); };
      }
      return;
    }
    var anim = animate(view, [
      { opacity: 0, transform: 'translateY(10px) scale(0.998)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 360, easing: EASE_SPRING });
    if (anim) anim.onfinish = function () { anim.cancel(); };
    staggerChildren(view, { stagger: 38, y: 16, max: 10 });
  }

  /* ---------- Tab / scope indicator ---------- */

  function ensureIndicator(container) {
    if (!container) return null;
    container.classList.add('has-motion-indicator');
    var ind = container.querySelector(':scope > .motion-tab-indicator');
    if (!ind) {
      ind = document.createElement('span');
      ind.className = 'motion-tab-indicator';
      ind.setAttribute('aria-hidden', 'true');
      container.appendChild(ind);
    }
    return ind;
  }

  function moveIndicator(container, active) {
    var ind = container && container.querySelector('.motion-tab-indicator');
    if (!ind) return;
    if (!active) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.width = active.offsetWidth + 'px';
    ind.style.height = active.offsetHeight + 'px';
    ind.style.transform = 'translate3d(' + active.offsetLeft + 'px,' + active.offsetTop + 'px,0)';
  }

  function updateIndicators() {
    document.querySelectorAll('.nav-tabs.has-motion-indicator').forEach(function (c) {
      moveIndicator(c, c.querySelector('.nav-tab.active'));
    });
    document.querySelectorAll('.scope-switch.has-motion-indicator').forEach(function (c) {
      moveIndicator(c, c.querySelector('.scope-btn.active'));
    });
  }

  var indicatorObserver = null;

  function initIndicators() {
    var groups = Array.prototype.slice.call(document.querySelectorAll('.nav-tabs, .scope-switch'));
    groups.forEach(function (container) {
      ensureIndicator(container);
      container.classList.add('motion-no-transition');
    });
    updateIndicators();
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        groups.forEach(function (container) { container.classList.remove('motion-no-transition'); });
      });
    });
    if (!indicatorObserver && window.ResizeObserver) {
      indicatorObserver = new ResizeObserver(function () { updateIndicators(); });
      groups.forEach(function (container) { indicatorObserver.observe(container); });
    }
    window.addEventListener('resize', updateIndicators, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateIndicators);
  }

  /* ---------- Ripple ---------- */

  function onPointerDown(e) {
    if (isLite()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var target = e.target.closest ? e.target.closest(RIPPLE_SELECTOR) : null;
    if (!target || target.disabled) return;
    if (target.getAttribute('aria-disabled') === 'true') return;
    var rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var size = Math.max(rect.width, rect.height) * 1.7;
    var span = document.createElement('span');
    span.className = 'motion-ripple';
    span.style.width = size + 'px';
    span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top = (e.clientY - rect.top - size / 2) + 'px';
    target.classList.add('motion-ripple-host');
    target.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); }, { once: true });
    setTimeout(function () { if (span.parentNode) span.remove(); }, 800);
  }

  /* ---------- Init ---------- */

  function init() {
    if (init.done) return;
    init.done = true;
    setupPerformanceGuard();
    initIndicators();
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var modal = document.getElementById('modal');
      if (modal && !modal.classList.contains('hidden') && typeof window.closeModal === 'function') {
        window.closeModal();
      }
    });
  }

  window.QLMotion = {
    prefersReduced: prefersReduced,
    isLite: isLite,
    enableLite: enableLite,
    animate: animate,
    countUp: countUp,
    countUpAll: countUpAll,
    staggerChildren: staggerChildren,
    revealOnScroll: revealOnScroll,
    modalOpen: modalOpen,
    modalClose: modalClose,
    enterView: enterView,
    updateIndicators: updateIndicators,
    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
