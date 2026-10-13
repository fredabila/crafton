/* Generated SVG product mockups: stand-ins until real photography is uploaded in the admin.
 * Shared by the storefront and the admin. */
(function () {
  'use strict';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    const fill = /^#[0-9a-f]{6}$/i.test(colour.hex) ? colour.hex : '#111111';
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

  window.C7Mockup = { garmentSVG };
})();
