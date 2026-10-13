/* Craf7ton admin: orders, products and stock, quotes, messages, subscribers, settings.
 * Hash-routed single page app on top of /api/admin/*. */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cedis = (pesewas) => `GHS ${(Number(pesewas) / 100).toFixed(2).replace(/\.00$/, '')}`;
  const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const label = (s) => String(s || '').replace(/_/g, ' ');
  const pill = (s) => `<span class="pill ${esc(s)}">${esc(label(s))}</span>`;
  let META = null;

  async function api(path, { method = 'GET', body, raw, headers = {} } = {}) {
    const res = await fetch(`/api/admin${path}`, {
      method,
      credentials: 'same-origin',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-C7-Admin': '1' } : {}), ...headers },
      body: raw || (body ? JSON.stringify(body) : undefined)
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { renderLogin(); throw new Error('Please log in'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  let flashTimer;
  function flash(msg, err = false) {
    let el = $('.a-flash');
    if (!el) { el = document.createElement('div'); document.body.appendChild(el); }
    el.className = `a-flash${err ? ' err' : ''}`;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }

  /* ---------- shell ---------- */
  const NAV = [['#/', 'Dashboard'], ['#/orders', 'Orders'], ['#/products', 'Products'], ['#/quotes', 'Club quotes', 'quotes'], ['#/messages', 'Messages', 'messages'], ['#/subscribers', 'Subscribers'], ['#/settings', 'Settings']];
  let counts = {};

  function shell(content) {
    const here = location.hash.split('/').slice(0, 2).join('/') || '#/';
    app.innerHTML = `
      <div class="a-shell">
        <div>
          <div class="a-top"><div class="wrap">
            <img src="/assets/img/logo.svg" alt="Craf7ton" width="104" height="26"><span class="a-title">Admin</span><span class="spacer"></span>
            <a class="small" href="/" target="_blank" rel="noopener">View store</a>
            <button class="link-btn small" type="button" id="logout">Log out</button>
          </div></div>
          <nav class="a-nav"><div class="wrap">${NAV.map(([h, t, k]) => `<a href="${h}"${(here === h || (h === '#/' && here === '#')) ? ' aria-current="page"' : ''}>${t}${k && counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</a>`).join('')}</div></nav>
        </div>
        <main class="a-main"><div class="wrap" id="view">${content}</div></main>
      </div>`;
    $('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }).catch(() => {}); renderLogin(); });
    return $('#view');
  }

  function renderLogin() {
    app.innerHTML = `
      <div class="login">
        <img src="/assets/img/logo.svg" alt="Craf7ton" width="144" height="36">
        <h1 style="font-size:24px">Admin login</h1>
        <form class="form" id="login-form">
          <label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label>
          <button class="btn block" type="submit">Log in</button>
          <p class="form-status" role="status"></p>
        </form>
      </div>`;
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('.form-status', e.target);
      try {
        const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: e.target.password.value }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Login failed');
        route();
      } catch (err) {
        status.textContent = err.message;
        status.className = 'form-status show err';
      }
    });
  }

  /* ---------- dashboard ---------- */
  async function dashboard() {
    const v = shell('<p class="muted">Loading…</p>');
    const s = await api('/stats');
    counts = { quotes: s.counts.quotes, messages: s.counts.messages };
    const by = Object.fromEntries(s.byStatus.map((r) => [r.status, r.n]));
    const toDo = (by.paid || 0) + (by.processing || 0);
    shell(`
      <h1>Dashboard</h1>
      ${META.onlinePayments ? '' : '<p class="notice" style="margin-bottom:16px">Online payments are off (no PAYSTACK_SECRET_KEY). Orders arrive as "awaiting manual payment": confirm MoMo on WhatsApp, then press <b>Mark as paid</b>.</p>'}
      <div class="kpis">
        <div class="kpi"><b>${cedis(s.sales.today)}</b><span>Sales today</span></div>
        <div class="kpi"><b>${cedis(s.sales.week)}</b><span>Last 7 days</span></div>
        <div class="kpi"><b>${cedis(s.sales.month)}</b><span>Last 30 days · ${s.sales.month_orders} orders</span></div>
        <div class="kpi"><b>${toDo}</b><span>Paid orders to pack</span></div>
      </div>
      <div class="a-grid two">
        <div class="a-card">
          <div class="a-head"><h2 style="margin:0">Recent orders</h2><a class="small" href="#/orders">All orders</a></div>
          ${s.recent.length ? `<table class="a-table"><tbody>${s.recent.map((o) => `<tr class="click" data-href="#/orders/${esc(o.ref)}"><td><b>${esc(o.ref)}</b><br><span class="tiny muted">${esc(o.customer_name)}</span></td><td>${pill(o.status)}</td><td class="num">${cedis(o.total)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">No orders yet.</p>'}
          ${by.awaiting_manual_payment ? `<p class="small" style="margin-top:12px"><a href="#/orders?status=awaiting_manual_payment">${by.awaiting_manual_payment} order(s) awaiting MoMo payment</a></p>` : ''}
        </div>
        <div class="a-grid">
          <div class="a-card">
            <h2>Low stock</h2>
            ${s.lowStock.length ? `<table class="a-table"><tbody>${s.lowStock.map((r) => `<tr><td>${esc(r.name)}<br><span class="tiny muted">${esc(r.colour)} / ${esc(r.size)}</span></td><td class="num">${r.stock <= 0 ? '<span class="pill warn">Sold out</span>' : `<b>${r.stock}</b> left`}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">Everything is well stocked.</p>'}
          </div>
          <div class="a-card">
            <h2>Inbox</h2>
            <p class="small" style="margin:0"><a href="#/quotes">${s.counts.quotes} new club quote(s)</a><br><a href="#/messages">${s.counts.messages} new message(s)</a><br><a href="#/subscribers">${s.counts.subscribers} drop subscriber(s)</a></p>
          </div>
        </div>
      </div>`);
    wireRowLinks();
  }

  function wireRowLinks() {
    $$('tr[data-href]').forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  /* ---------- orders ---------- */
  async function ordersList() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const status = q.get('status') || '';
    const search = q.get('q') || '';
    shell(`
      <div class="a-head"><h1>Orders</h1></div>
      <form class="toolbar" id="filters">
        <input type="search" name="q" placeholder="Search ref, name, phone, email" value="${esc(search)}">
        <select name="status"><option value="">All statuses</option>${META.statuses.map((s) => `<option value="${s}"${s === status ? ' selected' : ''}>${esc(label(s))}</option>`).join('')}</select>
        <button class="btn" type="submit">Filter</button>
      </form>
      <div class="a-card" style="padding:0;overflow-x:auto" id="list"><p class="muted" style="padding:16px">Loading…</p></div>`);
    $('#filters').addEventListener('submit', (e) => {
      e.preventDefault();
      const p = new URLSearchParams(Object.entries(Object.fromEntries(new FormData(e.target))).filter(([, v]) => v));
      location.hash = `#/orders${p.toString() ? `?${p}` : ''}`;
    });
    $('#filters select').addEventListener('change', (e) => e.target.form.requestSubmit());
    const { orders } = await api(`/orders?${new URLSearchParams({ status, q: search })}`);
    $('#list').innerHTML = orders.length ? `
      <table class="a-table"><thead><tr><th>Order</th><th>Status</th><th class="hide-sm">Delivery</th><th class="hide-sm">Placed</th><th class="num">Total</th></tr></thead><tbody>
      ${orders.map((o) => `<tr class="click" data-href="#/orders/${esc(o.ref)}">
        <td><b>${esc(o.ref)}</b>${o.stock_issue ? ' <span class="pill warn">stock</span>' : ''}<br><span class="tiny muted">${esc(o.customer_name)} · ${o.pieces || 0} pcs</span></td>
        <td>${pill(o.status)}</td>
        <td class="hide-sm small">${o.fulfilment === 'courier' ? `Courier, ${esc(o.city)}` : esc(o.campus)}</td>
        <td class="hide-sm small">${when(o.created_at)}</td>
        <td class="num">${cedis(o.total)}</td></tr>`).join('')}
      </tbody></table>` : '<p class="muted" style="padding:16px">No orders match.</p>';
    wireRowLinks();
  }

  async function orderDetail(ref) {
    shell('<p class="muted">Loading…</p>');
    const { order: o, items, events } = await api(`/orders/${encodeURIComponent(ref)}`);
    const wa = `https://wa.me/${o.phone}?text=${encodeURIComponent(`Hi ${o.customer_name.split(' ')[0]}, this is Craf7ton about your order ${o.ref}.`)}`;
    const nextStatuses = META.statuses.filter((s) => !['pending_payment', 'awaiting_manual_payment', 'expired'].includes(s));
    shell(`
      <p class="small"><a href="#/orders">← Orders</a></p>
      <div class="a-head"><h1>${esc(o.ref)}</h1><div>${pill(o.status)} ${o.payment_status === 'paid' ? pill('paid') : '<span class="pill">unpaid</span>'}</div></div>
      ${o.stock_issue ? '<p class="notice" style="margin-bottom:12px">Stock went below zero when this order was paid. Check you can fulfil it, then fix the stock counts in Products.</p>' : ''}
      <div class="a-grid two">
        <div class="a-grid">
          <div class="a-card">
            <h2>Items</h2>
            <table class="a-table"><tbody>${items.map((i) => `<tr><td>${esc(i.product_name)}<br><span class="tiny muted">${esc(i.colour)} / ${esc(i.size)}</span></td><td>×${i.qty}</td><td class="num">${cedis(i.unit_price * i.qty)}</td></tr>`).join('')}
              <tr><td colspan="2">Delivery</td><td class="num">${o.delivery_fee ? cedis(o.delivery_fee) : 'Free'}</td></tr>
              <tr><td colspan="2"><b>Total</b></td><td class="num"><b>${cedis(o.total)}</b></td></tr></tbody></table>
          </div>
          <div class="a-card">
            <h2>Customer</h2>
            <dl class="kv">
              <dt>Name</dt><dd>${esc(o.customer_name)}</dd>
              <dt>Phone</dt><dd><a href="tel:+${esc(o.phone)}">+${esc(o.phone)}</a> · <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a></dd>
              <dt>Email</dt><dd>${o.email ? `<a href="mailto:${esc(o.email)}">${esc(o.email)}</a>` : '—'}</dd>
              <dt>Delivery</dt><dd>${o.fulfilment === 'courier' ? `Courier: ${esc(o.address)}, ${esc(o.city)}` : `Pickup: ${esc(o.campus)}`}</dd>
              <dt>Updates via</dt><dd>${esc(o.updates_via)}</dd>
              <dt>Payment</dt><dd>${esc(o.payment_method)}${o.momo_network ? ` (${esc(o.momo_network)})` : ''}${o.paid_at ? ` · paid ${when(o.paid_at)}` : ''}</dd>
              <dt>Notes</dt><dd>${esc(o.notes) || '—'}</dd>
              <dt>Placed</dt><dd>${when(o.created_at)}</dd>
            </dl>
          </div>
        </div>
        <div class="a-grid">
          ${o.payment_status !== 'paid' ? `
          <div class="a-card">
            <h2>Payment</h2>
            <p class="small">${o.status === 'awaiting_manual_payment' ? 'Send the customer your MoMo number on WhatsApp. Once the money lands, mark the order paid. This takes the items out of stock and texts the customer.' : 'Waiting for Paystack. Only mark paid if you received the money another way.'}</p>
            <button class="btn accent block" type="button" id="mark-paid">Mark as paid (${cedis(o.total)})</button>
          </div>` : ''}
          <div class="a-card">
            <h2>Update status</h2>
            <form class="form" id="status-form">
              <select name="status">${nextStatuses.map((s) => `<option value="${s}"${s === o.status ? ' selected' : ''}>${esc(label(s))}</option>`).join('')}</select>
              <label class="checks"><label><input type="checkbox" name="notify" checked> Text/email the customer</label></label>
              <input type="text" name="note" placeholder="Internal note (optional)">
              <button class="btn block" type="submit">Save status</button>
              <p class="tiny muted" style="margin:0">Cancelling a paid order puts its items back in stock. Refunds are made in the Paystack dashboard.</p>
            </form>
          </div>
          <div class="a-card">
            <h2>Admin notes</h2>
            <form class="form" id="notes-form"><textarea name="notes">${esc(o.admin_notes)}</textarea><button class="btn outline sm" type="submit">Save notes</button></form>
          </div>
          <div class="a-card">
            <h2>Timeline</h2>
            <ul class="timeline">${events.map((e) => `<li><time>${when(e.created_at)}</time>${esc(e.message || label(e.type))}</li>`).join('')}</ul>
          </div>
        </div>
      </div>`);
    const mp = $('#mark-paid');
    if (mp) mp.addEventListener('click', async () => {
      if (!confirm(`Confirm you received ${cedis(o.total)} for ${o.ref}?`)) return;
      mp.disabled = true;
      try { await api(`/orders/${encodeURIComponent(o.ref)}/mark-paid`, { method: 'POST', body: {} }); flash('Marked as paid'); orderDetail(ref); } catch (err) { flash(err.message, true); mp.disabled = false; }
    });
    $('#status-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      if (f.status.value === 'cancelled' && !confirm('Cancel this order? Paid items go back into stock.')) return;
      try { await api(`/orders/${encodeURIComponent(o.ref)}`, { method: 'PATCH', body: { status: f.status.value, notify: f.notify.checked, note: f.note.value } }); flash('Status saved'); orderDetail(ref); } catch (err) { flash(err.message, true); }
    });
    $('#notes-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await api(`/orders/${encodeURIComponent(o.ref)}`, { method: 'PATCH', body: { adminNotes: e.target.notes.value } }); flash('Notes saved'); } catch (err) { flash(err.message, true); }
    });
  }

  /* ---------- products ---------- */
  function thumb(p) {
    if (p.images && p.images.front) return `<img src="${esc(p.images.front)}" alt="">`;
    return window.C7Mockup.garmentSVG({ name: p.name, type: p.type, front: p.front_print, back: p.back_print }, p.colours[0] || { name: '', hex: '#111111' }, 'front');
  }

  async function productsList() {
    shell('<p class="muted">Loading…</p>');
    const { products } = await api('/products');
    shell(`
      <div class="a-head"><h1>Products</h1><a class="btn" href="#/products/new">Add product</a></div>
      <div class="a-card" style="padding:0;overflow-x:auto">
        <table class="a-table"><thead><tr><th></th><th>Product</th><th class="hide-sm">Category</th><th>Stock</th><th class="num">Price</th></tr></thead><tbody>
        ${products.map((p) => {
          const total = p.variants.reduce((s, v) => s + Math.max(0, v.stock), 0);
          const out = p.variants.filter((v) => v.stock <= 0).length;
          return `<tr class="click" data-href="#/products/${p.id}">
            <td style="width:56px"><div class="prod-thumb">${thumb(p)}</div></td>
            <td><b>${esc(p.name)}</b>${p.active ? '' : ' <span class="pill">archived</span>'}${p.is_new ? ' <span class="pill new">new</span>' : ''}<br><span class="tiny muted">/products/${esc(p.slug)}</span></td>
            <td class="hide-sm small">${esc(p.category)}</td>
            <td class="small">${p.quote_only ? 'Quote only' : !p.track_stock ? 'Not tracked' : `${total} units${out ? ` · <span class="pill warn">${out} sold out</span>` : ''}`}</td>
            <td class="num">${cedis(p.price)}</td></tr>`;
        }).join('')}
        </tbody></table>
      </div>`);
    wireRowLinks();
  }

  async function productEdit(id) {
    shell('<p class="muted">Loading…</p>');
    const blank = { name: '', slug: '', type: 'tee', category: 'tees', stacks: [], price: 0, colours: [{ name: 'Black', hex: '#111111' }], sizes: ['S', 'M', 'L', 'XL', 'XXL'], front_print: 'craf7ton', back_print: '', tagline: '', description: '', details: [], images: {}, is_new: true, quote_only: false, track_stock: true, active: true, sort: 0, variants: [] };
    const p = id === 'new' ? blank : (await api(`/products/${id}`)).product;
    const stock = Object.fromEntries(p.variants.map((v) => [`${v.colour}|${v.size}`, v.stock]));

    shell(`
      <p class="small"><a href="#/products">← Products</a></p>
      <div class="a-head"><h1>${id === 'new' ? 'New product' : esc(p.name)}</h1>${id !== 'new' && p.active ? `<a class="small" href="/products/${esc(p.slug)}" target="_blank" rel="noopener">View in store</a>` : ''}</div>
      <form class="a-grid two" id="pform" novalidate>
        <div class="a-grid">
          <div class="a-card form">
            <label>Name<input name="name" value="${esc(p.name)}" required></label>
            <div class="form-row two">
              <label>URL slug <span class="opt">(auto from name)</span><input name="slug" value="${esc(p.slug)}" placeholder="git-brain-tee"></label>
              <label>Price (GHS)<input name="price" type="number" min="0" step="0.01" value="${p.price / 100}" required></label>
            </div>
            <div class="form-row two">
              <label>Type <span class="opt">(drives the mockup)</span><select name="type">${META.types.map((t) => `<option${t === p.type ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
              <label>Category<select name="category">${META.categories.map((c) => `<option value="${c.id}"${c.id === p.category ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
            </div>
            <fieldset class="choice-group"><legend>Stacks (shop by stack)</legend><div class="checks">${META.stacks.map((s) => `<label><input type="checkbox" name="stacks" value="${s.id}"${p.stacks.includes(s.id) ? ' checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></fieldset>
            <label>Tagline<input name="tagline" value="${esc(p.tagline)}" maxlength="200"></label>
            <label>Description<textarea name="description">${esc(p.description)}</textarea></label>
            <label>Details <span class="opt">(one per line)</span><textarea name="details">${esc(p.details.join('\n'))}</textarea></label>
            <div class="form-row two">
              <label>Front print text<input name="front" value="${esc(p.front_print)}"></label>
              <label>Back print text<input name="back" value="${esc(p.back_print)}"></label>
            </div>
          </div>
          <div class="a-card">
            <h2>Photos</h2>
            <p class="tiny muted">WebP, 4:5 portrait, under 300 KB. Without photos the store shows a generated mockup.</p>
            <div class="img-slots" id="img-slots"></div>
          </div>
        </div>
        <div class="a-grid">
          <div class="a-card form">
            <h2 style="margin:0">Visibility</h2>
            <div class="checks">
              <label><input type="checkbox" name="active"${p.active ? ' checked' : ''}> Live in store</label>
              <label><input type="checkbox" name="isNew"${p.is_new ? ' checked' : ''}> Show in "New in"</label>
              <label><input type="checkbox" name="quoteOnly"${p.quote_only ? ' checked' : ''}> Quote only (club custom)</label>
              <label><input type="checkbox" name="trackStock"${p.track_stock ? ' checked' : ''}> Track stock</label>
            </div>
            <label>Sort order <span class="opt">(lower shows first)</span><input name="sort" type="number" value="${p.sort}"></label>
          </div>
          <div class="a-card form">
            <h2 style="margin:0">Colours</h2>
            <div class="colour-rows" id="colours"></div>
            <button class="btn outline sm" type="button" id="add-colour">Add colour</button>
            <label>Sizes <span class="opt">(comma separated)</span><input name="sizes" value="${esc(p.sizes.join(', '))}"></label>
          </div>
          <div class="a-card">
            <h2>Stock</h2>
            <p class="tiny muted">Units on hand per colour and size. Paid orders take stock off automatically.</p>
            <div class="stock-grid" id="stock"></div>
          </div>
        </div>
        <div class="save-bar" style="grid-column:1/-1">
          <button class="btn" type="submit">Save product</button>
          ${id !== 'new' && p.active ? '<button class="btn outline" type="button" id="archive">Archive</button>' : ''}
          <span class="form-status" role="status"></span>
        </div>
      </form>`);

    const form = $('#pform');
    let colours = p.colours.map((c) => ({ ...c }));
    const images = { ...p.images };

    function readStock() {
      $$('#stock input').forEach((i) => { stock[i.dataset.k] = Number(i.value) || 0; });
    }
    function sizes() { return form.sizes.value.split(',').map((s) => s.trim()).filter(Boolean); }

    function renderColours() {
      $('#colours').innerHTML = colours.map((c, i) => `
        <div class="colour-row"><input data-ci="${i}" data-f="name" value="${esc(c.name)}" placeholder="Colour name" aria-label="Colour name"><input type="color" data-ci="${i}" data-f="hex" value="${esc(c.hex)}" aria-label="Colour"><button class="icon-btn" type="button" data-rm="${i}" aria-label="Remove colour">✕</button></div>`).join('');
    }
    function renderStock() {
      readStock();
      const sz = sizes();
      $('#stock').innerHTML = `<table class="a-table"><thead><tr><th></th>${sz.map((s) => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>${colours.map((c) => `<tr><th>${esc(c.name)}</th>${sz.map((s) => {
        const k = `${c.name}|${s}`;
        const n = stock[k] ?? 0;
        return `<td><input type="number" data-k="${esc(k)}" value="${n}"${n <= 3 ? ' class="low"' : ''} aria-label="${esc(c.name)} ${esc(s)} stock"></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function renderImages() {
      const preview = { name: form.name.value, type: form.type.value, front: form.front.value, back: form.back.value };
      $('#img-slots').innerHTML = [['front', 'Front'], ['back', 'Back'], ['print', 'Close-up print'], ['person', 'On body']].map(([k, l]) => `
        <div class="img-slot">
          <b>${l}</b>
          <div class="prev">${images[k] ? `<img src="${esc(images[k])}" alt="">` : k === 'person' ? '<span class="tiny muted">None</span>' : window.C7Mockup.garmentSVG(preview, colours[0] || { name: '', hex: '#111111' }, k)}</div>
          <label class="btn outline sm" style="display:flex">Upload<input type="file" accept="image/webp,image/jpeg,image/png,image/avif" data-img="${k}" hidden></label>
          ${images[k] ? `<button class="link-btn tiny" type="button" data-clear="${k}">Remove</button>` : ''}
        </div>`).join('');
    }

    renderColours(); renderStock(); renderImages();

    $('#colours').addEventListener('input', (e) => {
      const i = e.target.dataset.ci;
      if (i === undefined) return;
      readStock();
      const old = colours[i].name;
      colours[i][e.target.dataset.f] = e.target.value;
      if (e.target.dataset.f === 'name') {
        // Carry stock over to the renamed colour.
        Object.keys(stock).filter((k) => k.startsWith(`${old}|`)).forEach((k) => { stock[`${e.target.value}|${k.split('|')[1]}`] = stock[k]; });
      }
      renderStock();
      if (e.target.dataset.f === 'hex' && +i === 0) renderImages();
    });
    $('#colours').addEventListener('click', (e) => {
      const rm = e.target.closest('[data-rm]');
      if (!rm) return;
      readStock();
      colours.splice(+rm.dataset.rm, 1);
      renderColours(); renderStock(); renderImages();
    });
    $('#add-colour').addEventListener('click', () => { readStock(); colours.push({ name: 'New colour', hex: '#f4f4f2' }); renderColours(); renderStock(); });
    form.sizes.addEventListener('change', renderStock);
    ['type', 'front', 'back'].forEach((n) => form[n].addEventListener('change', renderImages));
    form.name.addEventListener('input', () => {
      if (id === 'new') form.slug.placeholder = form.name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    });

    $('#img-slots').addEventListener('change', async (e) => {
      const input = e.target.closest('[data-img]');
      if (!input || !input.files[0]) return;
      const file = input.files[0];
      if (file.size > 4 * 1024 * 1024) { flash('Image is over 4 MB. Export it as WebP under 300 KB.', true); return; }
      flash('Uploading…');
      try {
        const { url } = await api(`/upload?filename=${encodeURIComponent(file.name)}`, { method: 'POST', raw: file, headers: { 'Content-Type': file.type } });
        images[input.dataset.img] = url;
        renderImages();
        flash('Uploaded. Save the product to keep it.');
      } catch (err) { flash(err.message, true); }
    });
    $('#img-slots').addEventListener('click', (e) => {
      const c = e.target.closest('[data-clear]');
      if (c) { delete images[c.dataset.clear]; renderImages(); }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      readStock();
      const body = {
        name: form.name.value, slug: form.slug.value, price: form.price.value, type: form.type.value, category: form.category.value,
        stacks: $$('[name="stacks"]:checked', form).map((c) => c.value),
        tagline: form.tagline.value, description: form.description.value,
        details: form.details.value.split('\n').map((s) => s.trim()).filter(Boolean),
        front: form.front.value, back: form.back.value,
        active: form.active.checked, isNew: form.isNew.checked, quoteOnly: form.quoteOnly.checked, trackStock: form.trackStock.checked,
        sort: form.sort.value, colours, sizes: sizes(), images, stock
      };
      const status = $('.save-bar .form-status');
      try {
        const res = id === 'new' ? await api('/products', { method: 'POST', body }) : await api(`/products/${id}`, { method: 'PUT', body });
        flash('Product saved');
        if (id === 'new') location.hash = `#/products/${res.product.id}`; else productEdit(id);
      } catch (err) {
        status.textContent = err.message;
        status.className = 'form-status show err';
      }
    });
    const arch = $('#archive');
    if (arch) arch.addEventListener('click', async () => {
      if (!confirm('Archive this product? It disappears from the store but stays on past orders.')) return;
      try { await api(`/products/${id}`, { method: 'DELETE' }); flash('Archived'); location.hash = '#/products'; } catch (err) { flash(err.message, true); }
    });
  }

  /* ---------- quotes, messages, subscribers ---------- */
  async function quotes() {
    shell('<p class="muted">Loading…</p>');
    const { quotes: list } = await api('/quotes');
    shell(`
      <div class="a-head"><h1>Club quotes</h1></div>
      ${list.length ? list.map((q) => `
        <div class="a-card" style="margin-bottom:10px">
          <div class="a-head" style="margin-bottom:8px"><h2 style="margin:0">${esc(q.club)} · ${q.pieces} pcs</h2>
            <select data-quote="${q.id}" style="width:auto;min-height:38px">${['new', 'quoted', 'won', 'lost'].map((s) => `<option${s === q.status ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
          <dl class="kv">
            <dt>Contact</dt><dd>${esc(q.contact_name) || '—'}</dd>
            <dt>WhatsApp</dt><dd><a href="https://wa.me/${esc(q.whatsapp)}?text=${encodeURIComponent(`Hi, this is Craf7ton about your quote for ${q.club}.`)}" target="_blank" rel="noopener">+${esc(q.whatsapp)}</a></dd>
            <dt>Email</dt><dd>${q.email ? `<a href="mailto:${esc(q.email)}">${esc(q.email)}</a>` : '—'}</dd>
            <dt>Item</dt><dd>${esc(q.garment) || '—'}</dd>
            <dt>Notes</dt><dd>${esc(q.notes) || '—'}</dd>
            <dt>Received</dt><dd>${when(q.created_at)}</dd>
          </dl>
        </div>`).join('') : '<p class="muted">No quote requests yet.</p>'}`);
    $$('[data-quote]').forEach((s) => s.addEventListener('change', async () => {
      try { await api(`/quotes/${s.dataset.quote}`, { method: 'PATCH', body: { status: s.value } }); flash('Updated'); } catch (err) { flash(err.message, true); }
    }));
  }

  async function messages() {
    shell('<p class="muted">Loading…</p>');
    const { messages: list } = await api('/messages');
    shell(`
      <div class="a-head"><h1>Messages</h1></div>
      ${list.length ? list.map((m) => `
        <div class="a-card" style="margin-bottom:10px">
          <div class="a-head" style="margin-bottom:8px"><h2 style="margin:0">${esc(m.name)} <span class="tiny muted">${esc(m.contact)} · ${when(m.created_at)}</span></h2>
          ${m.status === 'new' ? `<button class="btn outline sm" type="button" data-done="${m.id}">Mark done</button>` : pill('done')}</div>
          <p style="white-space:pre-wrap;margin:0">${esc(m.message)}</p>
        </div>`).join('') : '<p class="muted">No messages yet.</p>'}`);
    $$('[data-done]').forEach((b) => b.addEventListener('click', async () => {
      try { await api(`/messages/${b.dataset.done}`, { method: 'PATCH', body: { status: 'done' } }); messages(); } catch (err) { flash(err.message, true); }
    }));
  }

  async function subscribers() {
    shell('<p class="muted">Loading…</p>');
    const { subscribers: list } = await api('/subscribers');
    shell(`
      <div class="a-head"><h1>Drop subscribers <span class="muted" style="font-size:16px">${list.length}</span></h1><button class="btn outline" type="button" id="csv">Download CSV</button></div>
      <div class="a-card" style="padding:0;overflow-x:auto">${list.length ? `<table class="a-table"><thead><tr><th>Contact</th><th>Type</th><th>Joined</th></tr></thead><tbody>${list.map((s) => `<tr><td>${s.kind === 'whatsapp' ? `+${esc(s.contact)}` : esc(s.contact)}</td><td>${esc(s.kind)}</td><td class="small">${when(s.created_at)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted" style="padding:16px">No subscribers yet.</p>'}</div>`);
    $('#csv').addEventListener('click', () => {
      const rows = [['contact', 'type', 'joined'], ...list.map((s) => [s.kind === 'whatsapp' ? `+${s.contact}` : s.contact, s.kind, s.created_at])];
      const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `craf7ton-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });
  }

  /* ---------- settings ---------- */
  async function settings() {
    shell('<p class="muted">Loading…</p>');
    const { settings: s } = await api('/settings');
    shell(`
      <div class="a-head"><h1>Settings</h1></div>
      <form class="a-grid two" id="sform">
        <div class="a-card form">
          <h2 style="margin:0">Store</h2>
          <label>Announcement bar<input name="announcement" value="${esc(s.announcement)}" maxlength="140"></label>
          <div class="form-row two">
            <label>WhatsApp number<input name="whatsapp" type="tel" value="${esc(s.whatsapp)}"></label>
            <label>Contact email<input name="email" type="email" value="${esc(s.email)}"></label>
          </div>
          <label>Social handle<input name="socialHandle" value="${esc(s.socialHandle)}"></label>
          <div class="form-row two">
            <label>Instagram URL<input name="instagram" value="${esc(s.instagram)}"></label>
            <label>TikTok URL<input name="tiktok" value="${esc(s.tiktok)}"></label>
          </div>
        </div>
        <div class="a-card form">
          <h2 style="margin:0">Delivery</h2>
          <div class="checks">
            <label><input type="checkbox" name="pickupEnabled"${s.pickupEnabled ? ' checked' : ''}> Campus pickup</label>
            <label><input type="checkbox" name="courierEnabled"${s.courierEnabled ? ' checked' : ''}> Courier delivery</label>
          </div>
          <div class="form-row two">
            <label>Courier fee (GHS)<input name="courierFee" type="number" min="0" step="0.01" value="${s.courierFee / 100}"></label>
            <label>Free delivery from (pieces)<input name="freeDeliveryPieces" type="number" min="1" value="${s.freeDeliveryPieces}"></label>
          </div>
          <label>Pickup campuses <span class="opt">(one per line)</span><textarea name="campuses" rows="6">${esc(s.campuses.join('\n'))}</textarea></label>
          <label>Low stock alert at <span class="opt">(units)</span><input name="lowStockThreshold" type="number" min="0" value="${s.lowStockThreshold}"></label>
        </div>
        <div class="save-bar" style="grid-column:1/-1"><button class="btn" type="submit">Save settings</button><span class="form-status" role="status"></span></div>
      </form>`);
    $('#sform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const body = {
        announcement: f.announcement.value, whatsapp: f.whatsapp.value, email: f.email.value, socialHandle: f.socialHandle.value,
        instagram: f.instagram.value, tiktok: f.tiktok.value, pickupEnabled: f.pickupEnabled.checked, courierEnabled: f.courierEnabled.checked,
        courierFee: f.courierFee.value, freeDeliveryPieces: f.freeDeliveryPieces.value, lowStockThreshold: f.lowStockThreshold.value,
        campuses: f.campuses.value.split('\n').map((c) => c.trim()).filter(Boolean)
      };
      const st = $('.save-bar .form-status');
      try { await api('/settings', { method: 'PUT', body }); flash('Settings saved'); st.className = 'form-status'; } catch (err) { st.textContent = err.message; st.className = 'form-status show err'; }
    });
  }

  /* ---------- router ---------- */
  async function route() {
    try {
      const me = await fetch('/api/admin/me', { credentials: 'same-origin' }).then((r) => r.json());
      if (!me.admin) { renderLogin(); return; }
      META ||= await api('/meta');
      const h = location.hash.replace(/^#/, '').split('?')[0] || '/';
      const parts = h.split('/').filter(Boolean);
      if (!parts.length) return await dashboard();
      if (parts[0] === 'orders') return parts[1] ? await orderDetail(decodeURIComponent(parts[1])) : await ordersList();
      if (parts[0] === 'products') return parts[1] ? await productEdit(parts[1]) : await productsList();
      if (parts[0] === 'quotes') return await quotes();
      if (parts[0] === 'messages') return await messages();
      if (parts[0] === 'subscribers') return await subscribers();
      if (parts[0] === 'settings') return await settings();
      location.hash = '#/';
    } catch (err) {
      if (err.message !== 'Please log in') { console.error(err); flash(err.message, true); }
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
