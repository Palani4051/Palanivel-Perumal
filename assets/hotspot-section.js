/**
 * Hotspot / Shop-the-look section
 * File: assets/hotspot-section.js
 *
 * Handles: hotspot popups, variant selection, add to cart and
 * live cart updates (Horizon, Dawn and generic themes).
 *
 * Settings are read from data attributes on the `.hs-section` element:
 *   data-go-to-cart, data-cart-url, data-add-url, data-cart-js-url
 */
(function () {
  'use strict';

  if (window.__hotspotSectionLoaded) return;
  window.__hotspotSectionLoaded = true;

  function initHotspotSection(root) {
    if (!root || root.getAttribute('data-hs-ready') === 'true') return;
    root.setAttribute('data-hs-ready', 'true');

    var goToCart = root.getAttribute('data-go-to-cart') === 'true';
    var cartUrl = root.getAttribute('data-cart-url') || '/cart';
    var addUrl = root.getAttribute('data-add-url') || '/cart/add.js';
    var cartJsUrl = root.getAttribute('data-cart-js-url') || '/cart.js';

    var openModal = null;
    var lastTrigger = null;

    function getVariants(modal) {
      if (!modal._variants) {
        try {
          modal._variants = JSON.parse(modal.querySelector('[data-variants]').textContent);
        } catch (e) {
          modal._variants = [];
        }
      }
      return modal._variants;
    }

    function selectedOptions(modal) {
      var opts = [];
      var missing = null;
      modal.querySelectorAll('[data-option]').forEach(function (group) {
        var idx = parseInt(group.getAttribute('data-option'), 10);
        var val = '';
        var radio = group.querySelector('input:checked');
        var select = group.querySelector('select');
        if (radio) val = radio.value;
        if (select) val = select.value;
        opts[idx] = val;
        if (!val && !missing) missing = group.getAttribute('data-name');
      });
      return { options: opts, missing: missing };
    }

    function findVariant(modal) {
      var variants = getVariants(modal);
      var sel = selectedOptions(modal);
      if (!modal.querySelector('[data-option]')) return variants[0] || null;
      if (sel.missing) return null;
      return variants.filter(function (v) {
        return v.options.every(function (o, i) { return o === sel.options[i]; });
      })[0] || null;
    }

    function setError(modal, msg) {
      modal.querySelector('[data-error]').textContent = msg || '';
    }

    function update(modal) {
      var variant = findVariant(modal);
      var btn = modal.querySelector('[data-add]');
      var txt = modal.querySelector('[data-add-text]');
      setError(modal, '');

      if (!variant) {
        // Combination doesn't exist (or an option isn't chosen yet)
        if (!selectedOptions(modal).missing) {
          btn.disabled = true;
          txt.textContent = modal.getAttribute('data-soldout-label');
        }
        return;
      }

      var priceEl = modal.querySelector('[data-price]');
      priceEl.innerHTML = variant.price + (variant.compare ? '<s>' + variant.compare + '</s>' : '');

      if (variant.image) {
        var img = modal.querySelector('.hs-product-img');
        if (img && img.tagName === 'IMG') {
          img.removeAttribute('srcset');
          img.src = variant.image;
        }
      }

      btn.disabled = !variant.available;
      txt.textContent = variant.available
        ? modal.getAttribute('data-add-label')
        : modal.getAttribute('data-soldout-label');
    }

    function setOptions(modal, values) {
      modal.querySelectorAll('[data-option]').forEach(function (group) {
        var idx = parseInt(group.getAttribute('data-option'), 10);
        var val = values[idx];
        group.querySelectorAll('input[type="radio"]').forEach(function (r) {
          r.checked = r.value === val;
        });
        var select = group.querySelector('select');
        if (select) select.value = val;
      });
    }

    // If the chosen combination doesn't exist, switch the other options to the
    // best matching variant (preferring one that is in stock).
    function onOptionChange(modal, group) {
      var variants = getVariants(modal);
      var chosen = selectedOptions(modal).options;
      var changed = parseInt(group.getAttribute('data-option'), 10);

      var exact = variants.some(function (v) {
        return v.options.every(function (o, i) { return o === chosen[i]; });
      });

      if (!exact) {
        var candidates = variants.filter(function (v) { return v.options[changed] === chosen[changed]; });
        var best = candidates.filter(function (v) { return v.available; })[0] || candidates[0];
        if (best) setOptions(modal, best.options);
      }
      update(modal);
    }

    function openPopup(id, trigger) {
      var modal = root.querySelector('[data-modal="' + id + '"]');
      if (!modal) return;
      closePopup();
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      openModal = modal;
      lastTrigger = trigger;
      var close = modal.querySelector('.hs-close');
      if (close) close.focus();
    }

    function closePopup() {
      if (!openModal) return;
      openModal.classList.remove('is-open');
      openModal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastTrigger) lastTrigger.focus();
      openModal = null;
    }

    // Selectors for the cart icon / count in common themes (Dawn, Horizon, etc.)
    var COUNT_SELECTORS = [
      '#cart-icon-bubble',
      '[data-cart-count]',
      '[data-cart-count-bubble]',
      '.cart-count-bubble',
      '.cart-count',
      '.cart-item-count',
      '.header-cart-count',
      '.js-cart-count'
    ];

    function openDrawerViaIcon() {
      var link = document.querySelector('#cart-icon-bubble, header a[href$="/cart"]');
      if (!link) return false;
      var handled = false;
      function check(e) {
        if (e.defaultPrevented) handled = true;
        else e.preventDefault();
      }
      window.addEventListener('click', check);
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      window.removeEventListener('click', check);
      return handled;
    }

    // Refreshes the cart count/icon and cart drawer without a page reload.
    // Resolves to true if a cart drawer was opened.
    function refreshCart() {
      var pageUrl = new URL(window.location.href);
      pageUrl.searchParams.set('hs_cb', Date.now());

      return Promise.all([
        fetch(cartJsUrl + '?t=' + Date.now(), { cache: 'no-store', headers: { Accept: 'application/json' } })
          .then(function (r) { return r.json(); }),
        fetch(pageUrl.toString(), { cache: 'no-store', headers: { Accept: 'text/html' } })
          .then(function (r) { return r.text(); })
      ]).then(function (res) {
        var cart = res[0];
        var doc = new DOMParser().parseFromString(res[1], 'text/html');

        var drawerOpened = false;

        // 0. Horizon theme: <cart-icon> + <theme-drawer> / <cart-drawer-component>
        var cartIcons = document.querySelectorAll('cart-icon');
        var isHorizon = cartIcons.length > 0;

        if (isHorizon) {
          // Update the cart bubble using the theme's own method (includes animation)
          cartIcons.forEach(function (icon) {
            if (typeof icon.renderCartBubble === 'function') icon.renderCartBubble(cart.item_count);
          });

          // Re-render the drawer contents with the fresh cart, then open it
          var hzDrawer = document.querySelector('cart-drawer-component');
          var hzFresh = doc.querySelector('cart-drawer-component');
          if (hzDrawer && hzFresh) {
            hzDrawer.innerHTML = hzFresh.innerHTML;
            var themeDrawer = hzDrawer.closest('theme-drawer');
            if (themeDrawer && typeof themeDrawer.open === 'function') {
              if (!themeDrawer.isOpen) themeDrawer.open();
              drawerOpened = true;
            }
          }
        }

        // 1. Cart icon + count (other themes)
        if (!isHorizon) COUNT_SELECTORS.forEach(function (sel) {
          var live = document.querySelectorAll(sel);
          var fresh = doc.querySelectorAll(sel);
          live.forEach(function (el, i) {
            if (fresh[i]) el.innerHTML = fresh[i].innerHTML;
            else if (el.children.length === 0) el.textContent = cart.item_count;
          });
        });

        // 2. Cart drawer (re-render and open it if the theme has one)
        var drawer = document.querySelector('cart-drawer');
        var freshDrawer = doc.querySelector('cart-drawer');
        if (drawer && freshDrawer) {
          drawer.innerHTML = freshDrawer.innerHTML;
          drawer.classList.toggle('is-empty', freshDrawer.classList.contains('is-empty'));
          if (typeof drawer.open === 'function') {
            drawer.open();
            drawerOpened = true;
          }
        }

        // 2b. Other drawer themes: "click" the header cart icon. If the theme
        //     handles it (opens its drawer) we keep that; otherwise we cancel
        //     the navigation so the customer stays on the page.
        if (!drawerOpened) drawerOpened = openDrawerViaIcon();

        // 3. Let theme scripts know the cart changed
        ['cart:refresh', 'cart:updated', 'cart:change'].forEach(function (name) {
          document.dispatchEvent(new CustomEvent(name, { detail: { cart: cart }, bubbles: true }));
        });

        return drawerOpened;
      }).catch(function () { return false; });
    }

    function addToCart(modal, btn) {
      var variant = findVariant(modal);
      if (!variant) {
        var missing = selectedOptions(modal).missing;
        setError(modal, missing ? 'Please choose your ' + missing.toLowerCase() + '.' : 'This combination is unavailable.');
        return;
      }
      if (!variant.available) return;

      var txt = modal.querySelector('[data-add-text]');
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      setError(modal, '');

      fetch(addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [{ id: variant.id, quantity: 1 }] })
      })
        .then(function (res) {
          return res.text().then(function (text) {
            var data = {};
            try { data = JSON.parse(text); } catch (e) {}
            if (!res.ok || data.status) {
              throw new Error(data.description || data.message || 'Could not add to cart.');
            }
            return data;
          });
        })
        .then(function () {
          if (goToCart) {
            window.location.href = cartUrl;
            return;
          }
          txt.textContent = modal.getAttribute('data-added-label');
          function reset() {
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            txt.textContent = modal.getAttribute('data-add-label');
          }
          refreshCart().then(function (drawerOpened) {
            if (drawerOpened) {
              closePopup();
              reset();
            } else {
              setTimeout(function () {
                closePopup();
                reset();
              }, 900);
            }
          });
        })
        .catch(function (err) {
          setError(modal, err.message);
          btn.disabled = false;
          btn.removeAttribute('aria-busy');
        });
    }

    root.addEventListener('click', function (e) {
      var opener = e.target.closest('[data-open]');
      if (opener) { openPopup(opener.getAttribute('data-open'), opener); return; }
      if (e.target.closest('[data-close]')) { closePopup(); return; }
      var add = e.target.closest('[data-add]');
      if (add) addToCart(add.closest('[data-modal]'), add);
    });

    root.addEventListener('change', function (e) {
      var modal = e.target.closest('[data-modal]');
      var group = e.target.closest('[data-option]');
      if (modal && group) onOptionChange(modal, group);
    });

    function onKey(e) {
      if (!document.body.contains(root)) {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = '';
        return;
      }
      if (!openModal) return;
      if (e.key === 'Escape') { closePopup(); return; }
      if (e.key === 'Tab') {
        var f = openModal.querySelectorAll('button:not([disabled]), select, input, a[href]');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
  }

  function initAll() {
    document.querySelectorAll('.hs-section').forEach(initHotspotSection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  // Theme editor: section added / re-rendered
  document.addEventListener('shopify:section:load', function (e) {
    var el = e.target && e.target.querySelector ? e.target.querySelector('.hs-section') : null;
    if (el) initHotspotSection(el);
  });
})();
