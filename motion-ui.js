/* ============================================================
   Motion UI: select/combobox có animation, tooltip, bottom sheet.
   Vanilla JS, không thêm thư viện.
   ============================================================ */
(function () {
  'use strict';

  var EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
  var EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
  var selectInstances = new WeakMap();
  var openInstance = null;
  var nativeValue = window.HTMLSelectElement
    ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
    : null;

  function reduced() {
    if (window.QLMotion) return window.QLMotion.isLite();
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
  }

  function animate(el, frames, options) {
    if (!el || reduced() || typeof el.animate !== 'function') return null;
    return el.animate(frames, Object.assign({ easing: EASE, fill: 'both' }, options || {}));
  }

  function playOnce(el, frames, options) {
    var anim = animate(el, frames, options);
    if (anim) anim.onfinish = function () { anim.cancel(); };
    return anim;
  }

  /* ---------------- Animated select / combobox ---------------- */

  function MotionSelect(select, options) {
    var self = this;
    this.select = select;
    this.options = options || {};
    this.searchable = !!this.options.searchable;
    this.isOpen = false;
    this.filter = '';

    this.wrap = document.createElement('div');
    this.wrap.className = 'motion-select';
    select.parentNode.insertBefore(this.wrap, select);
    this.wrap.appendChild(select);
    select.classList.add('motion-select-native');
    select.hidden = true;
    select.dataset.motionSelectReady = '1';

    this.trigger = document.createElement('button');
    this.trigger.type = 'button';
    this.trigger.className = 'motion-select-trigger';
    this.trigger.setAttribute('aria-haspopup', 'listbox');
    this.trigger.setAttribute('aria-expanded', 'false');

    this.label = document.createElement('span');
    this.label.className = 'motion-select-label';

    this.chevron = document.createElement('span');
    this.chevron.className = 'material-symbols-rounded motion-select-chevron';
    this.chevron.textContent = 'expand_more';

    this.trigger.appendChild(this.label);
    this.trigger.appendChild(this.chevron);
    this.wrap.appendChild(this.trigger);

    this.popup = document.createElement('div');
    this.popup.className = 'motion-select-popup';
    this.popup.setAttribute('role', 'listbox');
    this.popup.hidden = true;

    if (this.searchable) {
      var searchWrap = document.createElement('div');
      searchWrap.className = 'motion-select-search-wrap';
      var searchIcon = document.createElement('span');
      searchIcon.className = 'material-symbols-rounded';
      searchIcon.textContent = 'search';
      this.searchInput = document.createElement('input');
      this.searchInput.type = 'text';
      this.searchInput.className = 'motion-select-search';
      this.searchInput.placeholder = this.options.searchPlaceholder || 'Tìm kiếm...';
      this.searchInput.setAttribute('autocomplete', 'off');
      searchWrap.appendChild(searchIcon);
      searchWrap.appendChild(this.searchInput);
      this.popup.appendChild(searchWrap);
      this.searchInput.addEventListener('input', function () {
        self.filter = self.searchInput.value;
        self.renderOptions();
      });
      this.searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          var first = self.list.querySelector('.motion-select-option');
          if (first) first.click();
        }
      });
    }

    this.list = document.createElement('div');
    this.list.className = 'motion-select-list';
    this.popup.appendChild(this.list);
    this.wrap.appendChild(this.popup);

    this.trigger.addEventListener('click', function () {
      if (self.select.disabled) return;
      if (self.isOpen) self.close();
      else self.open();
    });

    this.trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!self.isOpen) self.open();
      } else if (e.key === 'Escape' && self.isOpen) {
        e.preventDefault();
        self.close();
      }
    });

    this.popup.addEventListener('keydown', function (e) {
      var opts = Array.prototype.slice.call(self.list.querySelectorAll('.motion-select-option'));
      var idx = opts.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        self.close();
        self.trigger.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        (opts[idx + 1] || opts[0] || self.searchInput || self.trigger).focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (opts[idx - 1] || opts[opts.length - 1] || self.searchInput || self.trigger).focus();
      } else if (e.key === 'Enter' && document.activeElement.classList.contains('motion-select-option')) {
        e.preventDefault();
        document.activeElement.click();
      }
    });

    this.onPointerDown = function (e) {
      if (!self.isOpen) return;
      if (self.wrap.contains(e.target)) return;
      if (self.backdrop && self.backdrop.contains(e.target)) return;
      self.close();
    };
    this.onResize = function () { if (self.isOpen) self.close(); };

    document.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('resize', this.onResize);

    if (nativeValue) {
      try {
        Object.defineProperty(select, 'value', {
          configurable: true,
          get: function () { return nativeValue.get.call(select); },
          set: function (v) {
            nativeValue.set.call(select, v);
            self.sync();
          }
        });
      } catch (_) { /* giữ nguyên hành vi mặc định */ }
    }

    select.addEventListener('change', function () { self.sync(); });
    this.observer = new MutationObserver(function () { self.sync(true); });
    this.observer.observe(select, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled']
    });

    this.sync();
  }

  MotionSelect.prototype.sync = function (rebuild) {
    var sel = this.select;
    var opt = sel.options[sel.selectedIndex] || sel.options[0] || null;
    var text = opt ? String(opt.textContent || '').trim() : '';
    this.label.textContent = text || this.options.placeholder || 'Chọn...';
    this.trigger.classList.toggle('is-placeholder', !opt || !sel.value);
    this.trigger.disabled = !!sel.disabled;
    this.wrap.classList.toggle('is-disabled', !!sel.disabled);
    this.trigger.setAttribute('aria-label', (this.options.ariaLabel || 'Chọn') + ': ' + (text || ''));
    if (rebuild && this.isOpen) this.renderOptions();
  };

  MotionSelect.prototype.open = function () {
    if (this.isOpen || this.select.disabled) return;
    if (openInstance && openInstance !== this) openInstance.close();
    openInstance = this;
    this.isOpen = true;
    this.filter = '';
    if (this.searchInput) this.searchInput.value = '';
    this.trigger.classList.add('is-open');
    this.trigger.setAttribute('aria-expanded', 'true');
    this.renderOptions();

    if (isMobile()) {
      this.popup.classList.add('motion-select-sheet');
      this.popup.hidden = false;
      this.openAsSheet();
    } else {
      this.popup.hidden = false;
      this.openAsPopover();
    }
  };

  MotionSelect.prototype.openAsPopover = function () {
    playOnce(this.popup, [
      { opacity: 0, transform: 'translateY(-6px) scale(0.98)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 220 });
    var self = this;
    setTimeout(function () {
      if (!self.isOpen) return;
      var target = self.searchInput || self.list.querySelector('.motion-select-option.is-selected') || self.list.querySelector('.motion-select-option');
      if (target) target.focus({ preventScroll: true });
    }, 60);
  };

  MotionSelect.prototype.openAsSheet = function () {
    var self = this;
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'motion-sheet-backdrop';
    this.backdrop.addEventListener('click', function () { self.close(); });
    document.body.appendChild(this.backdrop);
    document.body.classList.add('motion-sheet-open');
    animate(this.backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
    playOnce(this.popup, [
      { opacity: 1, transform: 'translateY(100%)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 320 });
    setTimeout(function () {
      if (!self.isOpen) return;
      if (self.searchInput) self.searchInput.focus({ preventScroll: true });
    }, 120);
  };

  MotionSelect.prototype.close = function () {
    if (!this.isOpen) return;
    var self = this;
    this.isOpen = false;
    if (openInstance === this) openInstance = null;
    this.trigger.classList.remove('is-open');
    this.trigger.setAttribute('aria-expanded', 'false');

    var sheet = this.popup.classList.contains('motion-select-sheet');
    var closed = false;
    var finish = function () {
      if (closed) return;
      closed = true;
      self.popup.hidden = true;
      self.popup.classList.remove('motion-select-sheet');
      if (self.backdrop) {
        self.backdrop.remove();
        self.backdrop = null;
      }
      if (!document.querySelector('.motion-sheet-backdrop')) {
        document.body.classList.remove('motion-sheet-open');
      }
    };

    if (reduced()) { finish(); return; }
    if (sheet) {
      animate(this.backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: EASE_IN });
      var anim = animate(this.popup, [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 1, transform: 'translateY(100%)' }
      ], { duration: 240, easing: EASE_IN });
      if (anim) anim.onfinish = function () { anim.cancel(); finish(); };
    } else {
      var pop = animate(this.popup, [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateY(-4px) scale(0.98)' }
      ], { duration: 140, easing: EASE_IN });
      if (pop) pop.onfinish = function () { pop.cancel(); finish(); };
    }
    setTimeout(finish, 320);
  };

  MotionSelect.prototype.renderOptions = function () {
    var self = this;
    var sel = this.select;
    var query = this.filter.trim().toLowerCase();
    var options = Array.prototype.slice.call(sel.options).filter(function (o) { return !o.disabled; });
    if (query) {
      options = options.filter(function (o) {
        return String(o.textContent || '').toLowerCase().indexOf(query) !== -1;
      });
    }

    this.list.textContent = '';
    if (!options.length) {
      var empty = document.createElement('div');
      empty.className = 'motion-select-empty';
      empty.textContent = 'Không có lựa chọn';
      this.list.appendChild(empty);
      return;
    }

    var current = sel.value;
    options.forEach(function (opt) {
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'motion-select-option';
      option.dataset.value = opt.value;
      option.setAttribute('role', 'option');
      var selected = opt.value === current;
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
      option.classList.toggle('is-selected', selected);

      var label = document.createElement('span');
      label.className = 'motion-select-option-label';
      label.textContent = String(opt.textContent || '').trim();

      var check = document.createElement('span');
      check.className = 'material-symbols-rounded motion-select-check';
      check.textContent = 'check';

      option.appendChild(label);
      option.appendChild(check);
      option.addEventListener('click', function () { self.choose(opt.value); });
      self.list.appendChild(option);
    });

    if (!reduced()) {
      Array.prototype.slice.call(this.list.children, 0, 10).forEach(function (el, i) {
        playOnce(el, [
          { opacity: 0, transform: 'translateY(-4px)' },
          { opacity: 1, transform: 'none' }
        ], { duration: 180, delay: i * 18 });
      });
    }
  };

  MotionSelect.prototype.choose = function (value) {
    var sel = this.select;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    this.sync();
    this.close();
    this.trigger.focus({ preventScroll: true });
  };

  function enhanceSelects(root) {
    var scope = root || document;
    var selects = Array.prototype.slice.call(scope.querySelectorAll('select[data-motion-select]'));
    selects.forEach(function (select) {
      if (selectInstances.has(select) || select.dataset.motionSelectReady) return;
      var instance = new MotionSelect(select, {
        searchable: select.hasAttribute('data-motion-search'),
        placeholder: select.dataset.motionPlaceholder || '',
        searchPlaceholder: select.dataset.motionSearchPlaceholder || 'Tìm kiếm...',
        ariaLabel: select.dataset.motionLabel || 'Chọn'
      });
      selectInstances.set(select, instance);
    });
  }

  /* ---------------- Animated tooltip ---------------- */

  var tipEl = null;
  var tipTarget = null;
  var tipTimer = null;

  function ensureTip() {
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.className = 'motion-tooltip';
      tipEl.setAttribute('role', 'tooltip');
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
    }
    return tipEl;
  }

  function showTip(el) {
    if (!el) return;
    var text = el.dataset.motionTooltip || el.getAttribute('title') || el.getAttribute('aria-label');
    if (!text) return;
    if (el.getAttribute('title')) {
      el.dataset.motionTooltip = text;
      el.removeAttribute('title');
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text);
    }
    clearTimeout(tipTimer);
    var tip = ensureTip();
    tipTarget = el;
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = '0px';
    tip.style.top = '0px';
    var rect = el.getBoundingClientRect();
    var width = tip.offsetWidth;
    var height = tip.offsetHeight;
    var left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    var top = rect.bottom + 8;
    if (top + height > window.innerHeight - 8) top = rect.top - height - 8;
    tip.style.left = left + 'px';
    tip.style.top = Math.max(8, top) + 'px';
    playOnce(tip, [
      { opacity: 0, transform: 'translateY(4px) scale(0.98)' },
      { opacity: 1, transform: 'none' }
    ], { duration: 150 });
  }

  function hideTip() {
    if (!tipEl || tipEl.hidden) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      if (!tipEl || tipEl.hidden) return;
      if (reduced()) { tipEl.hidden = true; return; }
      var anim = animate(tipEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: EASE_IN });
      if (anim) anim.onfinish = function () { anim.cancel(); tipEl.hidden = true; };
      else tipEl.hidden = true;
    }, 40);
  }

  function tooltipTargetFor(node) {
    return node && node.closest ? node.closest('.btn-icon[title], .btn-icon[data-motion-tooltip], .btn-ai-float[title], [data-tooltip]') : null;
  }

  document.addEventListener('pointerover', function (e) {
    if (e.pointerType === 'touch') return;
    var el = tooltipTargetFor(e.target);
    if (el && el !== tipTarget) showTip(el);
  });
  document.addEventListener('pointerout', function (e) {
    var el = tooltipTargetFor(e.target);
    if (el && !el.contains(e.relatedTarget)) hideTip();
  });
  document.addEventListener('focusin', function (e) {
    var el = tooltipTargetFor(e.target);
    if (el) showTip(el);
  });
  document.addEventListener('focusout', function (e) {
    var el = tooltipTargetFor(e.target);
    if (el) hideTip();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideTip();
  });
  document.addEventListener('pointerdown', function () { hideTip(); }, true);

  /* ---------------- Init ---------------- */

  function init() {
    enhanceSelects(document);
  }

  window.QMotionUI = {
    enhanceSelects: enhanceSelects,
    openInstance: function () { return openInstance; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
