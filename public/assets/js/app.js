/* Craf7ton storefront: layout, catalogue, bag, checkout, order tracking, forms and analytics.
 * Data comes from the API (/api/config, /api/products); prices and stock are checked again on the server. */
(function () {
  'use strict';

  const BRAND = 'Craf7ton';
  const CURRENCY = 'GHS';
  const page = document.body.dataset.page;

  // Fallbacks so the header and footer render before (or without) the API.
  let C = {
    announcement: 'Free delivery on club orders over 10 pieces', whatsapp: '', email: '', socialHandle: 'craf7ton',
    instagram: '#', tiktok: '#', onlinePayments: false,
    delivery: { courierFee: 0, freeDeliveryPieces: 10, campuses: [], pickupEnabled: true, courierEnabled: true }
  };
  let PRODUCTS = [];
  let STACKS = [];
  let CATEGORIES = [];
  let LINES = {};

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `${CURRENCY} ${Number(n).toFixed(2).replace(/\.00$/, '')}`;
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const params = new URLSearchParams(location.search);
  const waLink = (text) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(text)}`;
  const productUrl = (p, colour) => `/products/${encodeURIComponent(p.id)}${colour ? `?colour=${encodeURIComponent(colour)}` : ''}`;
  const garmentSVG = (...a) => window.C7Mockup.garmentSVG(...a);

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked: state lives for this page view only */ }
    return value;
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status})`);
      err.status = res.status;
      err.details = data.details;
      throw err;
    }
    return data;
  }

  /* Stock: null means the product isn't stock-tracked (always available). */
  const stockOf = (p, colour, size) => (p.stock ? (p.stock[`${colour}|${size}`] ?? 0) : Infinity);
  const colourInStock = (p, colour) => p.sizes.some((s) => stockOf(p, colour, s) > 0);
  const inStock = (p) => p.colours.some((c) => colourInStock(p, c.name));

  /* ---------- analytics ----------
   * Events: add_to_cart, begin_checkout, purchase, club_form_submit (+ generate_lead, sign_up).
   * Add a GA4 / Meta / Plausible snippet (and allow it in the CSP in vercel.json) and these flow through. */
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
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };

  function productImage(p, colour, view, { eager = false } = {}) {
    if (p.images && p.images[view]) {
      return `<img src="${esc(p.images[view])}" alt="${esc(`${p.name}, ${view}`)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" width="800" height="1000">`;
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
    qtyOf: (id, colour, size) => memBag.filter((i) => i.id === id && i.colour === colour && i.size === size).reduce((n, i) => n + i.qty, 0),
    add(id, colour, size, qty = 1) {
      const p = byId(id);
      const left = stockOf(p, colour, size) - this.qtyOf(id, colour, size);
      if (left < qty) {
        toast(left > 0 ? `Only ${left} more available in ${esc(size)}` : `No more ${esc(colour)} / ${esc(size)} in stock`);
        return false;
      }
      const hit = memBag.find((i) => i.id === id && i.colour === colour && i.size === size);
      if (hit) hit.qty += qty; else memBag.push({ id, colour, size, qty });
      this.save();
      track('add_to_cart', { currency: CURRENCY, value: p.price * qty, items: [{ item_id: id, item_name: p.name, item_variant: `${colour} / ${size}`, price: p.price, quantity: qty }] });
      return true;
    },
    setQty(idx, qty) { if (qty < 1) memBag.splice(idx, 1); else memBag[idx].qty = qty; this.save(); },
    clear() { memBag = []; this.save(); },
    subtotal: () => memBag.reduce((s, i) => s + (byId(i.id) ? byId(i.id).price * i.qty : 0), 0),
    /* Drop lines that no longer exist and cap quantities at current stock. Returns notes for the shopper. */
    reconcile() {
      const notes = [];
      memBag = memBag.filter((i) => {
        const p = byId(i.id);
        if (!p || p.quoteOnly || !p.colours.some((c) => c.name === i.colour) || !p.sizes.includes(i.size)) {
          notes.push(`${p ? p.name : 'An item'} is no longer available and was removed.`);
          return false;
        }
        const left = stockOf(p, i.colour, i.size);
        if (left <= 0) { notes.push(`${p.name} (${i.colour}, ${i.size}) sold out and was removed.`); return false; }
        if (i.qty > left) { notes.push(`Only ${left} of ${p.name} (${i.colour}, ${i.size}) left, so we updated your bag.`); i.qty = left; }
        return true;
      });
      this.save();
      return notes;
    }
  };

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
    { href: '/shop', label: 'Shop', key: 'shop' },
    { href: '/clubs', label: 'Clubs', key: 'clubs' },
    { href: '/story', label: 'Story', key: 'story' },
    { href: '/contact', label: 'Help', key: 'contact' }
  ];

  function renderHeader() {
    const el = $('#site-header');
    if (!el) return;
    el.outerHTML = `
      <a class="skip-link" href="#main">Skip to content</a>
      <div class="announce"><span id="announce-text">${esc(C.announcement)}</span> · <a href="/clubs">Get a quote</a></div>
      <header class="site-header">
        <div class="wrap header-row">
          <div class="header-left">
            <button class="icon-btn menu-btn" type="button" data-open-menu aria-label="Open menu">${I.menu}</button>
            <a class="logo-link" href="/" aria-label="${BRAND} home"><img src="/assets/img/logo.svg" alt="${BRAND}" width="120" height="30"></a>
          </div>
          <nav class="desktop-nav" aria-label="Main">
            ${NAV.map((n) => `<a href="${n.href}"${page === n.key ? ' aria-current="page"' : ''}>${n.label}</a>`).join('')}
          </nav>
          <div class="header-right">
            <button class="icon-btn" type="button" data-open-search aria-label="Search">${I.search}</button>
            <a class="icon-btn" href="/cart" data-bag-label>${I.bag}<span class="bag-count" data-n="0">0</span></a>
          </div>
        </div>
      </header>
      <dialog class="drawer" id="menu" aria-label="Menu">
        <div class="drawer-inner">
          <div class="drawer-top"><img src="/assets/img/logo.svg" alt="${BRAND}" width="110" height="28"><button class="icon-btn" type="button" data-close aria-label="Close menu">${I.close}</button></div>
          <div><h3>Shop by stack</h3><ul id="menu-stacks"></ul></div>
          <div><h3>Shop by category</h3><ul id="menu-cats"><li><a href="/shop">Everything</a></li></ul></div>
          <div><h3>${BRAND}</h3><ul><li><a href="/clubs">Custom for your club</a></li><li><a href="/story">Our story</a></li><li><a href="/size-guide">Size guide</a></li><li><a href="/delivery-returns">Delivery and returns</a></li><li><a href="/contact">Contact</a></li></ul></div>
        </div>
      </dialog>
      <dialog class="modal" id="search" aria-label="Search">
        <div class="modal-inner">
          <div class="modal-top"><h2>Search</h2><button class="icon-btn" type="button" data-close aria-label="Close search">${I.close}</button></div>
          <form class="search-field" role="search" action="/shop">
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
            <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            <button class="btn" type="submit">Notify me</button>
            <p class="form-status" role="status" style="flex-basis:100%"></p>
          </form>
        </div>
      </section>
      <footer class="site-footer">
        <div class="wrap">
          <div class="footer-cols">
            <div><h3>Shop</h3><ul id="footer-cats"><li><a href="/shop">Everything</a></li></ul></div>
            <div><h3>Clubs</h3><ul><li><a href="/clubs">Custom orders</a></li><li><a href="/clubs#quote">Request a quote</a></li><li><a href="/shop?stack=campus-clubs">Campus clubs</a></li></ul></div>
            <div><h3>Story</h3><ul><li><a href="/story">Why ${BRAND}</a></li><li><a data-social="instagram" href="#" rel="noopener">Instagram</a></li><li><a data-social="tiktok" href="#" rel="noopener">TikTok</a></li></ul></div>
            <div><h3>Help</h3><ul><li><a href="/delivery-returns">Delivery info</a></li><li><a href="/size-guide">Size guide</a></li><li><a href="/delivery-returns#returns">Returns</a></li><li><a href="/contact">Contact</a></li></ul></div>
          </div>
          <div class="footer-bottom">
            <img src="/assets/img/logo.svg" alt="${BRAND}" width="104" height="26">
            <span>© ${new Date().getFullYear()} ${BRAND}. Made in Ghana for builders everywhere.</span>
          </div>
        </div>
      </footer>
      <nav class="tabbar" aria-label="Quick links">
        ${tab('/', 'home', I.home, 'Home')}
        ${tab('/shop', 'shop', I.shop, 'Shop')}
        <button type="button" data-open-search>${I.search}<span>Search</span></button>
        <a href="/cart"${page === 'cart' ? ' aria-current="page"' : ''} data-bag-label>${I.bag}<span>Bag</span><span class="bag-count" data-n="0">0</span></a>
      </nav>`;
  }

  /* Fill the parts of the chrome that depend on server data. */
  function hydrateChrome() {
    $('#announce-text').textContent = C.announcement;
    $('#menu-stacks').innerHTML = STACKS.map((s) => `<li><a href="/shop?stack=${s.id}">${esc(s.name)}</a></li>`).join('');
    $('#menu-cats').innerHTML = '<li><a href="/shop">Everything</a></li>' + CATEGORIES.map((c) => `<li><a href="/shop?category=${c.id}">${esc(c.name)}</a></li>`).join('');
    $('#footer-cats').innerHTML = '<li><a href="/shop">Everything</a></li>' + CATEGORIES.map((c) => `<li><a href="/shop?category=${c.id}">${esc(c.name)}</a></li>`).join('');
    $$('[data-social]').forEach((a) => { a.href = C[a.dataset.social] || '#'; });
    $$('.c-handle').forEach((h) => { h.textContent = `@${C.socialHandle}`; });
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
    if (!PRODUCTS.length) { list.innerHTML = '<li class="muted small">Loading products…</li>'; return; }
    const hits = PRODUCTS.filter((p) => matches(p, q.trim())).slice(0, 8);
    list.innerHTML = hits.length
      ? hits.map((p) => `<li><a href="${productUrl(p)}"><span class="thumb">${productImage(p, p.colours[0], 'front')}</span><span><b>${esc(p.name)}</b><br><span class="tiny muted">${esc(p.tagline)}</span></span><span class="small">${money(p.price)}</span></a></li>`).join('')
      : '<li class="muted small">Nothing matches that yet. Try "tee" or "git".</li>';
  }

  /* ---------- product cards ---------- */
  function card(p, { quickAdd = true } = {}) {
    const c = p.colours.find((x) => colourInStock(p, x.name)) || p.colours[0];
    const soldOut = !p.quoteOnly && !inStock(p);
    let actions = '';
    if (p.quoteOnly) actions = '<a class="btn outline sm quick-add-toggle" href="/clubs#quote">Get a quote</a>';
    else if (soldOut) actions = '<span class="tiny muted" style="margin-top:6px">Sold out. <a href="#signup-h">Get notified</a></span>';
    else if (quickAdd && p.sizes.length === 1) actions = `<button class="btn outline sm quick-add-toggle" type="button" data-quick="${esc(p.id)}" data-colour="${esc(c.name)}" data-size="${esc(p.sizes[0])}">Quick add</button>`;
    else if (quickAdd) {
      actions = `<div class="quick-add" role="group" aria-label="Quick add ${esc(p.name)} in ${esc(c.name)}, size">${p.sizes.map((s) => {
        const out = stockOf(p, c.name, s) <= 0;
        return `<button type="button" data-quick="${esc(p.id)}" data-colour="${esc(c.name)}" data-size="${esc(s)}"${out ? ' disabled aria-label="' + esc(s) + ' sold out"' : ''}>${esc(s)}</button>`;
      }).join('')}</div>`;
    }
    return `
      <article class="card${soldOut ? ' sold-out' : ''}">
        <div class="card-top">
          <a class="card-media" href="${productUrl(p, c.name)}" aria-label="${esc(p.name)}">
            ${soldOut ? '<span class="badge dark">Sold out</span>' : p.isNew ? '<span class="badge">New</span>' : ''}
            <span class="img front">${productImage(p, c, 'front')}</span>
            <span class="img back" aria-hidden="true">${productImage(p, c, 'back')}</span>
          </a>
          ${p.type !== 'stickers' ? '<button class="flip-btn" type="button" data-flip aria-label="Show back print">Back</button>' : ''}
        </div>
        <div class="card-body">
          <a class="card-title" href="${productUrl(p, c.name)}">${esc(p.name)}</a>
          <div class="card-meta"><span>${p.quoteOnly ? 'From ' : ''}${money(p.price)}</span><span class="swatches" aria-label="Colours: ${esc(p.colours.map((x) => x.name).join(', '))}">${p.colours.map((x) => `<span class="sw" style="background:${esc(x.hex)}"></span>`).join('')}</span></div>
          ${actions}
        </div>
      </article>`;
  }

  // Delegated: quick add + flip-to-back on touch.
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) {
      const p = byId(q.dataset.quick);
      if (p && bag.add(p.id, q.dataset.colour, q.dataset.size)) toast(`Added ${esc(p.name)} (${esc(q.dataset.size)}) · <a href="/cart">View bag</a>`);
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
  function setStatus(form, msg, ok = true) {
    const s = $('.form-status', form);
    if (!s) return;
    s.innerHTML = msg;
    s.className = `form-status show ${ok ? 'ok' : 'err'}`;
  }

  function validate(form) {
    let first = null;
    $$('[required]', form).forEach((el) => {
      if (el.closest('[hidden]')) return;
      const v = el.value.trim();
      const bad = !v || (el.type === 'tel' && v.replace(/\D/g, '').length < 9) || (el.type === 'email' && v && !/^\S+@\S+\.\S+$/.test(v)) || (el.type === 'number' && el.min && Number(v) < Number(el.min));
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  function markServerError(form, err) {
    const field = err.details && err.details.field;
    if (!field) return;
    const map = { 'Club or company name': 'club', 'WhatsApp number': 'whatsapp', 'Number of pieces': 'pieces', Phone: 'phone', Name: 'name', Email: 'email', email: 'email', 'Town / city': 'city', Address: 'address' };
    const el = form.elements[map[field] || field];
    if (el && el.setAttribute) { el.setAttribute('aria-invalid', 'true'); el.focus(); }
  }

  const FORM_ENDPOINTS = { club: '/api/quotes', contact: '/api/messages', signup: '/api/subscribe' };

  function wireForms() {
    $$('form[data-form]').forEach((form) => {
      if (form.dataset.wired) return;
      form.dataset.wired = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validate(form)) { setStatus(form, 'Please fill in the highlighted fields.', false); return; }
        const type = form.dataset.form;
        const data = Object.fromEntries(new FormData(form).entries());
        const btn = $('button[type="submit"]', form);
        btn.disabled = true;

        let message;
        if (type === 'club') message = `Hi ${BRAND}, I'd like a club quote.\n\nClub/company: ${data.club}\nPieces: ${data.pieces}\nItem: ${data.garment || 'Tees'}${data.notes ? `\nNotes: ${data.notes}` : ''}`;
        else if (type === 'contact') message = `Hi ${BRAND}, ${data.message}\n\nFrom: ${data.name}`;
        else message = `Hi ${BRAND}, please notify me about the next drop.`;

        try {
          await api(FORM_ENDPOINTS[type], { method: 'POST', body: data });
          if (type === 'club') { track('club_form_submit', { pieces: Number(data.pieces) || 0, garment: data.garment || '' }); track('generate_lead', { form: 'club' }); }
          if (type === 'signup') track('sign_up', { method: /@/.test(data.contact) ? 'email' : 'whatsapp' });
          const msgs = {
            club: `Thanks! Your quote request is in. We'll reply on WhatsApp, usually within a day. Want to send artwork now? <a href="${waLink(message)}" target="_blank" rel="noopener">Message us on WhatsApp</a>.`,
            contact: "Thanks! We've got your message and will reply soon.",
            signup: "You're on the list. We'll message you when the next drop lands."
          };
          setStatus(form, msgs[type]);
          form.reset();
        } catch (err) {
          markServerError(form, err);
          const fallback = err.status && err.status < 500 ? '' : ` You can also <a href="${waLink(message)}" target="_blank" rel="noopener">message us on WhatsApp</a>.`;
          setStatus(form, `${esc(err.message)}${fallback}`, false);
        }
        btn.disabled = false;
      });
    });
  }

  function clubFormHTML(id = 'quote', dark = true) {
    return `
      <form class="form" data-form="club" id="${id}-form" novalidate>
        <label>Club or company name<input name="club" type="text" autocomplete="organization" required></label>
        <label>Your name <span class="opt">(optional)</span><input name="name" type="text" autocomplete="name"></label>
        <div class="form-row two">
          <label>Approx. number of pieces<input name="pieces" type="number" min="1" inputmode="numeric" placeholder="10+" required></label>
          <label>What do you need? <span class="opt">(optional)</span>
            <select name="garment"><option>Tees</option><option>Hoodies</option><option>Caps</option><option>Mix of items</option></select></label>
        </div>
        <div class="form-row two">
          <label>WhatsApp number<input name="whatsapp" type="tel" autocomplete="tel" inputmode="tel" placeholder="024 000 0000" required></label>
          <label>Email <span class="opt">(optional)</span><input name="email" type="email" autocomplete="email"></label>
        </div>
        <label>Anything else? <span class="opt">(optional)</span><textarea name="notes" placeholder="Colours, deadline, event date, where to send artwork"></textarea></label>
        <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
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
      const stop = () => clearInterval(timer);
      track_.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
      dots.forEach((d, i) => d.addEventListener('click', () => { stop(); go(i); }));
      ['pointerdown', 'focusin'].forEach((ev) => track_.addEventListener(ev, stop));
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) timer = setInterval(() => go((idx + 1) % dots.length), 6000);

      const heroProduct = byId('git-brain-tee') || PRODUCTS[0];
      if (heroProduct) $('#hero-art').innerHTML = productImage(heroProduct, heroProduct.colours[0], 'back', { eager: true });

      $('#stack-tiles').innerHTML = STACKS.map((s) => `<a class="stack-tile" href="/shop?stack=${s.id}"><span class="glyph">${esc(s.glyph)}</span>${esc(s.name)}</a>`).join('');
      $('#cat-row').innerHTML = CATEGORIES.map((c) => `<a class="chip" href="/shop?category=${c.id}">${esc(c.name)}</a>`).join('');
      const fresh = PRODUCTS.filter((p) => p.isNew);
      $('#new-in').innerHTML = (fresh.length ? fresh : PRODUCTS.slice(0, 6)).map((p) => card(p)).join('');
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
      const PAGE = 12;
      let shown = PAGE;
      const grid = $('#grid');
      const sentinel = $('#sentinel');

      const stackRow = $('#stack-filter');
      stackRow.innerHTML = '<button class="chip" type="button" data-stack="">All stacks</button>' + STACKS.map((s) => `<button class="chip" type="button" data-stack="${s.id}">${esc(s.name)}</button>`).join('');
      const catRow = $('#cat-filter');
      catRow.innerHTML = '<button class="chip" type="button" data-category="">All</button>' + CATEGORIES.map((c) => `<button class="chip" type="button" data-category="${c.id}">${esc(c.name)}</button>`).join('');
      const colours = [...new Map(PRODUCTS.flatMap((p) => p.colours).map((c) => [c.name, c])).values()];
      $('#colour-filter').innerHTML = colours.map((c) => `<button type="button" data-colour="${esc(c.name)}" style="background:${esc(c.hex)}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join('');
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
        // Sold-out items sink to the bottom.
        return [...list].sort((a, b) => (a.quoteOnly || inStock(a) ? 0 : 1) - (b.quoteOnly || inStock(b) ? 0 : 1));
      }

      function render() {
        const list = results();
        const stack = STACKS.find((s) => s.id === state.stack);
        const cat = CATEGORIES.find((c) => c.id === state.category);
        const title = state.q ? `Results for "${state.q}"` : stack ? stack.name : cat ? cat.name : 'Shop everything';
        $('#shop-title').textContent = title;
        document.title = `${title} | ${BRAND}`;
        $('#shop-line').textContent = LINES[state.stack || state.category || 'all'] || LINES.all || '';
        $('#count').textContent = `${list.length} item${list.length === 1 ? '' : 's'}`;
        grid.innerHTML = list.length ? list.slice(0, shown).map((p) => card(p)).join('') : '<p class="empty" style="grid-column:1/-1">Nothing here yet. <a href="/shop">See everything</a>.</p>';
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
        history.replaceState(null, '', `/shop${qs.toString() ? `?${qs}` : ''}`);
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
      const slug = decodeURIComponent((location.pathname.match(/^\/products\/([^/]+)/) || [])[1] || params.get('id') || '');
      const p = byId(slug);
      if (!p) {
        $('#main').innerHTML = '<div class="wrap empty"><h1>Product not found</h1><p>It may have sold out or moved.</p><a class="btn" href="/shop">Back to shop</a></div>';
        document.title = `Not found | ${BRAND}`;
        return;
      }
      let colour = p.colours.find((c) => c.name === params.get('colour')) || p.colours.find((c) => colourInStock(p, c.name)) || p.colours[0];
      let size = '';
      const pickDefaultSize = () => { size = p.sizes.length === 1 && stockOf(p, colour.name, p.sizes[0]) > 0 ? p.sizes[0] : ''; };
      pickDefaultSize();
      document.title = `${p.name} | ${BRAND}`;

      const views = p.type === 'stickers' ? [['front', 'Pack']] : p.type === 'cap'
        ? [['front', 'Front'], ['back', 'Back']]
        : [['front', 'Front'], ['back', 'Back print'], ['print', 'Close-up print']];

      function gallery() {
        $('#gallery-track').innerHTML = views.map(([v, label], i) => `<div class="gallery-slide">${productImage(p, colour, v, { eager: i === 0 })}<span class="cap">${label}</span></div>`).join('') +
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
      $('#crumb').innerHTML = `<a href="/shop">Shop</a> / <a href="/shop?category=${esc(p.category)}">${esc((CATEGORIES.find((c) => c.id === p.category) || {}).name || '')}</a>`;

      const colourOpts = $('#colour-opts');
      colourOpts.innerHTML = p.colours.map((c) => `<button type="button" data-c="${esc(c.name)}" style="background:${esc(c.hex)}" aria-label="${esc(c.name)}${colourInStock(p, c.name) ? '' : ' (sold out)'}" title="${esc(c.name)}"></button>`).join('');
      const sizeOpts = $('#size-opts');
      if (p.sizes.length === 1 && !p.stock) $('#size-guide-link').hidden = true;

      function sync() {
        $('#colour-name').textContent = colour.name;
        sizeOpts.innerHTML = p.sizes.map((s) => {
          const left = stockOf(p, colour.name, s);
          return `<button type="button" data-s="${esc(s)}" aria-pressed="${s === size}"${left <= 0 ? ` disabled aria-label="${esc(s)}, sold out"` : ''}>${esc(s)}</button>`;
        }).join('');
        const left = size ? stockOf(p, colour.name, size) : Infinity;
        $('#size-name').textContent = size ? (left <= 3 ? `${size} · only ${left} left` : size) : (colourInStock(p, colour.name) ? 'Pick a size' : 'Sold out in this colour');
        $$('button', colourOpts).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.c === colour.name)));
        $('#sb-name').textContent = p.name;
        $('#sb-meta').textContent = `${money(p.price)} · ${colour.name}${size ? ` · ${size}` : ''}`;
        const soldOut = !p.quoteOnly && !colourInStock(p, colour.name);
        $$('[data-add]').forEach((b) => { b.disabled = soldOut; b.textContent = soldOut ? 'Sold out' : 'Add to bag'; });
      }
      colourOpts.addEventListener('click', (e) => {
        const b = e.target.closest('[data-c]'); if (!b) return;
        colour = p.colours.find((c) => c.name === b.dataset.c);
        if (size && stockOf(p, colour.name, size) <= 0) size = '';
        if (!size) pickDefaultSize();
        history.replaceState(null, '', productUrl(p, colour.name));
        gallery(); sync();
      });
      sizeOpts.addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b || b.disabled) return; size = b.dataset.s; sizeOpts.classList.remove('needs-size'); sync(); });

      if (p.quoteOnly) {
        $$('[data-add]').forEach((b) => { b.outerHTML = '<a class="btn block" href="/clubs#quote">Request a club quote</a>'; });
      } else {
        $$('[data-add]').forEach((b) => b.addEventListener('click', () => {
          if (!size) {
            sizeOpts.classList.add('needs-size');
            $('#size-name').textContent = 'Pick a size first';
            sizeOpts.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const first = sizeOpts.querySelector('button:not([disabled])');
            if (first) first.focus({ preventScroll: true });
            return;
          }
          if (bag.add(p.id, colour.name, size)) toast('Added to bag · <a href="/cart">Checkout</a>');
        }));
      }

      $('#p-desc').innerHTML = `<p>${esc(p.description)}</p><ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`;
      $('#p-back').textContent = p.back ? `Back print: "${p.back}"` : '';

      const rec = PRODUCTS.filter((x) => x.id !== p.id && !x.quoteOnly && inStock(x))
        .map((x) => ({ x, score: (x.category !== p.category ? 2 : 0) + x.stacks.filter((s) => p.stacks.includes(s)).length }))
        .sort((a, b) => b.score - a.score).slice(0, 4).map((r) => r.x);
      $('#wear-with').innerHTML = rec.map((x) => card(x)).join('');
      if (!rec.length) $('#wear-with').closest('section').hidden = true;

      document.body.classList.add('has-sticky-buy');
      gallery();
      sync();
    },

    cart() {
      const steps = $$('.steps li');
      const panels = { bag: $('#step-bag'), details: $('#step-details'), pay: $('#step-pay') };
      const details = store('craf7ton_details') || {};
      const D = C.delivery;

      function deliveryFee() {
        if (!bag.count() || bag.count() >= D.freeDeliveryPieces) return 0;
        return details.method === 'courier' ? D.courierFee : 0;
      }

      function summary() {
        const sub = bag.subtotal();
        const del = deliveryFee();
        const delLabel = !details.method ? 'Calculated next' : del === 0 ? 'Free' : money(del);
        $('#summary').innerHTML = `
          <h2 style="font-size:18px;margin:0 0 4px">Order summary</h2>
          <div class="row"><span>Items (${bag.count()})</span><span>${money(sub)}</span></div>
          <div class="row"><span>Delivery</span><span>${delLabel}</span></div>
          <div class="row total"><span>Total</span><span>${money(sub + del)}</span></div>
          ${bag.count() >= D.freeDeliveryPieces ? `<p class="tiny" style="margin:0;color:var(--ok)">Free delivery unlocked (${D.freeDeliveryPieces}+ pieces).</p>` : `<p class="tiny muted" style="margin:0">Free delivery on ${D.freeDeliveryPieces}+ pieces. Campus pickup is always free.</p>`}`;
      }

      function show(step) {
        const order = ['bag', 'details', 'pay'];
        const at = order.indexOf(step);
        steps.forEach((li, i) => { li.classList.toggle('on', i === at); li.classList.toggle('done', at > i); li.toggleAttribute('aria-current', i === at); });
        Object.entries(panels).forEach(([k, el]) => { el.hidden = k !== step; });
        summary();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      function renderBag(notes = []) {
        const items = bag.items();
        $('#bag-notes').innerHTML = notes.map((n) => `<p class="notice">${esc(n)}</p>`).join('');
        $('#bag-empty').hidden = items.length > 0;
        $('#to-details').hidden = !items.length;
        $('#line-items').innerHTML = items.map((i, idx) => {
          const p = byId(i.id);
          const col = p.colours.find((c) => c.name === i.colour) || p.colours[0];
          const left = stockOf(p, i.colour, i.size);
          return `<li class="line-item">
            <a class="thumb" href="${productUrl(p, col.name)}" aria-hidden="true" tabindex="-1">${productImage(p, col, 'front')}</a>
            <div>
              <h3><a href="${productUrl(p, col.name)}">${esc(p.name)}</a></h3>
              <div class="small muted">${esc(i.colour)} · ${esc(i.size)}${left <= 3 ? ` · <span style="color:var(--err)">only ${left} left</span>` : ''}</div>
              <div class="li-row">
                <div class="qty" role="group" aria-label="Quantity">
                  <button type="button" data-q="${idx}" data-d="-1" aria-label="Decrease quantity">−</button><span>${i.qty}</span><button type="button" data-q="${idx}" data-d="1" aria-label="Increase quantity"${i.qty >= left ? ' disabled' : ''}>+</button>
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
        track('begin_checkout', { currency: CURRENCY, value: bag.subtotal(), items: bag.items().map((i) => ({ item_id: i.id, quantity: i.qty, item_variant: `${i.colour} / ${i.size}` })) });
        show('details');
      });

      // Details step.
      const df = $('#details-form');
      $('#campus').innerHTML = D.campuses.map((c) => `<option>${esc(c)}</option>`).join('');
      $('#courier-fee').textContent = money(D.courierFee);
      $('#opt-pickup').hidden = !D.pickupEnabled;
      $('#opt-courier').hidden = !D.courierEnabled;
      Object.entries(details).forEach(([k, v]) => {
        const el = df.elements[k];
        if (!el) return;
        if (el instanceof RadioNodeList) { $$(`[name="${k}"]`, df).forEach((r) => { r.checked = r.value === v; }); } else el.value = v;
      });
      function methodUI() {
        const m = df.elements.method.value || (D.pickupEnabled ? 'pickup' : 'courier');
        $('#pickup-fields').hidden = m !== 'pickup';
        $('#courier-fields').hidden = m !== 'courier';
        $$('#courier-fields [data-req]').forEach((el) => { el.required = m === 'courier'; });
        details.method = m;
        summary();
      }
      if (!df.elements.method.value) df.elements.method.value = D.pickupEnabled ? 'pickup' : 'courier';
      df.addEventListener('change', (e) => { if (e.target.name === 'method') methodUI(); });
      methodUI();
      df.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validate(df)) { setStatus(df, 'Please fill in the highlighted fields.', false); return; }
        Object.assign(details, Object.fromEntries(new FormData(df).entries()));
        store('craf7ton_details', details);
        $('.form-status', df).className = 'form-status';
        show('pay');
      });
      $$('[data-back]').forEach((b) => b.addEventListener('click', () => show(b.dataset.back)));

      // Pay step: Mobile Money first, card second. Without online payments, MoMo is paid manually.
      const pf = $('#pay-form');
      $('#pay-mode-note').hidden = C.onlinePayments;
      $('#opt-card').hidden = !C.onlinePayments;
      $('#pay-submit').textContent = C.onlinePayments ? 'Continue to secure payment' : 'Place order';
      const payUI = () => { $('#momo-fields').hidden = pf.elements.pay.value !== 'momo'; };
      pf.addEventListener('change', payUI);
      payUI();

      pf.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!bag.count()) { show('bag'); return; }
        const btn = $('#pay-submit');
        btn.disabled = true;
        setStatus(pf, C.onlinePayments ? 'Taking you to secure payment…' : 'Placing your order…');
        try {
          const res = await api('/api/checkout', {
            method: 'POST',
            body: {
              items: bag.items(),
              customer: details,
              payment: { method: pf.elements.pay.value, network: pf.elements.network.value }
            }
          });
          store('craf7ton_pending', { ref: res.ref, token: res.token, items: bag.items(), at: Date.now() });
          if (res.authorizationUrl) { location.href = res.authorizationUrl; return; }
          location.href = `/order?ref=${encodeURIComponent(res.ref)}&t=${encodeURIComponent(res.token)}`;
        } catch (err) {
          btn.disabled = false;
          if (err.status === 409) {
            // Stock or availability changed: refresh and send them back to the bag with an explanation.
            await loadCatalog().catch(() => {});
            renderBag([err.message, ...bag.reconcile()]);
            show('bag');
            return;
          }
          if (err.details && err.details.field) {
            setStatus(df, esc(err.message), false);
            markServerError(df, err);
            show('details');
            return;
          }
          setStatus(pf, `${esc(err.message)} If it keeps happening, <a href="${waLink(`Hi ${BRAND}, I'm having trouble checking out.`)}" target="_blank" rel="noopener">order on WhatsApp</a>.`, false);
        }
      });

      renderBag(bag.reconcile());
      show('bag');
    },

    async order() {
      const ref = params.get('ref') || params.get('reference') || '';
      const token = params.get('t') || '';
      const box = $('#order');
      let tries = 0;

      async function load() {
        let o;
        try {
          o = (await api(`/api/orders/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`)).order;
        } catch (err) {
          box.innerHTML = `<div class="empty"><h1>We couldn't find that order</h1><p>${esc(err.message)}</p><p>Check the link in your SMS or email, or <a href="${waLink(`Hi ${BRAND}, I need help with order ${ref}`)}" target="_blank" rel="noopener">ask us on WhatsApp</a>.</p></div>`;
          return;
        }
        render(o);
        if (o.status === 'pending_payment' && tries < 10) { tries += 1; setTimeout(load, 3000); }
      }

      function render(o) {
        const paid = o.paymentStatus === 'paid';
        const pending = store('craf7ton_pending');
        if ((paid || o.status === 'awaiting_manual_payment') && pending && pending.ref === o.ref) {
          bag.clear();
          store('craf7ton_pending', null);
        }
        const trackedKey = `craf7ton_tracked_${o.ref}`;
        if (paid && !store(trackedKey)) {
          track('purchase', { transaction_id: o.ref, currency: CURRENCY, value: o.total, shipping: o.deliveryFee, items: o.items.map((i) => ({ item_id: i.id, item_name: i.name, item_variant: `${i.colour} / ${i.size}`, price: i.price, quantity: i.qty })) });
          store(trackedKey, true);
        }

        const orderText = `Hi ${BRAND}, this is about order ${o.ref} (${money(o.total)}).`;
        const STATUS = {
          pending_payment: ['Confirming your payment…', tries >= 10
            ? "We haven't received the payment yet. If you were charged, it will update shortly and we'll text you. If you didn't finish paying, go back to your bag and try again."
            : 'This usually takes a few seconds. Keep this page open.'],
          awaiting_manual_payment: ['Order received', "We'll WhatsApp you the Mobile Money number to pay. Your order is confirmed once payment lands. Faster: send us your order on WhatsApp now."],
          paid: ['Payment received', `Thanks, ${o.customerName.split(' ')[0]}! We'll text you when your order is ${o.fulfilment === 'courier' ? 'on the way' : 'ready for pickup'}.`],
          processing: ['Being packed', "Your order is being packed. We'll text you when it's ready."],
          ready_for_pickup: ['Ready for pickup', `Pick it up at ${o.campus}. Bring your order number.`],
          shipped: ['On the way', `Your order is on the way to ${o.city}. The courier will call you.`],
          completed: ['Completed', 'Thanks for wearing your passion. Tag us to be featured!'],
          cancelled: ['Cancelled', 'This order was cancelled. Questions? Message us on WhatsApp.'],
          expired: ['Payment not completed', 'This order expired because payment was not completed. Your bag is still saved if you want to try again.']
        };
        const [title, msg] = STATUS[o.status] || ['Order', ''];
        const showRetry = (o.status === 'pending_payment' && tries >= 10) || o.status === 'expired';
        box.innerHTML = `
          <div class="confirm">
            <span class="eyebrow">Order</span>
            <span class="ref">${esc(o.ref)}</span>
            <h1 style="font-size:30px;margin:0">${esc(title)}</h1>
            <p style="max-width:44ch;margin:0">${esc(msg)}</p>
            <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
              ${showRetry && bag.count() ? '<a class="btn" href="/cart">Back to bag</a>' : ''}
              <a class="btn ${o.status === 'awaiting_manual_payment' ? '' : 'outline'}" href="${waLink(o.status === 'awaiting_manual_payment' ? `${orderText}\n\n${o.items.map((i) => `• ${i.name} (${i.colour}, ${i.size}) x${i.qty}`).join('\n')}\n\nPlease send the MoMo number to pay.` : orderText)}" target="_blank" rel="noopener">WhatsApp us</a>
            </div>
          </div>
          <div class="summary" style="max-width:520px;margin:0 auto">
            ${o.items.map((i) => `<div class="row"><span>${esc(i.name)} <span class="muted">(${esc(i.colour)}, ${esc(i.size)}) ×${i.qty}</span></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
            <div class="row"><span>Delivery</span><span>${o.deliveryFee ? money(o.deliveryFee) : 'Free'}</span></div>
            <div class="row total"><span>Total</span><span>${money(o.total)}</span></div>
            <p class="tiny muted" style="margin:0">${o.fulfilment === 'courier' ? `Courier delivery to ${esc(o.city)}` : `Campus pickup: ${esc(o.campus)}`} · ${paid ? 'Paid' : 'Not paid yet'}</p>
          </div>
          <p class="tiny muted" style="text-align:center;margin-top:16px">Bookmark this page to track your order.</p>`;
      }

      if (!ref || !token) { box.innerHTML = '<div class="empty"><h1>Order link incomplete</h1><p>Use the link from your SMS or email.</p></div>'; return; }
      await load();
    },

    clubs() {
      $('#club-quote').innerHTML = clubFormHTML('quote', false);
      $('#club-products').innerHTML = PRODUCTS.filter((p) => p.stacks.includes('campus-clubs') || p.type === 'hoodie' || p.type === 'cap').map((p) => card(p, { quickAdd: false })).join('');
    },

    contact() {
      $('#c-wa').href = waLink(`Hi ${BRAND}, `);
      $('#c-wa-num').textContent = `+${C.whatsapp}`;
      $('#c-mail').href = `mailto:${C.email}`;
      $('#c-mail-addr').textContent = C.email;
      $('#c-ig').href = C.instagram;
      $('#c-tt').href = C.tiktok;
    },

    story() {
      const p = byId('git-brain-tee') || PRODUCTS[0];
      if (p) $('#story-art').innerHTML = productImage(p, p.colours[0], 'back');
    }
  };

  /* Community wall: add real customer photos here (WebP, square, under 80 KB each). */
  const WALL = [
    // { src: '/assets/img/community/ama-umat.webp', alt: 'Ama at UMaT wearing the Git Brain Tee' },
  ];
  function renderWall(el) {
    if (!el) return;
    const items = WALL.slice(0, 6);
    while (items.length < 6) items.push(null);
    el.innerHTML = items.map((w) => w
      ? `<div class="wall-item"><img src="${esc(w.src)}" alt="${esc(w.alt)}" loading="lazy" decoding="async" width="400" height="400"></div>`
      : '<div class="wall-item ph">Your photo here</div>').join('');
  }

  /* Size guide. TODO: confirm measurements against the actual blanks before launch. */
  const SIZE_TABLE = {
    head: ['Size', 'Chest (cm)', 'Length (cm)', 'Fits chest (in)'],
    rows: [['S', '96', '70', '34–36'], ['M', '104', '72', '38–40'], ['L', '112', '74', '42–44'], ['XL', '120', '76', '46–48'], ['XXL', '128', '78', '50–52']]
  };
  function wireSizeGuide() {
    $$('[data-size-table]').forEach((el) => {
      el.innerHTML = `<table><thead><tr>${SIZE_TABLE.head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${SIZE_TABLE.rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${c}</td>` : `<th scope="row">${c}</th>`)).join('')}</tr>`).join('')}</tbody></table>`;
    });
    const dlg = $('#size-guide');
    if (!dlg) return;
    $$('[data-size-guide]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); dlg.showModal(); }));
  }

  /* ---------- boot ---------- */
  async function loadCatalog() {
    const [config, catalog] = await Promise.all([api('/api/config'), api('/api/products')]);
    C = { ...C, ...config };
    STACKS = config.stacks;
    CATEGORIES = config.categories;
    LINES = config.lines;
    PRODUCTS = catalog.products;
  }

  function showLoadError() {
    const main = $('#main');
    if (!main) return;
    const div = document.createElement('div');
    div.className = 'wrap';
    div.innerHTML = '<p class="notice" style="margin:16px 0">We couldn\'t load the shop right now. Check your connection and <a href="">try again</a>.</p>';
    main.prepend(div);
  }

  renderHeader();
  renderFooter();
  wireChrome();
  wireSizeGuide();
  wireForms();
  document.body.classList.add('loading');

  loadCatalog()
    .then(async () => {
      hydrateChrome();
      if (pages[page]) await pages[page]();
      wireForms();
    })
    .catch((err) => {
      console.error(err);
      showLoadError();
    })
    .finally(() => document.body.classList.remove('loading'));

  // Exposed for debugging.
  window.Craf7ton = { bag, track };
})();
