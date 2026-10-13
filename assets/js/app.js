/* Craf7ton storefront: shared layout, bag, product mockups, forms, analytics and page logic. */
(function () {
  'use strict';

  const C = window.CRAFTON_CONFIG;
  const PRODUCTS = window.CRAFTON_PRODUCTS;
  const STACKS = window.CRAFTON_STACKS;
  const CATEGORIES = window.CRAFTON_CATEGORIES;
  const LINES = window.CRAFTON_COLLECTION_LINES;
  const page = document.body.dataset.page;

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${C.currency} ${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const params = new URLSearchParams(location.search);
  const waLink = (text) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}`;

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked: bag lives for this page view only */ }
    return value;
  }

  /* ---------- analytics ----------
   * Events: add_to_cart, begin_checkout, purchase, club_form_submit (+ generate_lead, sign_up).
   * Drop a GA4 / Meta / Plausible snippet into the pages and these flow through. */
  function track(event, data = {}) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...data });
    if (typeof window.gtag === 'function') window.gtag('event', event, data);
    if (typeof window.plausible === 'function') window.plausible(event, { props: data });
    if (typeof window.fbq === 'function') {
      const map = { add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout', purchase: 'Purchase', club_form_submit: 'Lead' };
      if (map[event]) window.fbq('track', map[event], data);
    }
  }

  /* ---------- icons ---------- */
  const I = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11 12 4l9 7v9H3v-9Z"/></svg>',
    shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3c0 2-1.5 3-4 3S8 5 8 3Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="22" height="22"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.7-.3-2-.9-3-2.6-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>'
  };

  /* ---------- product mockups ----------
   * Generated SVG stand-ins until real WebP photography arrives (see products.js `images`). */
  function isDark(hex) {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16));
    return (r * 299 + g * 587 + b * 114) / 1000 < 140;
  }

  function wrapWords(text, max) {
    const words = text.split(/\s+/);
    const lines = [];
    let cur = '';
    words.forEach((w) => {
      if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else { cur = (cur + ' ' + w).trim(); }
    });
    if (cur) lines.push(cur);
    return lines;
  }

  function printBlock(text, cx, top, width, ink, accent, maxChars = 11) {
    const lines = wrapWords(text, maxChars);
    const size = Math.min(34, Math.floor(width / Math.max(...lines.map((l) => l.length)) * 1.6));
    const lh = size * 1.05;
    return lines.map((l, i) => {
      const fill = i === lines.length - 1 ? accent : ink;
      return `<text x="${cx}" y="${top + size + i * lh}" text-anchor="middle" font-family="ui-monospace,Menlo,Consolas,monospace" font-weight="800" font-size="${size}" fill="${fill}">${esc(l)}</text>`;
    }).join('');
  }

  function garmentSVG(p, colour, view = 'front') {
    const fill = colour.hex;
    const dark = isDark(fill);
    const ink = dark ? '#f4f4f2' : '#111111';
    const stroke = dark ? '#000' : '#bdbdb8';
    const accent = fill.toLowerCase() === '#f5a800' ? '#111111' : '#f5a800';
    const label = `${p.name}, ${colour.name}, ${view}`;
    const open = (vb) => `<svg viewBox="${vb}" role="img" aria-label="${esc(label)}" xmlns="http://www.w3.org/2000/svg">`;

    if (p.type === 'stickers') {
      const st = [['My Brain Runs On Git', '#111', '#f5a800', -8, 20, 40], ['</>', '#f5a800', '#111', 6, 160, 30], ['Ship It', '#fff', '#111', -4, 40, 170], ['∑', '#111', '#fff', 10, 180, 160], ['craf7ton', '#f5a800', '#111', 3, 70, 250]];
      return open('0 0 300 340') + st.map(([t, bg, fg, rot, x, y]) =>
        `<g transform="rotate(${rot} ${x + 50} ${y + 40})"><rect x="${x}" y="${y}" width="${t.length > 6 ? 120 : 90}" height="80" rx="16" fill="${bg}" stroke="#000" stroke-width="2"/><text x="${x + (t.length > 6 ? 60 : 45)}" y="${y + 47}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" font-size="${t.length > 10 ? 10 : 16}" fill="${fg}">${esc(t)}</text></g>`
      ).join('') + '</svg>';
    }

    if (p.type === 'cap') {
      const crown = '<path d="M55 205 Q55 85 150 80 Q245 85 245 205 Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="3"/>';
      const seams = `<path d="M150 82 V205 M100 95 Q90 150 95 205 M200 95 Q210 150 205 205" stroke="${stroke}" stroke-width="1.5" fill="none" opacity=".6"/><circle cx="150" cy="84" r="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
      if (view === 'back') {
        return open('0 0 300 300') + crown + seams + `<path d="M115 205 Q150 160 185 205 Z" fill="${dark ? '#000' : '#e6e6e2'}"/><rect x="118" y="186" width="64" height="10" rx="4" fill="${accent}"/>` + printBlock(p.back, 150, 110, 80, ink, accent, 6) + '</svg>';
      }
      return open('0 0 300 300') + crown + seams +
        `<path d="M40 205 Q150 235 265 205 Q290 215 270 232 Q150 262 30 232 Q15 215 40 205 Z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>` +
        `<text x="150" y="160" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" font-size="22" fill="${ink}">${esc(p.front)}</text></svg>`;
    }

    if (view === 'print') {
      return open('0 0 300 300') + `<rect width="300" height="300" fill="${fill}"/>` +
        `<g opacity=".08">${Array.from({ length: 30 }, (_, i) => `<path d="M0 ${i * 10} H300" stroke="${ink}"/>`).join('')}</g>` +
        printBlock(p.back, 150, 70, 260, ink, accent, 9) + '</svg>';
    }

    const hoodie = p.type === 'hoodie';
    const body = hoodie
      ? 'M70 52 Q150 22 230 52 L268 78 L296 272 L258 280 L238 142 L238 312 L62 312 L62 142 L42 280 L4 272 L32 78 Z'
      : 'M62 42 L112 20 Q150 46 188 20 L238 42 L292 102 L250 134 L236 118 L236 308 L64 308 L64 118 L50 134 L8 102 Z';
    let extra = '';
    if (hoodie) {
      extra += view === 'front'
        ? `<path d="M105 40 Q150 108 195 40" fill="none" stroke="${stroke}" stroke-width="3"/><path d="M135 80 v40 M165 80 v40" stroke="${ink}" stroke-width="2" opacity=".6"/><path d="M98 230 H202 L216 292 H84 Z" fill="none" stroke="${stroke}" stroke-width="2.5"/>`
        : `<path d="M100 50 Q150 120 200 50" fill="none" stroke="${stroke}" stroke-width="3"/>`;
      extra += `<path d="M62 296 H238 M8 268 L42 274 M258 274 L292 268" stroke="${stroke}" stroke-width="2"/>`;
    } else {
      extra += view === 'front'
        ? `<path d="M112 20 Q150 58 188 20" fill="none" stroke="${stroke}" stroke-width="3"/>`
        : `<path d="M112 20 Q150 34 188 20" fill="none" stroke="${stroke}" stroke-width="3"/>`;
    }
    const print = view === 'front'
      ? `<text x="${hoodie ? 150 : 192}" y="${hoodie ? 150 : 96}" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="800" font-size="${hoodie ? 18 : 13}" fill="${ink}">${esc(p.front)}</text>`
      : printBlock(p.back, 150, hoodie ? 120 : 92, 150, ink, accent);
    return open('0 0 300 320') + `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>` + extra + print + '</svg>';
  }

  function productImage(p, colour, view) {
    if (p.images && p.images[view]) {
      return `<img src="${esc(p.images[view])}" alt="${esc(`${p.name}, ${view}`)}" loading="lazy" decoding="async" width="800" height="1000">`;
    }
    return garmentSVG(p, colour, view);
  }

  /* ---------- bag ---------- */
  const BAG_KEY = 'craf7ton_bag';
  let memBag = store(BAG_KEY) || [];
  const bag = {
    items: () => memBag,
    save() { store(BAG_KEY, memBag); updateBagCounts(); },
    count: () => memBag.reduce((n, i) => n + i.qty, 0),
    add(id, colour, size, qty = 1) {
      const hit = memBag.find((i) => i.id === id && i.colour === colour && i.size === size);
      if (hit) hit.qty += qty; else memBag.push({ id, colour, size, qty });
      this.save();
      const p = byId(id);
      track('add_to_cart', { currency: C.currency, value: p.price * qty, items: [{ item_id: id, item_name: p.name, item_variant: `${colour} / ${size}`, price: p.price, quantity: qty }] });
    },
    setQty(idx, qty) { if (qty < 1) memBag.splice(idx, 1); else memBag[idx].qty = qty; this.save(); },
    clear() { memBag = []; this.save(); },
    subtotal: () => memBag.reduce((s, i) => s + (byId(i.id) ? byId(i.id).price * i.qty : 0), 0)
  };
  // Drop lines for products that no longer exist in the catalogue.
  memBag = memBag.filter((i) => byId(i.id));

  function updateBagCounts() {
    const n = bag.count();
    $$('.bag-count').forEach((el) => { el.textContent = n; el.dataset.n = n; });
    $$('[data-bag-label]').forEach((el) => el.setAttribute('aria-label', `Bag, ${n} item${n === 1 ? '' : 's'}`));
  }

  let toastTimer;
  function toast(html) {
    let t = $('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  /* ---------- layout ---------- */
  const NAV = [
    { href: 'shop.html', label: 'Shop', key: 'shop' },
    { href: 'clubs.html', label: 'Clubs', key: 'clubs' },
    { href: 'story.html', label: 'Story', key: 'story' },
    { href: 'contact.html', label: 'Help', key: 'contact' }
  ];

  function renderHeader() {
    const el = $('#site-header');
    if (!el) return;
    el.outerHTML = `
      <a class="skip-link" href="#main">Skip to content</a>
      <div class="announce">${esc(C.announcement)} · <a href="clubs.html">Get a quote</a></div>
      <header class="site-header">
        <div class="wrap header-row">
          <div class="header-left">
            <button class="icon-btn menu-btn" type="button" data-open-menu aria-label="Open menu">${I.menu}</button>
            <a class="logo-link" href="index.html" aria-label="${esc(C.brand)} home"><img src="assets/img/logo.svg" alt="${esc(C.brand)}" width="120" height="30"></a>
          </div>
          <nav class="desktop-nav" aria-label="Main">
            ${NAV.map((n) => `<a href="${n.href}"${page === n.key ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
          </nav>
          <div class="header-right">
            <button class="icon-btn" type="button" data-open-search aria-label="Search">${I.search}</button>
            <a class="icon-btn" href="cart.html" data-bag-label>${I.bag}<span class="bag-count" data-n="0">0</span></a>
          </div>
        </div>
      </header>
      <dialog class="drawer" id="menu" aria-label="Menu">
        <div class="drawer-inner">
          <div class="drawer-top"><img src="assets/img/logo.svg" alt="${esc(C.brand)}" width="110" height="28"><button class="icon-btn" type="button" data-close aria-label="Close menu">${I.close}</button></div>
          <div><h3>Shop by stack</h3><ul>${STACKS.map((s) => `<li><a href="shop.html?stack=${s.id}">${esc(s.name)}</a></li>`).join('')}</ul></div>
          <div><h3>Shop by category</h3><ul><li><a href="shop.html">Everything</a></li>${CATEGORIES.map((c) => `<li><a href="shop.html?category=${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></div>
          <div><h3>Craf7ton</h3><ul><li><a href="clubs.html">Custom for your club</a></li><li><a href="story.html">Our story</a></li><li><a href="size-guide.html">Size guide</a></li><li><a href="delivery-returns.html">Delivery and returns</a></li><li><a href="contact.html">Contact</a></li></ul></div>
        </div>
      </dialog>
      <dialog class="modal" id="search" aria-label="Search">
        <div class="modal-inner">
          <div class="modal-top"><h2>Search</h2><button class="icon-btn" type="button" data-close aria-label="Close search">${I.close}</button></div>
          <form class="search-field" role="search" action="shop.html">
            <label class="visually-hidden" for="search-input">Search products</label>
            <input id="search-input" name="q" type="search" placeholder="Try git, hoodie, frontend" autocomplete="off">
            <button class="btn" type="submit">Go</button>
          </form>
          <ul class="search-results" id="search-results"></ul>
        </div>
      </dialog>`;
  }

  function renderFooter() {
    const el = $('#site-footer');
    if (!el) return;
    const tab = (href, key, icon, label) => `<a href="${href}"${page === key ? ' aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
    el.outerHTML = `
      <section class="signup" aria-labelledby="signup-h">
        <div class="wrap">
          <h2 id="signup-h">Get the next drop first</h2>
          <p class="small" style="margin:0">WhatsApp is fastest. Email works too. No spam, just drops.</p>
          <form data-form="signup" novalidate>
            <label class="visually-hidden" for="signup-contact">WhatsApp number or email</label>
            <input id="signup-contact" name="contact" type="text" inputmode="email" placeholder="WhatsApp number or email" required>
            <button class="btn" type="submit">Notify me</button>
            <p class="form-status" role="status" style="flex-basis:100%"></p>
          </form>
        </div>
      </section>
      <footer class="site-footer">
        <div class="wrap">
          <div class="footer-cols">
            <div><h3>Shop</h3><ul><li><a href="shop.html">Everything</a></li>${CATEGORIES.map((c) => `<li><a href="shop.html?category=${c.id}">${esc(c.name)}</a></li>`).join('')}</ul></div>
            <div><h3>Clubs</h3><ul><li><a href="clubs.html">Custom orders</a></li><li><a href="clubs.html#quote">Request a quote</a></li><li><a href="shop.html?stack=campus-clubs">Campus clubs</a></li></ul></div>
            <div><h3>Story</h3><ul><li><a href="story.html">Why Craf7ton</a></li><li><a href="${esc(C.instagram)}" rel="noopener">Instagram</a></li><li><a href="${esc(C.tiktok)}" rel="noopener">TikTok</a></li></ul></div>
            <div><h3>Help</h3><ul><li><a href="delivery-returns.html">Delivery info</a></li><li><a href="size-guide.html">Size guide</a></li><li><a href="delivery-returns.html#returns">Returns</a></li><li><a href="contact.html">Contact</a></li></ul></div>
          </div>
          <div class="footer-bottom">
            <img src="assets/img/logo.svg" alt="${esc(C.brand)}" width="104" height="26">
            <span>© ${new Date().getFullYear()} ${esc(C.brand)}. Made in Ghana for builders everywhere.</span>
          </div>
        </div>
      </footer>
      <nav class="tabbar" aria-label="Quick links">
        ${tab('index.html', 'home', I.home, 'Home')}
        ${tab('shop.html', 'shop', I.shop, 'Shop')}
        <button type="button" data-open-search>${I.search}<span>Search</span></button>
        <a href="cart.html"${page === 'cart' ? ' aria-current="page"' : ''} data-bag-label>${I.bag}<span>Bag</span><span class="bag-count" data-n="0">0</span></a>
      </nav>`;
  }

  function wireChrome() {
    const menu = $('#menu');
    const search = $('#search');
    $$('[data-open-menu]').forEach((b) => b.addEventListener('click', () => menu.showModal()));
    $$('[data-open-search]').forEach((b) => b.addEventListener('click', () => { search.showModal(); $('#search-input').focus(); renderSearch(''); }));
    $$('dialog').forEach((d) => {
      d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
    });
    const input = $('#search-input');
    if (input) input.addEventListener('input', () => renderSearch(input.value));
    updateBagCounts();
  }

  function matches(p, q) {
    if (!q) return true;
    const hay = [p.name, p.back, p.tagline, p.category, ...p.stacks, ...p.stacks.map((s) => (STACKS.find((x) => x.id === s) || {}).name)].join(' ').toLowerCase();
    return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  }

  function renderSearch(q) {
    const list = $('#search-results');
    if (!list) return;
    const hits = PRODUCTS.filter((p) => matches(p, q.trim())).slice(0, 8);
    list.innerHTML = hits.length
      ? hits.map((p) => `<li><a href="product.html?id=${p.id}"><span class="thumb">${garmentSVG(p, p.colours[0], 'front')}</span><span><b>${esc(p.name)}</b><br><span class="tiny muted">${esc(p.tagline)}</span></span><span class="small">${money(p.price)}</span></a></li>`).join('')
      : '<li class="muted small">Nothing matches that yet. Try "tee" or "git".</li>';
  }

  /* ---------- product cards ---------- */
  function card(p, { quickAdd = true } = {}) {
    const c = p.colours[0];
    const oneSize = p.sizes.length === 1;
    return `
      <article class="card">
        <div class="card-top">
          <a class="card-media" href="product.html?id=${p.id}" aria-label="${esc(p.name)}">
            ${p.isNew ? '<span class="badge">New</span>' : ''}
            <span class="img front">${productImage(p, c, 'front')}</span>
            <span class="img back" aria-hidden="true">${productImage(p, c, 'back')}</span>
          </a>
          ${p.type !== 'stickers' ? '<button class="flip-btn" type="button" data-flip aria-label="Show back print">Back</button>' : ''}
        </div>
        <div class="card-body">
          <a class="card-title" href="product.html?id=${p.id}">${esc(p.name)}</a>
          <div class="card-meta"><span>${p.quoteOnly ? 'From ' : ''}${money(p.price)}</span><span class="swatches" aria-label="Colours: ${esc(p.colours.map((x) => x.name).join(', '))}">${p.colours.map((x) => `<span class="sw" style="background:${x.hex}"></span>`).join('')}</span></div>
          ${quickAdd && !p.quoteOnly ? (oneSize
            ? `<button class="btn outline sm quick-add-toggle" type="button" data-quick="${p.id}" data-size="${esc(p.sizes[0])}">Quick add</button>`
            : `<div class="quick-add" role="group" aria-label="Quick add ${esc(p.name)} in size">${p.sizes.map((s) => `<button type="button" data-quick="${p.id}" data-size="${s}">${s}</button>`).join('')}</div>`)
            : p.quoteOnly ? '<a class="btn outline sm quick-add-toggle" href="clubs.html#quote">Get a quote</a>' : ''}
        </div>
      </article>`;
  }

  // Delegated: quick add + flip-to-back on touch.
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) {
      const p = byId(q.dataset.quick);
      bag.add(p.id, p.colours[0].name, q.dataset.size);
      toast(`Added ${esc(p.name)} (${esc(q.dataset.size)}) · <a href="cart.html">View bag</a>`);
      return;
    }
    const f = e.target.closest('[data-flip]');
    if (f) {
      const media = f.closest('.card').querySelector('.card-media');
      const on = media.classList.toggle('show-back');
      f.textContent = on ? 'Front' : 'Back';
      f.setAttribute('aria-label', on ? 'Show front' : 'Show back print');
    }
  });

  /* ---------- forms ---------- */
  async function postForm(type, data) {
    if (!C.formEndpoint) return false;
    const res = await fetch(C.formEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ form: type, page: location.pathname, ...data })
    });
    if (!res.ok) throw new Error(`Form endpoint returned ${res.status}`);
    return true;
  }

  function setStatus(form, msg, ok = true) {
    const s = $('.form-status', form);
    if (!s) return;
    s.innerHTML = msg;
    s.className = `form-status show ${ok ? 'ok' : 'err'}`;
  }

  function validate(form) {
    let first = null;
    $$('[required]', form).forEach((el) => {
      const bad = !el.value.trim() || (el.type === 'tel' && el.value.replace(/\D/g, '').length < 9) || (el.type === 'email' && el.value && !/^\S+@\S+\.\S+$/.test(el.value));
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  function wireForms() {
    $$('form[data-form]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate(form)) { setStatus(form, 'Please fill in the highlighted fields.', false); return; }
        const type = form.dataset.form;
        const data = Object.fromEntries(new FormData(form).entries());
        const btn = $('button[type="submit"]', form);
        btn.disabled = true;

        let message;
        if (type === 'club') {
          track('club_form_submit', { pieces: Number(data.pieces) || 0, garment: data.garment || '' });
          track('generate_lead', { form: 'club' });
          message = `Hi ${C.brand}, I'd like a club quote.\n\nClub/company: ${data.club}\nContact: ${data.name || '-'}\nPieces: ${data.pieces}\nItem: ${data.garment || 'Tees'}\nWhatsApp: ${data.whatsapp}${data.email ? `\nEmail: ${data.email}` : ''}${data.notes ? `\nNotes: ${data.notes}` : ''}`;
        } else if (type === 'contact') {
          message = `Hi ${C.brand}, ${data.message}\n\nFrom: ${data.name}${data.contact ? ` (${data.contact})` : ''}`;
        } else {
          track('sign_up', { method: /@/.test(data.contact) ? 'email' : 'whatsapp' });
          message = `Hi ${C.brand}, please notify me about the next drop. My contact: ${data.contact}`;
        }

        let sent = false;
        try { sent = await postForm(type, data); } catch (err) { sent = false; }
        const wa = waLink(message);
        const mail = `mailto:${C.email}?subject=${encodeURIComponent(type === 'club' ? `Club quote: ${data.club}` : `${C.brand} website message`)}&body=${encodeURIComponent(message)}`;

        if (type === 'signup' && sent) {
          setStatus(form, "You're on the list. We'll message you when the next drop lands.");
          form.reset();
        } else if (sent) {
          setStatus(form, `Thanks! We've got your ${type === 'club' ? 'quote request' : 'message'} and will reply on WhatsApp. Want a faster answer? <a href="${wa}" target="_blank" rel="noopener">Message us on WhatsApp</a>.`);
          form.reset();
        } else {
          setStatus(form, `Almost done: send it to us on <a href="${wa}" target="_blank" rel="noopener"><b>WhatsApp</b></a> or by <a href="${mail}"><b>email</b></a>. We reply fastest on WhatsApp.`);
          window.open(wa, '_blank', 'noopener');
        }
        btn.disabled = false;
      });
    });
  }

  function clubFormHTML(id = 'quote', dark = true) {
    return `
      <form class="form" data-form="club" id="${id}-form" novalidate>
        <label>Club or company name<input name="club" type="text" autocomplete="organization" required></label>
        <div class="form-row two">
          <label>Approx. number of pieces<input name="pieces" type="number" min="10" inputmode="numeric" placeholder="10+" required></label>
          <label>What do you need? <span class="opt">(optional)</span>
            <select name="garment"><option>Tees</option><option>Hoodies</option><option>Caps</option><option>Mix of items</option></select></label>
        </div>
        <div class="form-row two">
          <label>WhatsApp number<input name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="024 000 0000" required></label>
          <label>Email <span class="opt">(optional)</span><input name="email" type="email" autocomplete="email"></label>
        </div>
        <label>Anything else? <span class="opt">(optional)</span><textarea name="notes" placeholder="Colours, deadline, event date, where to send artwork"></textarea></label>
        <button class="btn ${dark ? 'accent' : ''} block" type="submit">Request a quote</button>
        <p class="form-note">No online price for custom orders. We reply on WhatsApp with a quote, usually within a day.</p>
        <p class="form-status" role="status"></p>
      </form>`;
  }

  /* ---------- pages ---------- */
  const pages = {
    home() {
      // Hero rotation: current drop + club offer. Pauses on interaction.
      const track_ = $('.hero-track');
      const dots = $$('.hero-dots button');
      let idx = 0;
      let timer;
      const go = (i) => { idx = i; track_.scrollTo({ left: track_.clientWidth * i, behavior: 'smooth' }); };
      const sync = () => { idx = Math.round(track_.scrollLeft / track_.clientWidth); dots.forEach((d, i) => d.setAttribute('aria-current', i === idx ? 'true' : 'false')); };
      track_.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
      dots.forEach((d, i) => d.addEventListener('click', () => { stop(); go(i); }));
      const start = () => { if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go((idx + 1) % dots.length), 6000); };
      const stop = () => clearInterval(timer);
      ['pointerdown', 'focusin'].forEach((ev) => track_.addEventListener(ev, stop));
      start();
      const heroProduct = byId('git-brain-tee');
      $('#hero-art').innerHTML = garmentSVG(heroProduct, heroProduct.colours[0], 'back');

      $('#stack-tiles').innerHTML = STACKS.map((s) => `<a class="stack-tile" href="shop.html?stack=${s.id}"><span class="glyph">${esc(s.glyph)}</span>${esc(s.name)}</a>`).join('');
      $('#cat-row').innerHTML = CATEGORIES.map((c) => `<a class="chip" href="shop.html?category=${c.id}">${esc(c.name)}</a>`).join('');
      $('#new-in').innerHTML = PRODUCTS.filter((p) => p.isNew).map((p) => card(p)).join('');
      $('#home-quote').innerHTML = clubFormHTML('home-quote');
      renderWall($('#wall'));
    },

    shop() {
      const state = {
        stack: params.get('stack') || '',
        category: params.get('category') || '',
        colour: params.get('colour') || '',
        q: params.get('q') || '',
        sort: params.get('sort') || 'featured'
      };
      const PAGE = 8;
      let shown = PAGE;
      const grid = $('#grid');
      const sentinel = $('#sentinel');

      const stackRow = $('#stack-filter');
      stackRow.innerHTML = `<button class="chip" type="button" data-stack="">All stacks</button>` + STACKS.map((s) => `<button class="chip" type="button" data-stack="${s.id}">${esc(s.name)}</button>`).join('');
      const catRow = $('#cat-filter');
      catRow.innerHTML = `<button class="chip" type="button" data-category="">All</button>` + CATEGORIES.map((c) => `<button class="chip" type="button" data-category="${c.id}">${esc(c.name)}</button>`).join('');
      const colours = [...new Map(PRODUCTS.flatMap((p) => p.colours).map((c) => [c.name, c])).values()];
      $('#colour-filter').innerHTML = colours.map((c) => `<button type="button" data-colour="${esc(c.name)}" style="background:${c.hex}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join('');
      const sortSel = $('#sort');

      function results() {
        let list = PRODUCTS.filter((p) =>
          (!state.stack || p.stacks.includes(state.stack)) &&
          (!state.category || p.category === state.category) &&
          (!state.colour || p.colours.some((c) => c.name === state.colour)) &&
          matches(p, state.q));
        if (state.sort === 'price-asc') list = [...list].sort((a, b) => a.price - b.price);
        if (state.sort === 'price-desc') list = [...list].sort((a, b) => b.price - a.price);
        if (state.sort === 'new') list = [...list].sort((a, b) => b.isNew - a.isNew);
        return list;
      }

      function render() {
        const list = results();
        const stack = STACKS.find((s) => s.id === state.stack);
        const cat = CATEGORIES.find((c) => c.id === state.category);
        const title = state.q ? `Results for "${state.q}"` : stack ? stack.name : cat ? cat.name : 'Shop everything';
        $('#shop-title').textContent = title;
        document.title = `${title} | ${C.brand}`;
        $('#shop-line').textContent = LINES[state.stack || state.category || 'all'] || LINES.all;
        $('#count').textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;
        grid.innerHTML = list.length ? list.slice(0, shown).map((p) => card(p)).join('') : '<p class="empty" style="grid-column:1/-1">Nothing here yet. <a href="shop.html">See everything</a>.</p>';
        sentinel.hidden = shown >= list.length;
        $$('[data-stack]', stackRow).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stack === state.stack)));
        $$('[data-category]', catRow).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === state.category)));
        $$('#colour-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.colour === state.colour)));
        sortSel.value = state.sort;
        $('#clear-q').hidden = !state.q;
      }

      function update(patch) {
        Object.assign(state, patch);
        shown = PAGE;
        const qs = new URLSearchParams(Object.entries(state).filter(([k, v]) => v && !(k === 'sort' && v === 'featured')));
        history.replaceState(null, '', `shop.html${qs.toString() ? `?${qs}` : ''}`);
        render();
      }

      stackRow.addEventListener('click', (e) => { const b = e.target.closest('[data-stack]'); if (b) update({ stack: b.dataset.stack }); });
      catRow.addEventListener('click', (e) => { const b = e.target.closest('[data-category]'); if (b) update({ category: b.dataset.category }); });
      $('#colour-filter').addEventListener('click', (e) => { const b = e.target.closest('[data-colour]'); if (b) update({ colour: state.colour === b.dataset.colour ? '' : b.dataset.colour }); });
      sortSel.addEventListener('change', () => update({ sort: sortSel.value }));
      $('#clear-q').addEventListener('click', () => update({ q: '' }));

      // Infinite scroll.
      new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !sentinel.hidden) { shown += PAGE; render(); }
      }, { rootMargin: '400px' }).observe(sentinel);

      render();
    },

    product() {
      const p = byId(params.get('id')) || PRODUCTS[0];
      let colour = p.colours.find((c) => c.name === params.get('colour')) || p.colours[0];
      let size = p.sizes.length === 1 ? p.sizes[0] : '';
      document.title = `${p.name} | ${C.brand}`;
      const meta = $('meta[name="description"]');
      if (meta) meta.setAttribute('content', `${p.name}: ${p.tagline}`);

      const views = p.type === 'stickers' ? [['front', 'Pack']] : p.type === 'cap'
        ? [['front', 'Front'], ['back', 'Back']]
        : [['front', 'Front'], ['back', 'Back print'], ['print', 'Close-up print']];

      function gallery() {
        $('#gallery-track').innerHTML = views.map(([v, label]) => `<div class="gallery-slide">${productImage(p, colour, v)}<span class="cap">${label}</span></div>`).join('') +
          (p.images && p.images.person ? `<div class="gallery-slide">${productImage(p, colour, 'person')}<span class="cap">On body</span></div>`
            : '<div class="gallery-slide person"><span>On-body photo coming soon.<br>Tag us wearing it and you could be here.</span><span class="cap">On body</span></div>');
        const n = views.length + 1;
        $('#gallery-dots').innerHTML = Array.from({ length: n }, (_, i) => `<button type="button" aria-label="Image ${i + 1} of ${n}" aria-current="${i === 0}"></button>`).join('');
      }
      const track_ = $('#gallery-track');
      track_.addEventListener('scroll', () => requestAnimationFrame(() => {
        const i = Math.round(track_.scrollLeft / track_.clientWidth);
        $$('#gallery-dots button').forEach((d, j) => d.setAttribute('aria-current', String(i === j)));
      }), { passive: true });
      $('#gallery-dots').addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const i = $$('#gallery-dots button').indexOf(b);
        track_.scrollTo({ left: track_.clientWidth * i, behavior: 'smooth' });
      });

      $('#p-name').textContent = p.name;
      $('#p-price').textContent = (p.quoteOnly ? 'From ' : '') + money(p.price) + (p.quoteOnly ? ' per piece' : '');
      $('#p-tag').textContent = p.tagline;
      $('#crumb').innerHTML = `<a href="shop.html">Shop</a> / <a href="shop.html?category=${p.category}">${esc((CATEGORIES.find((c) => c.id === p.category) || {}).name || '')}</a>`;

      const colourOpts = $('#colour-opts');
      colourOpts.innerHTML = p.colours.map((c) => `<button type="button" data-c="${esc(c.name)}" style="background:${c.hex}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join('');
      const sizeOpts = $('#size-opts');
      sizeOpts.innerHTML = p.sizes.map((s) => `<button type="button" data-s="${esc(s)}">${esc(s)}</button>`).join('');
      if (p.sizes.length === 1) $('#size-guide-link').hidden = true;

      function sync() {
        $('#colour-name').textContent = colour.name;
        $('#size-name').textContent = size || 'Pick a size';
        $$('button', colourOpts).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === colour.name)));
        $$('button', sizeOpts).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === size)));
        $('#sb-name').textContent = p.name;
        $('#sb-meta').textContent = `${money(p.price)} · ${colour.name}${size ? ` · ${size}` : ''}`;
      }
      colourOpts.addEventListener('click', (e) => { const b = e.target.closest('[data-c]'); if (!b) return; colour = p.colours.find((c) => c.name === b.dataset.c); gallery(); sync(); });
      sizeOpts.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; size = b.dataset.s; sizeOpts.classList.remove('needs-size'); sync(); });

      const addButtons = $$('[data-add]');
      if (p.quoteOnly) {
        addButtons.forEach((b) => { b.outerHTML = '<a class="btn block" href="clubs.html#quote">Request a club quote</a>'; });
      } else {
        addButtons.forEach((b) => b.addEventListener('click', () => {
          if (!size) {
            sizeOpts.classList.add('needs-size');
            $('#size-name').textContent = 'Pick a size first';
            sizeOpts.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sizeOpts.querySelector('button').focus({ preventScroll: true });
            return;
          }
          bag.add(p.id, colour.name, size);
          toast(`Added to bag · <a href="cart.html">Checkout</a>`);
        }));
      }

      $('#p-desc').innerHTML = `<p>${esc(p.description)}</p><ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
      $('#p-back').textContent = `Back print: "${p.back}"`;

      const rec = PRODUCTS.filter((x) => x.id !== p.id && !x.quoteOnly)
        .map((x) => ({ x, score: (x.category !== p.category ? 2 : 0) + x.stacks.filter((s) => p.stacks.includes(s)).length }))
        .sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.x);
      $('#wear-with').innerHTML = rec.map((x) => card(x)).join('');

      document.body.classList.add('has-sticky-buy');
      gallery();
      sync();
    },

    cart() {
      const steps = $$('.steps li');
      const panels = { bag: $('#step-bag'), details: $('#step-details'), pay: $('#step-pay'), done: $('#step-done') };
      const details = store('craf7ton_details') || {};
      let current = 'bag';

      function delivery() {
        if (!bag.count()) return 0;
        if (bag.count() >= C.delivery.freeDeliveryPieces) return 0;
        return details.method === 'courier' ? C.delivery.courierFee : 0;
      }

      function summary() {
        const sub = bag.subtotal();
        const del = delivery();
        const delLabel = !details.method ? 'Calculated next' : del === 0 ? 'Free' : money(del);
        $('#summary').innerHTML = `
          <h2 style="font-size:18px;margin:0 0 4px">Order summary</h2>
          <div class="row"><span>Items (${bag.count()})</span><span>${money(sub)}</span></div>
          <div class="row"><span>Delivery</span><span>${delLabel}</span></div>
          <div class="row total"><span>Total</span><span>${money(sub + del)}</span></div>
          ${bag.count() >= C.delivery.freeDeliveryPieces ? '<p class="tiny" style="margin:0;color:var(--ok)">Free delivery unlocked (10+ pieces).</p>' : `<p class="tiny muted" style="margin:0">Free delivery on ${C.delivery.freeDeliveryPieces}+ pieces. Campus pickup is always free.</p>`}`;
      }

      function show(step) {
        current = step;
        const order = ['bag', 'details', 'pay'];
        const at = order.indexOf(step);
        steps.forEach((li, i) => { li.classList.toggle('on', i === at); li.classList.toggle('done', at > i || step === 'done'); li.toggleAttribute('aria-current', i === at); });
        Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== step; });
        $('#summary').hidden = step === 'done';
        summary();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function renderBag() {
        const items = bag.items();
        if (!items.length) {
          $('#line-items').innerHTML = '';
          $('#bag-empty').hidden = false;
          $('#to-details').hidden = true;
          summary();
          return;
        }
        $('#bag-empty').hidden = true;
        $('#to-details').hidden = false;
        $('#line-items').innerHTML = items.map((i, idx) => {
          const p = byId(i.id);
          const col = p.colours.find((c) => c.name === i.colour) || p.colours[0];
          return `<li class="line-item">
            <a class="thumb" href="product.html?id=${p.id}&colour=${encodeURIComponent(col.name)}" aria-hidden="true" tabindex="-1">${garmentSVG(p, col, 'front')}</a>
            <div>
              <h3><a href="product.html?id=${p.id}">${esc(p.name)}</a></h3>
              <div class="small muted">${esc(i.colour)} · ${esc(i.size)}</div>
              <div class="li-row">
                <div class="qty" role="group" aria-label="Quantity">
                  <button type="button" data-q="${idx}" data-d="-1" aria-label="Decrease quantity">−</button><span>${i.qty}</span><button type="button" data-q="${idx}" data-d="1" aria-label="Increase quantity">+</button>
                </div>
                <b>${money(p.price * i.qty)}</b>
              </div>
              <button class="link-btn tiny muted" type="button" data-remove="${idx}" style="margin-top:6px">Remove</button>
            </div></li>`;
        }).join('');
        summary();
      }

      $('#line-items').addEventListener('click', (e) => {
        const q = e.target.closest('[data-q]');
        const r = e.target.closest('[data-remove]');
        if (q) { const i = +q.dataset.q; bag.setQty(i, bag.items()[i].qty + +q.dataset.d); renderBag(); }
        if (r) { bag.setQty(+r.dataset.remove, 0); renderBag(); }
      });

      $('#to-details').addEventListener('click', () => {
        track('begin_checkout', { currency: C.currency, value: bag.subtotal(), items: bag.items().map((i) => ({ item_id: i.id, quantity: i.qty, item_variant: `${i.colour} / ${i.size}` })) });
        show('details');
      });

      // Details step.
      const df = $('#details-form');
      $('#campus').innerHTML = C.delivery.campuses.map((c) => `<option>${esc(c)}</option>`).join('');
      $('#courier-fee').textContent = money(C.delivery.courierFee);
      Object.entries(details).forEach(([k, v]) => {
        const el = df.elements[k];
        if (!el) return;
        if (el instanceof RadioNodeList) { $$(`[name="${k}"]`, df).forEach((r) => { r.checked = r.value === v; }); } else el.value = v;
      });
      function methodUI() {
        const m = (df.elements.method.value || 'pickup');
        $('#pickup-fields').hidden = m !== 'pickup';
        $('#courier-fields').hidden = m !== 'courier';
        $$('#courier-fields [data-req]').forEach((el) => { el.required = m === 'courier'; });
        $('#campus').required = m === 'pickup';
        details.method = m;
        summary();
      }
      if (!details.method) df.elements.method.value = 'pickup';
      df.addEventListener('change', (e) => { if (e.target.name === 'method') methodUI(); });
      methodUI();
      df.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validate(df)) { setStatus(df, 'Please fill in the highlighted fields.', false); return; }
        Object.assign(details, Object.fromEntries(new FormData(df).entries()));
        store('craf7ton_details', details);
        $('#momo-number').value = $('#momo-number').value || details.phone || '';
        show('pay');
      });
      $$('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));

      // Pay step: Mobile Money first, card second.
      const pf = $('#pay-form');
      function payUI() {
        const m = pf.elements.pay.value;
        $('#momo-fields').hidden = m !== 'momo';
        $('#momo-number').required = m === 'momo';
      }
      pf.addEventListener('change', payUI);
      payUI();
      $('#pay-mode-note').hidden = !!C.paystackPublicKey;

      function orderText(ref, pay) {
        const lines = bag.items().map((i) => { const p = byId(i.id); return `• ${p.name} (${i.colour}, ${i.size}) x${i.qty} = ${money(p.price * i.qty)}`; }).join('\n');
        const where = details.method === 'courier' ? `Courier to: ${details.address}, ${details.city}` : `Campus pickup: ${details.campus}`;
        return `New order ${ref}\n\n${lines}\n\nDelivery: ${money(delivery())}\nTotal: ${money(bag.subtotal() + delivery())}\n\nName: ${details.name}\nPhone: ${details.phone}${details.email ? `\nEmail: ${details.email}` : ''}\n${where}${details.notes ? `\nNotes: ${details.notes}` : ''}\nPay with: ${pay}\nConfirm by: ${details.updates || 'WhatsApp'}`;
      }

      function finish(ref, payLabel, paid) {
        const total = bag.subtotal() + delivery();
        const text = orderText(ref, payLabel);
        track('purchase', { transaction_id: ref, currency: C.currency, value: total, shipping: delivery(), items: bag.items().map((i) => ({ item_id: i.id, quantity: i.qty, price: byId(i.id).price, item_variant: `${i.colour} / ${i.size}` })) });
        postForm('order', { ref, paid, total, order: text, ...details }).catch(() => {});
        $('#done-ref').textContent = ref;
        $('#done-msg').textContent = paid
          ? `Payment received. We'll confirm by ${details.updates || 'WhatsApp'} when your order is packed.`
          : "Last step: send your order to us on WhatsApp. We'll reply with the Mobile Money number to pay and confirm your order.";
        $('#done-wa').href = waLink(text);
        $('#done-wa').textContent = paid ? 'Chat with us on WhatsApp' : 'Send order on WhatsApp';
        store('craf7ton_last_order', { ref, text, at: Date.now() });
        bag.clear();
        show('done');
      }

      function loadPaystack() {
        return new Promise((resolve, reject) => {
          if (window.PaystackPop) return resolve();
          const s = document.createElement('script');
          s.src = 'https://js.paystack.co/v1/inline.js';
          s.onload = resolve;
          s.onerror = () => reject(new Error('Paystack failed to load'));
          document.head.appendChild(s);
        });
      }

      pf.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!bag.count()) { show('bag'); return; }
        if (!validate(pf)) { setStatus(pf, 'Please fill in the highlighted fields.', false); return; }
        const pay = pf.elements.pay.value;
        const network = pf.elements.network ? pf.elements.network.value : '';
        const payLabel = pay === 'momo' ? `Mobile Money (${network}, ${$('#momo-number').value})` : 'Card';
        const ref = `C7-${Date.now().toString(36).toUpperCase().slice(-6)}`;

        if (!C.paystackPublicKey) { finish(ref, payLabel, false); return; }

        const btn = $('button[type="submit"]', pf);
        btn.disabled = true;
        try {
          await loadPaystack();
          const handler = window.PaystackPop.setup({
            key: C.paystackPublicKey,
            email: details.email || `${details.phone.replace(/\D/g, '')}@customers.craf7ton.com`,
            amount: Math.round((bag.subtotal() + delivery()) * 100),
            currency: 'GHS',
            ref,
            channels: pay === 'momo' ? ['mobile_money'] : ['card'],
            metadata: { custom_fields: [{ display_name: 'Phone', variable_name: 'phone', value: details.phone }, { display_name: 'Delivery', variable_name: 'delivery', value: details.method === 'courier' ? details.address : details.campus }] },
            callback: (res) => finish(res.reference || ref, payLabel, true),
            onClose: () => { btn.disabled = false; setStatus(pf, 'Payment window closed. Your bag is still saved.', false); }
          });
          handler.openIframe();
        } catch (err) {
          btn.disabled = false;
          setStatus(pf, `We couldn't open the payment window. <a href="${waLink(orderText(ref, payLabel))}" target="_blank" rel="noopener">Send your order on WhatsApp</a> and we'll sort payment there.`, false);
        }
      });

      renderBag();
      show('bag');
    },

    clubs() {
      $('#club-quote').innerHTML = clubFormHTML('quote', false);
      $('#club-products').innerHTML = PRODUCTS.filter((p) => p.stacks.includes('campus-clubs') || p.type === 'hoodie' || p.type === 'cap').map((p) => card(p, { quickAdd: false })).join('');
    },

    contact() {
      $('#c-wa').href = waLink(`Hi ${C.brand}, `);
      $('#c-wa-num').textContent = `+${C.whatsapp}`;
      $('#c-mail').href = `mailto:${C.email}`;
      $('#c-mail-addr').textContent = C.email;
      $('#c-ig').href = C.instagram;
      $('#c-tt').href = C.tiktok;
      $$('.c-handle').forEach((el) => { el.textContent = `@${C.socialHandle}`; });
    },

    story() {
      const p = byId('git-brain-tee');
      $('#story-art').innerHTML = garmentSVG(p, p.colours[0], 'back');
    }
  };

  /* Community wall: add real customer photos here (WebP, square, under 80 KB each). */
  const WALL = [
    // { src: 'assets/img/community/ama-umat.webp', alt: 'Ama at UMaT wearing the Git Brain Tee' },
  ];
  function renderWall(el) {
    if (!el) return;
    const items = WALL.slice(0, 6);
    while (items.length < 6) items.push(null);
    el.innerHTML = items.map((w) => w
      ? `<div class="wall-item"><img src="${esc(w.src)}" alt="${esc(w.alt)}" loading="lazy" decoding="async" width="400" height="400"></div>`
      : `<div class="wall-item ph">Your photo here</div>`).join('');
    $$('.c-handle').forEach((h) => { h.textContent = `@${C.socialHandle}`; });
  }

  /* Size guide. TODO: confirm measurements against the actual blanks before launch. */
  const SIZE_TABLE = {
    head: ['Size', 'Chest (cm)', 'Length (cm)', 'Fits chest (in)'],
    rows: [['S', '96', '70', '34–36'], ['M', '104', '72', '38–40'], ['L', '112', '74', '42–44'], ['XL', '120', '76', '46–48'], ['XXL', '128', '78', '50–52']]
  };
  function wireSizeGuide() {
    $$('[data-size-table]').forEach((el) => {
      el.innerHTML = `<table><thead><tr>${SIZE_TABLE.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${SIZE_TABLE.rows.map((r) => `<tr>${r.map((c, i) => i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`).join('')}</tr>`).join('')}</tbody></table>`;
    });
    const dlg = $('#size-guide');
    if (!dlg) return;
    $$('[data-size-guide]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); dlg.showModal(); }));
  }

  /* ---------- boot ---------- */
  renderHeader();
  renderFooter();
  wireChrome();
  if (pages[page]) pages[page]();
  wireForms();
  wireSizeGuide();

  // Expose for debugging and for platform ports.
  window.Craf7ton = { bag, track, garmentSVG };
})();
