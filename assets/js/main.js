(() => {
  'use strict';

  const DATA = window.LAB_DATA;
  if (!DATA) return;

  const NS = 'http://www.w3.org/2000/svg';
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const state = { region: 'global', period: 'all' };

  const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

  const fmtNum = (v, d = 1) => {
    if (d === 0) return nf0.format(v);
    if (d === 2) return nf2.format(v);
    return nf1.format(v);
  };
  const fmtSales = (v) => {
    if (v >= 1000) return `${fmtNum(v / 1000, 2)} млрд`;
    if (v >= 1) return `${fmtNum(v, 1)} млн`;
    if (v >= 0.001) return `${fmtNum(v * 1000, 0)} тыс.`;
    return '0';
  };
  const fmtExact = (v) => `${fmtNum(v, 1)} млн копий`;
  const fmtPct = (v) => `${fmtNum(v, 1)}%`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const tooltip = $('#tooltip');
  const showTip = (html, event) => {
    if (!tooltip) return;
    tooltip.innerHTML = html;
    tooltip.classList.add('is-visible');
    const pad = 12;
    const x = Math.min(window.innerWidth - 145, Math.max(145, event.clientX));
    const y = Math.max(80, event.clientY);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  };
  const hideTip = () => tooltip && tooltip.classList.remove('is-visible');

  const svgEl = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  };

  const textEl = (x, y, value, attrs = {}) => {
    const node = svgEl('text', { x, y, ...attrs });
    node.textContent = value;
    return node;
  };

  const polar = (cx, cy, r, a) => [
    cx + r * Math.cos(a),
    cy + r * Math.sin(a)
  ];

  const arcPath = (cx, cy, r0, r1, a0, a1) => {
    const p0 = polar(cx, cy, r1, a0);
    const p1 = polar(cx, cy, r1, a1);
    const p2 = polar(cx, cy, r0, a1);
    const p3 = polar(cx, cy, r0, a0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${p0[0]},${p0[1]} A${r1},${r1} 0 ${large} 1 ${p1[0]},${p1[1]} ` +
           `L${p2[0]},${p2[1]} A${r0},${r0} 0 ${large} 0 ${p3[0]},${p3[1]} Z`;
  };

  const curveSegments = (points) => {
    let d = '';
    for (let i = 1; i < points.length; i += 1) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const mx = (p0[0] + p1[0]) / 2;
      d += ` C${mx},${p0[1]} ${mx},${p1[1]} ${p1[0]},${p1[1]}`;
    }
    return d;
  };

  const curvePath = (points) => {
    if (!points.length) return '';
    return `M${points[0][0]},${points[0][1]}${curveSegments(points)}`;
  };

  const bandPath = (top, bottom) => {
    const rev = bottom.slice().reverse();
    return `M${top[0][0]},${top[0][1]}${curveSegments(top)} ` +
           `L${rev[0][0]},${rev[0][1]}${curveSegments(rev)} Z`;
  };

  const sum = (arr) => arr.reduce((a, b) => a + b, 0);

  const currentCombo = () => DATA.combos[`${state.region}|${state.period}`];

  const regionName = () => (DATA.regions.find((r) => r.id === state.region) || {}).name || '';
  const periodName = () => (DATA.periods.find((p) => p.id === state.period) || {}).name || '';

  // ------------------------------------------------------------------
  // STREAMGRAPH
  // ------------------------------------------------------------------
  function renderStream(c) {
    const host = $('#streamChart');
    if (!host) return;
    host.innerHTML = '';

    const W = 1000;
    const H = 600;
    const m = { l: 52, r: 220, t: 46, b: 56 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const years = c.stream.years;
    const series = c.stream.series;
    const totals = c.stream.totals;
    const n = years.length;

    if (!n) {
      host.innerHTML = '<p class="empty">Нет данных за выбранный период.</p>';
      return;
    }

    const maxTotal = Math.max(...totals, 1);
    const x = (i) => m.l + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
    const center = m.t + ph / 2;
    const scale = ph / maxTotal;
    const y = (v) => center - v * scale;

    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': `Потоковая диаграмма жанров за ${periodName()}, ${regionName()}`
    });

    // Сетка
    [-0.5, 0, 0.5].forEach((k) => {
      svg.appendChild(svgEl('line', {
        x1: m.l, x2: W - m.r,
        y1: center + k * ph,
        y2: center + k * ph,
        class: k === 0 ? 'axis-line' : 'grid-line'
      }));
    });

    // Полосы
    const cum = totals.map((t) => -t / 2);
    series.forEach((s, si) => {
      const top = [];
      const bottom = [];
      for (let i = 0; i < n; i += 1) {
        const v = s.values[i];
        bottom.push([x(i), y(cum[i])]);
        top.push([x(i), y(cum[i] + v)]);
        cum[i] += v;
      }
      const path = svgEl('path', {
        d: bandPath(top, bottom),
        fill: s.color,
        class: 'stream-band',
        opacity: 0.88
      });
      const title = svgEl('title');
      title.textContent = `${s.name}: ${fmtSales(sum(s.values))} копий за период`;
      path.appendChild(title);
      path.addEventListener('pointerenter', (e) => {
        showTip(`<strong>${esc(s.name)}</strong><span class="tt-muted">${fmtSales(sum(s.values))} копий за период</span>`, e);
      });
      path.addEventListener('pointermove', (e) => {
        showTip(`<strong>${esc(s.name)}</strong><span class="tt-muted">${fmtSales(sum(s.values))} копий за период</span>`, e);
      });
      path.addEventListener('pointerleave', hideTip);
      svg.appendChild(path);
    });

    // Подписи жанров прямо у лент
    const labelItems = [];
    let cumLast = -totals[n - 1] / 2;
    series.forEach((s) => {
      const y0 = cumLast;
      const y1 = cumLast + s.values[n - 1];
      labelItems.push({
        name: s.name,
        color: s.color,
        y: (y(y0) + y(y1)) / 2
      });
      cumLast = y1;
    });
    labelItems.sort((a, b) => a.y - b.y);
    let prevY = -Infinity;
    labelItems.forEach((item) => {
      item.ly = Math.max(item.y, prevY + 26);
      prevY = item.ly;
    });
    if (labelItems.length) {
      const bottom = labelItems[labelItems.length - 1].ly;
      const maxY = H - m.b - 8;
      const topY = m.t + 8;
      if (bottom > maxY) {
        const shift = bottom - maxY;
        labelItems.forEach((item) => { item.ly -= shift; });
      }
      if (labelItems[0].ly < topY) {
        const shift = topY - labelItems[0].ly;
        labelItems.forEach((item) => { item.ly += shift; });
      }
    }
    const labelBase = W - m.r + 34;
    const minLy = labelItems.length ? labelItems[0].ly : 0;
    const maxLy = labelItems.length ? labelItems[labelItems.length - 1].ly : 1;
    labelItems.forEach((item) => {
      const t = (item.ly - minLy) / Math.max(1, maxLy - minLy);
      item.label = item.name === 'Остальные жанры' ? 'Остальные' : item.name;
      const estimatedWidth = item.label.length * 10.5;
      item.lx = Math.min(labelBase + t * 56, W - 14 - estimatedWidth);
    });
    labelItems.forEach((item) => {
      const endX = x(n - 1);
      const stub = 10;
      const labelStart = item.lx - 2;
      svg.appendChild(svgEl('path', {
        d: `M${endX},${item.y} L${endX + stub},${item.y} L${labelStart - 8},${item.ly} L${labelStart},${item.ly}`,
        fill: 'none',
        stroke: item.color,
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: 0.9
      }));
      svg.appendChild(textEl(item.lx, item.ly + 3, item.label, {
        class: 'stream-label', 'text-anchor': 'start'
      }));
    });

    // Ось X
    const step = n <= 12 ? 1 : n <= 20 ? 2 : 5;
    years.forEach((year, i) => {
      if (i !== 0 && i !== n - 1 && year % step !== 0) return;
      const tx = x(i);
      svg.appendChild(svgEl('line', {
        x1: tx, x2: tx, y1: H - m.b, y2: H - m.b + 5, class: 'axis-line'
      }));
      svg.appendChild(textEl(tx, H - m.b + 19, year, {
        'text-anchor': 'middle', class: 'tick'
      }));
    });

    // Пик: только подпись, без вертикальной линии
    const peakIdx = totals.indexOf(Math.max(...totals));
    const px = x(peakIdx);
    svg.appendChild(textEl(Math.min(px + 6, W - m.r - 90), m.t - 10,
      `Пик: ${years[peakIdx]}`, { class: 'peak-label' }));

    // Интерактивный слой
    const guide = svgEl('line', {
      class: 'stream-guide', x1: 0, x2: 0, y1: m.t, y2: H - m.b,
      opacity: 0
    });
    svg.appendChild(guide);
    const overlay = svgEl('rect', {
      x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent', class: 'hit'
    });
    svg.appendChild(overlay);

    const tipForYear = (i, e) => {
      const sorted = series
        .map((s) => ({ name: s.name, value: s.values[i], color: s.color }))
        .filter((s) => s.value > 0.01)
        .sort((a, b) => b.value - a.value);
      const rows = sorted.slice(0, 4).map((s) =>
        `<span class="tt-muted">${esc(s.name)}</span> — ${fmtNum(s.value, 1)} млн`).join('<br>');
      showTip(`<strong>${years[i]}</strong><span class="tt-muted">Всего: ${fmtNum(totals[i], 1)} млн копий</span><br>${rows}`, e);
      guide.setAttribute('x1', x(i));
      guide.setAttribute('x2', x(i));
      guide.setAttribute('opacity', '0.55');
    };

    overlay.addEventListener('pointermove', (e) => {
      const rect = svg.getBoundingClientRect();
      const local = (e.clientX - rect.left) / rect.width * W;
      const idx = Math.max(0, Math.min(n - 1, Math.round((local - m.l) / pw * (n - 1))));
      tipForYear(idx, e);
    });
    overlay.addEventListener('pointerleave', () => {
      guide.setAttribute('opacity', '0');
      hideTip();
    });

    host.appendChild(svg);
    host.setAttribute('aria-label', `Потоковая диаграмма: пик продаж в ${years[peakIdx]} году, ${fmtSales(totals[peakIdx])} копий`);
  }

  // ------------------------------------------------------------------
  // SUNBURST
  // ------------------------------------------------------------------
  function compactSunburst(groups) {
    const explicit = groups.filter((g) => g.id !== 'Other');
    const baseOther = groups.find((g) => g.id === 'Other');
    const head = explicit.slice(0, 6);
    const rest = explicit.slice(6);
    if (!rest.length) return groups;

    const tail = rest.concat(baseOther ? [baseOther] : []);
    const value = sum(tail.map((g) => g.value));
    const fMap = new Map();
    tail.forEach((g) => (g.families || []).forEach((f) => {
      fMap.set(f.name, (fMap.get(f.name) || 0) + f.value);
    }));
    const families = Array.from(fMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, v]) => ({ name, value: v }));
    return head.concat([{
      id: 'Other',
      name: 'Остальные жанры',
      color: '#d8cfc0',
      value,
      families
    }]);
  }

  function readableText(hex) {
    const value = hex.replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#191b20' : '#fffdf8';
  }

  function renderSunburst(c) {
    const host = $('#sunburstChart');
    if (!host) return;
    host.innerHTML = '';

    const W = 820;
    const H = 660;
    const cx = W / 2;
    const cy = H / 2;
    const r0 = 78;
    const r1 = 170;
    const r2 = 288;
    const pad = 0.009;
    const outerPad = 0.002;
    const groups = c.hierarchy;
    const total = sum(groups.map((g) => g.value)) || 1;

    const famColor = new Map(DATA.families.map((f) => [f.id, f.color]));

    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Sunburst: жанры и платформы'
    });

    const familyLabels = new Map();
    let angle = -Math.PI / 2;
    groups.forEach((g) => {
      const span = (g.value / total) * Math.PI * 2;
      const a0 = angle + pad;
      const a1 = angle + span - pad;
      if (a1 > a0) {
        const seg = svgEl('path', {
          d: arcPath(cx, cy, r0, r1, a0, a1),
          fill: g.color,
          class: 'sun-seg',
          'data-genre': g.id
        });
        seg.addEventListener('pointerenter', () => highlightSun(svg, g.id));
        seg.addEventListener('pointerleave', () => highlightSun(svg, null));
        const title = svgEl('title');
        title.textContent = `${g.name}: ${fmtExact(g.value)} (${fmtPct(g.value / total * 100)})`;
        seg.appendChild(title);
        bindTip(seg, `<strong>${esc(g.name)}</strong><span class="tt-muted">${fmtExact(g.value)} · ${fmtPct(g.value / total * 100)}</span>`);
        svg.appendChild(seg);

        if (span > 0.12) {
          const mid = (a0 + a1) / 2;
          const [lx, ly] = polar(cx, cy, (r0 + r1) / 2, mid);
          const deg = mid * 180 / Math.PI;
          const flip = deg > 90 && deg < 270;
          svg.appendChild(textEl(0, 0, g.name, {
            class: 'sun-label',
            fill: readableText(g.color),
            transform: `translate(${lx},${ly}) rotate(${flip ? deg + 180 : deg})`,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle'
          }));
        }
      }

      let local = angle;
      (g.families || []).forEach((p) => {
        const pspan = (p.value / g.value) * span;
        const pa0 = local + outerPad;
        const pa1 = local + pspan - outerPad;
        if (pa1 > pa0) {
          const fam = p.name || 'Other';
          const seg = svgEl('path', {
            d: arcPath(cx, cy, r1 + 5, r2, pa0, pa1),
            fill: famColor.get(fam) || '#a7a196',
            class: 'sun-seg',
            'data-genre': g.id,
            opacity: 0.76
          });
          const famName = (DATA.families.find((f) => f.id === fam) || {}).name || fam;
          const title = svgEl('title');
          title.textContent = `${g.name} / ${famName}: ${fmtExact(p.value)} (${fmtPct(p.value / total * 100)})`;
          seg.appendChild(title);
          bindTip(seg, `<strong>${esc(famName)}</strong><span class="tt-muted">${esc(g.name)} · ${fmtExact(p.value)} · ${fmtPct(p.value / total * 100)} от всех продаж</span>`);
          svg.appendChild(seg);
          const prev = familyLabels.get(fam);
          if (!prev || p.value > prev.value) {
            familyLabels.set(fam, {
              value: p.value,
              mid: (pa0 + pa1) / 2,
              name: famName,
              color: famColor.get(fam) || '#a7a196'
            });
          }
        }
        local += pspan;
      });
      angle += span;
    });

    // подписи семейств — снаружи кольца, с выноской того же цвета
    familyLabels.forEach((item) => {
      const [sx, sy] = polar(cx, cy, r2 + 2, item.mid);
      const [ex, ey] = polar(cx, cy, r2 + 24, item.mid);
      const [lx, ly] = polar(cx, cy, r2 + 28, item.mid);
      const cos = Math.cos(item.mid);
      const anchor = cos > 0.25 ? 'start' : cos < -0.25 ? 'end' : 'middle';
      svg.appendChild(svgEl('line', {
        x1: sx, y1: sy, x2: ex, y2: ey,
        stroke: item.color,
        'stroke-width': 1.7,
        opacity: 0.95
      }));
      svg.appendChild(textEl(lx, ly + 3, item.name, {
        class: 'sun-label-out',
        'text-anchor': anchor,
        'dominant-baseline': 'middle'
      }));
    });

    svg.appendChild(textEl(cx, cy - 10, fmtSales(total), {
      class: 'sun-center-value', 'text-anchor': 'middle'
    }));
    svg.appendChild(textEl(cx, cy + 14, 'копий', {
      class: 'sun-center-label', 'text-anchor': 'middle'
    }));
    svg.appendChild(textEl(cx, cy + 36, `${regionName()} · ${periodName()}`, {
      class: 'sun-center-label', 'text-anchor': 'middle'
    }));

    host.appendChild(svg);
    host.setAttribute('aria-label', `Sunburst: ${groups[0] ? groups[0].name : ''} — крупнейший жанр, ${fmtSales(total)} копий`);
  }

  function highlightSun(svg, genre) {
    svg.querySelectorAll('.sun-seg').forEach((seg) => {
      seg.classList.toggle('is-dim', Boolean(genre) && seg.dataset.genre !== genre);
    });
  }

  function bindTip(node, html) {
    node.addEventListener('pointerenter', (e) => showTip(html, e));
    node.addEventListener('pointermove', (e) => showTip(html, e));
    node.addEventListener('pointerleave', hideTip);
  }

  // ------------------------------------------------------------------
  // BUBBLE
  // ------------------------------------------------------------------
  function renderBubble(c) {
    const host = $('#bubbleChart');
    if (!host) return;
    host.innerHTML = '';

    const W = 1000;
    const H = 520;
    const m = { l: 72, r: 34, t: 30, b: 58 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const rows = c.platforms.filter((p) => p.releases > 0 && p.sales > 0);
    if (!rows.length) {
      host.innerHTML = '<p class="empty">Нет данных за выбранный срез.</p>';
      return;
    }

    const maxR = Math.max(...rows.map((p) => p.releases), 10);
    const maxS = Math.max(...rows.map((p) => p.sales), 1);
    const maxA = Math.max(...rows.map((p) => p.avg), 0.1);
    const logMin = Math.log10(1);
    const logMax = Math.log10(maxR);
    const x = (v) => m.l + ((Math.log10(Math.max(1, v)) - logMin) / (logMax - logMin)) * pw;
    const y = (v) => m.t + ph - (v / maxS) * ph;
    const radius = (v) => 5 + Math.sqrt(Math.max(0, v) / maxA) * 21;

    const famColor = new Map(DATA.families.map((f) => [f.id, f.color]));
    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Пузырьковая диаграмма платформ: число релизов и продажи'
    });

    // Горизонтальная сетка и ось Y
    const niceMax = Math.ceil(maxS / 250) * 250;
    for (let i = 0; i <= 4; i += 1) {
      const val = (niceMax / 4) * i;
      const yy = y(val);
      svg.appendChild(svgEl('line', {
        x1: m.l, x2: W - m.r, y1: yy, y2: yy,
        class: i === 0 ? 'axis-line' : 'grid-line'
      }));
      svg.appendChild(textEl(m.l - 10, yy + 3, fmtNum(val, 0), {
        'text-anchor': 'end', class: 'tick'
      }));
    }

    // Ось X: логарифмические отметки
    const candidates = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    candidates.filter((v) => v <= maxR * 1.15).forEach((v) => {
      const xx = x(v);
      svg.appendChild(svgEl('line', {
        x1: xx, x2: xx, y1: H - m.b, y2: H - m.b + 5, class: 'axis-line'
      }));
      svg.appendChild(textEl(xx, H - m.b + 19, v >= 1000 ? `${v / 1000}к` : v, {
        'text-anchor': 'middle', class: 'tick'
      }));
    });

    svg.appendChild(textEl(m.l + pw / 2, H - 8, 'Число релизов (логарифмическая шкала)', {
      'text-anchor': 'middle', class: 'bubble-axis-label'
    }));
    svg.appendChild(textEl(18, m.t + ph / 2, 'Суммарные продажи, млн копий', {
      'text-anchor': 'middle', class: 'bubble-axis-label',
      transform: `rotate(-90 18 ${m.t + ph / 2})`
    }));

    // Пузыри
    const sorted = rows.slice().sort((a, b) => a.sales - b.sales);
    sorted.forEach((p) => {
      const cx = x(p.releases);
      const cy = y(p.sales);
      const r = radius(p.avg);
      const circle = svgEl('circle', {
        cx, cy, r,
        fill: '#2f5bea',
        class: 'bubble',
        opacity: 0.76
      });
      const title = svgEl('title');
      title.textContent = `${p.name}: ${p.releases} релизов, ${fmtExact(p.sales)}, в среднем ${fmtExact(p.avg)}`;
      circle.appendChild(title);
      bindTip(circle, `<strong>${esc(p.name)}</strong><span class="tt-muted">${p.releases} релизов · ${fmtExact(p.sales)} · в среднем ${fmtExact(p.avg)}</span>`);
      svg.appendChild(circle);
    });

    // Подписи: не более 10, без наложений
    const labelled = [];
    rows.slice().sort((a, b) => b.sales - a.sales).forEach((p) => {
      if (labelled.length >= 10) return;
      const cx = x(p.releases);
      const cy = y(p.sales);
      if (labelled.some((q) => Math.hypot(q.cx - cx, q.cy - cy) < 72)) return;
      labelled.push({ cx, cy, p });
    });
    labelled.forEach(({ cx, cy, p }) => {
      const r = radius(p.avg);
      let ly = cy - r - 6;
      if (ly < m.t + 10) ly = cy + r + 13;
      svg.appendChild(textEl(cx, ly, p.short, {
        'text-anchor': 'middle', class: 'bubble-label'
      }));
    });

    host.appendChild(svg);
    host.setAttribute('aria-label', `Пузырьковая диаграмма: ${rows.length} платформ, лидер по продажам ${rows[0].name}`);
  }

  // ------------------------------------------------------------------
  // LEGENDS / INSIGHTS / TABLE
  // ------------------------------------------------------------------
  function renderGenreLegend(c, hostId = 'genreLegend', groups = null) {
    const host = $('#' + hostId);
    if (!host) return;
    host.innerHTML = '';
    (groups || c.hierarchy).forEach((g) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.title = `${g.name}: ${fmtPct(g.value / c.stats.sales * 100)} продаж`;
      item.innerHTML = `<i class="legend-dot" style="background:${g.color}"></i>${esc(g.name)}`;
      host.appendChild(item);
    });
  }

  function renderFamilyLegend(c, hostId) {
    const host = $('#' + hostId);
    if (!host) return;
    const present = new Set(c.platforms.map((p) => p.family));
    host.innerHTML = '';
    DATA.families.filter((f) => present.has(f.id)).forEach((f) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      item.innerHTML = `<i class="legend-dot" style="background:${f.color}"></i>${esc(f.name)}`;
      host.appendChild(item);
    });
  }

  function renderInsights(c) {
    const stats = c.stats;
    const top = c.hierarchy[0];
    const topShare = top ? top.value / stats.sales * 100 : 0;
    const peak = c.stream.totals.indexOf(Math.max(...c.stream.totals));
    const peakYear = c.stream.years[peak];
    const peakTotal = c.stream.totals[peak];

    const streamBox = $('#streamInsight');
    if (streamBox) {
      streamBox.innerHTML = `<span class="big">${peakYear}: ${fmtSales(peakTotal)}</span>
        Пик продаж за период. Главный жанр — <strong>${esc(top.name)}</strong>:
        ${fmtPct(topShare)} всех копий.`;
    }
    const streamPeak = $('#streamPeak');
    if (streamPeak) streamPeak.textContent = `Пик: ${peakYear} · ${fmtSales(peakTotal)}`;

    const sunBox = $('#sunburstInsight');
    if (sunBox) {
      const p = top && (top.families || [])[0];
      sunBox.innerHTML = `<span class="big">${esc(top.name)} — ${fmtPct(topShare)}</span>
        ${p ? `Ведущее семейство платформ — <strong>${esc(p.name)}</strong> (${fmtPct(p.value / top.value * 100)}).` : ''}
        Всего в срезе — ${fmtExact(stats.sales)}.`;
    }
    const sunTotal = $('#sunburstTotal');
    if (sunTotal) sunTotal.textContent = `Всего: ${fmtSales(stats.sales)}`;
    const sunFoot = $('#sunburstFoot');
    if (sunFoot) {
      sunFoot.textContent = 'Внешнее кольцо — семейства платформ: Nintendo, PlayStation, Xbox, Sega, Atari, PC, другие.';
    }
    const sunTitle = $('#sunburstTitle');
    if (sunTitle) sunTitle.textContent = `${regionName()} · ${periodName()}`;

    const bubbleBox = $('#bubbleInsight');
    if (bubbleBox) {
      const leader = c.platforms[0];
      const best = c.platforms.filter((p) => p.releases >= 5)
        .slice().sort((a, b) => b.avg - a.avg)[0];
      bubbleBox.innerHTML = `<span class="big">${esc(leader.name)} — ${fmtSales(leader.sales)}</span>
        Лидер по суммарным продажам. Лучшая средняя отдача — у
        <strong>${esc(best.name)}</strong>: ${fmtNum(best.avg, 2)} млн копий на релиз.`;
    }
    const bubbleCount = $('#bubbleCount');
    if (bubbleCount) bubbleCount.textContent = `${c.platforms.length} платформ`;
  }

  // ------------------------------------------------------------------
  // HEATMAP
  // ------------------------------------------------------------------
  function renderHeatmap(c) {
    const host = $('#heatmapChart');
    const scaleHost = $('#heatmapScale');
    if (!host) return;
    host.innerHTML = '';
    if (scaleHost) scaleHost.innerHTML = '';

    const rows = c.heatmap.platforms;
    const years = c.heatmap.years;
    if (!rows.length || !years.length) {
      host.innerHTML = '<p class="empty">Нет данных за выбранный срез.</p>';
      return;
    }

    const W = 1000;
    const H = Math.max(360, 46 + rows.length * 34);
    const m = { l: 84, r: 24, t: 26, b: 42 };
    const pw = W - m.l - m.r;
    const ph = H - m.t - m.b;
    const n = years.length;
    const cellW = pw / n;
    const cellH = ph / rows.length;
    const max = Math.max(...rows.flatMap((r) => r.values), 0.1);

    const stops = [
      [0, [244, 241, 233]],
      [0.45, [158, 180, 240]],
      [1, [31, 54, 144]]
    ];
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const color = (v) => {
      const t = Math.min(1, Math.sqrt(Math.max(0, v) / max));
      for (let i = 1; i < stops.length; i += 1) {
        if (t <= stops[i][0]) {
          const [t0, c0] = stops[i - 1];
          const [t1, c1] = stops[i];
          return `rgb(${mix(c0, c1, (t - t0) / (t1 - t0)).join(',')})`;
        }
      }
      return `rgb(${stops[stops.length - 1][1].join(',')})`;
    };

    const svg = svgEl('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Тепловая карта продаж платформ по годам'
    });

    const xAt = (i) => m.l + i * cellW;

    // подписи платформ
    rows.forEach((row, ri) => {
      svg.appendChild(textEl(m.l - 9, m.t + ri * cellH + cellH / 2 + 3, row.short, {
        'text-anchor': 'end', class: 'chart-label', 'font-size': 10
      }));
    });

    // клетки
    rows.forEach((row, ri) => {
      row.values.forEach((v, yi) => {
        const cell = svgEl('rect', {
          x: xAt(yi),
          y: m.t + ri * cellH,
          width: Math.max(0.5, cellW - 1),
          height: Math.max(0.5, cellH - 1),
          fill: color(v),
          rx: 1
        });
        const title = svgEl('title');
        title.textContent = `${row.short}, ${years[yi]}: ${fmtExact(v)}`;
        cell.appendChild(title);
        bindTip(cell, `<strong>${esc(row.name)}</strong><span class="tt-muted">${years[yi]} · ${fmtExact(v)}</span>`);
        svg.appendChild(cell);
      });
      const pi = row.values.indexOf(Math.max(...row.values));
      if (pi >= 0 && row.values[pi] > 0) {
        svg.appendChild(svgEl('rect', {
          x: xAt(pi) + 1,
          y: m.t + ri * cellH + 1,
          width: Math.max(1, cellW - 3),
          height: Math.max(1, cellH - 3),
          fill: 'none',
          stroke: '#191b20',
          'stroke-width': 1.3,
          rx: 1
        }));
      }
    });

    // ось X
    const step = n <= 12 ? 1 : n <= 20 ? 2 : 5;
    years.forEach((year, i) => {
      if (i !== 0 && i !== n - 1 && year % step !== 0) return;
      svg.appendChild(textEl(xAt(i) + cellW / 2, H - m.b + 19, year, {
        'text-anchor': 'middle', class: 'tick'
      }));
    });

    host.appendChild(svg);

    const top = rows[0];
    const insight = $('#timelineInsight');
    if (insight) {
      insight.innerHTML = `<span class="big">${esc(top.short)} — пик в ${top.peakYear}</span>
        ${fmtSales(top.peakValue)} копий в лучший год. Карта показывает, как поколения платформ сменяют друг друга.`;
    }
    const range = $('#timelineRange');
    if (range) range.textContent = periodName();
    const count = $('#timelineCount');
    if (count) count.textContent = `${rows.length} платформ`;

    if (scaleHost) {
      scaleHost.innerHTML = `<span>0</span><i style="background:linear-gradient(90deg,#f4f1e9,#9eb4f0,#1f3690)"></i><span>${fmtSales(max)}</span>`;
    }
  }

  function renderTopGames(c) {
    const body = $('#topGamesBody');
    if (!body) return;
    body.innerHTML = '';
    if (!c.topGames.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'Нет данных за выбранный срез.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    c.topGames.forEach((g, i) => {
      const tr = document.createElement('tr');
      const cells = [
        String(i + 1).padStart(2, '0'),
        g.title,
        g.platform,
        String(g.year),
        g.genre,
        fmtNum(g.sales, 1)
      ];
      cells.forEach((value, idx) => {
        const td = document.createElement('td');
        if (idx === 5) td.className = 'num';
        td.textContent = value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  function updateSummary(c) {
    const sales = $('#selectionSales');
    const releases = $('#selectionReleases');
    if (sales) sales.textContent = `${fmtSales(c.stats.sales)} копий`;
    if (releases) releases.textContent = `${fmtNum(c.stats.releases, 0)} релизов`;
    $('#heroSales').textContent = '8,75 млрд';
    $('#heroReleases').textContent = '15 973';
    $('#heroTitles').textContent = '11 161';
    const range = $('#streamRange');
    if (range) range.textContent = periodName();
  }

  function renderAll() {
    const c = currentCombo();
    if (!c) return;
    updateSummary(c);
    renderStream(c);
    renderSunburst(c);
    renderBubble(c);
    renderInsights(c);
    renderTopGames(c);
    renderHeatmap(c);
    updateUrl();
    centerCharts();
  }

  function renderSizeLegend(c) {
    const host = $('#bubbleSizeLegend');
    if (!host) return;
    const vals = [0.5, 1, 2.5];
    const maxA = Math.max(...c.platforms.map((p) => p.avg), 0.1);
    host.innerHTML = '<span>Средние продажи на релиз:</span>' + vals.map((v) => {
      const r = 5 + Math.sqrt(v / maxA) * 21;
      return `<span><i class="size-dot" style="width:${r * 2}px;height:${r * 2}px"></i>${fmtNum(v, 1)} млн</span>`;
    }).join('');
  }


  function centerCharts() {
    if (window.innerWidth > 860) return;
    const stream = $('#streamChart');
    const bubble = $('#bubbleChart');
    const heat = $('#heatmapChart');
    if (stream) stream.scrollLeft = Math.max(0, stream.scrollWidth - stream.clientWidth);
    if (bubble) bubble.scrollLeft = Math.max(0, bubble.scrollWidth - bubble.clientWidth);
    if (heat) heat.scrollLeft = 0;
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(window.__chartResize);
    window.__chartResize = window.setTimeout(centerCharts, 200);
  });

  // ------------------------------------------------------------------
  // FILTERS
  // ------------------------------------------------------------------
  function readUrl() {
    const p = new URLSearchParams(window.location.search);
    if (DATA.regions.some((r) => r.id === p.get('region'))) state.region = p.get('region');
    if (DATA.periods.some((x) => x.id === p.get('period'))) state.period = p.get('period');
  }

  function updateUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('region', state.region);
    url.searchParams.set('period', state.period);
    try { history.replaceState(null, '', url); } catch (e) { /* file:// */ }
  }

  function initFilters() {
    const rs = $('#regionSelect');
    const ps = $('#periodSelect');
    if (rs) rs.value = state.region;
    if (ps) ps.value = state.period;
    const apply = () => {
      if (rs) state.region = rs.value;
      if (ps) state.period = ps.value;
      renderAll();
    };
    rs && rs.addEventListener('change', apply);
    ps && ps.addEventListener('change', apply);
    const reset = $('#resetBtn');
    reset && reset.addEventListener('click', () => {
      state.region = 'global';
      state.period = 'all';
      if (rs) rs.value = 'global';
      if (ps) ps.value = 'all';
      renderAll();
    });
  }

  readUrl();
  initFilters();
  renderAll();
})();
