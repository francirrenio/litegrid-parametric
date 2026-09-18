// Geometria paramétrica do organizador modular de gavetas.
// Tudo é construído por adição (sem booleanas): sólidos = caixas e prismas convexos.
// Eixos do modelo: X = largura, Y = altura (para cima), Z = profundidade (+Z = frente).

const D2R = Math.PI / 180;
const RAIL_HW_IN = 5.0;   // meia-largura do trilho de empilhamento na base
const RAIL_HW_TOP = 3.2;  // meia-largura no topo (cônico: imprime e desliza sem suporte)
const RAIL_H = 3.0;
const DOVE_Z_IN = 3.0;    // encaixe lateral: meia-profundidade junto à parede
const DOVE_Z_OUT = 4.6;   // ... e na ponta (cauda de andorinha)
const DOVE_X = 3.2;
const RIB_W = 2.2;

export const defaults = {
  larg: 130,
  prof: 120,
  parede: 1.2,
  folga: 0.4,
  rows: [{ h: 30, div: 3 }, { h: 40, div: 2 }, { h: 56, div: 1 }],
  vazado: 1,
  passo: 15,
  strut: 1.6,
  gusset: 6,
  empilhar: 1,
  lateral: 1,
  puxador: 'recorte',
  etiqueta: 1,
};

export const PRESETS = {
  parafusos: { larg: 130, prof: 120, rows: [{ h: 26, div: 4 }, { h: 34, div: 3 }, { h: 46, div: 2 }, { h: 60, div: 1 }], parede: 1.2, folga: 0.4, vazado: 1, passo: 14 },
  smd: { larg: 100, prof: 90, rows: [{ h: 20, div: 4 }, { h: 20, div: 4 }, { h: 20, div: 4 }, { h: 20, div: 4 }], parede: 1.0, folga: 0.35, vazado: 1, passo: 11 },
  ferramentas: { larg: 180, prof: 150, rows: [{ h: 48, div: 2 }, { h: 70, div: 1 }], parede: 1.6, folga: 0.5, vazado: 0, passo: 20 },
};

/* ── triangulação ───────────────────────────────────────────────── */

function xf(p, s) {
  let [x, y, z] = p;
  if (s.rx) { const c = Math.cos(s.rx), n = Math.sin(s.rx); const y2 = y * c - z * n; z = y * n + z * c; y = y2; }
  if (s.ry) { const c = Math.cos(s.ry), n = Math.sin(s.ry); const x2 = x * c + z * n; z = -x * n + z * c; x = x2; }
  if (s.rz) { const c = Math.cos(s.rz), n = Math.sin(s.rz); const x2 = x * c - y * n; y = x * n + y * c; x = x2; }
  return [x + (s.x || 0), y + (s.y || 0), z + (s.z || 0)];
}

const BOX_QUADS = [
  [4, 5, 6, 7], [0, 3, 2, 1], [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4],
];

function pushBox(out, s) {
  const hw = s.w / 2, hh = s.h / 2, hd = s.d / 2;
  const c = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
  ].map((p) => xf(p, s));
  for (const q of BOX_QUADS) {
    push3(out, c[q[0]], c[q[1]], c[q[2]]);
    push3(out, c[q[0]], c[q[2]], c[q[3]]);
  }
}

function shoelace(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

function pushPoly(out, s) {
  let pts = s.pts;
  if (shoelace(pts) < 0) pts = pts.slice().reverse();
  const axis = s.axis || 'z', h = s.d / 2, n = pts.length;
  const to3 = (u, v, w) => (axis === 'z' ? [u, v, w] : axis === 'y' ? [v, w, u] : [w, u, v]);
  const A = pts.map((p) => xf(to3(p[0], p[1], -h), s));
  const B = pts.map((p) => xf(to3(p[0], p[1], h), s));
  for (let i = 1; i < n - 1; i++) {
    push3(out, B[0], B[i], B[i + 1]);
    push3(out, A[0], A[i + 1], A[i]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    push3(out, A[i], A[j], B[j]);
    push3(out, A[i], B[j], B[i]);
  }
}

function push3(out, a, b, c) {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

export function triangulate(solids) {
  const out = [];
  for (const s of solids) (s.t === 'poly' ? pushPoly : pushBox)(out, s);
  return out;
}

export function volume(solids) {
  let v = 0;
  for (const s of solids) v += s.t === 'poly' ? Math.abs(shoelace(s.pts)) * s.d : s.w * s.h * s.d;
  return v; // mm³ — estimativa: sobreposições entre sólidos contam duas vezes
}

export function bbox(tris) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const c = tris[i + k];
      if (c < lo[k]) lo[k] = c;
      if (c > hi[k]) hi[k] = c;
    }
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

/* ── painéis sólidos ou vazados (treliça a 45°, sem suporte) ────── */

function panel(out, o) {
  const { plane, U, V, thick, cu, cv, cn } = o;
  const put = (lu, lv, pu, pv, rot) => {
    if (plane === 'yz') out.push({ t: 'box', w: thick, h: lv, d: lu, x: cn, y: pv, z: pu, rx: rot });
    else if (plane === 'xy') out.push({ t: 'box', w: lu, h: lv, d: thick, x: pu, y: pv, z: cn, rz: rot });
    else out.push({ t: 'box', w: lu, h: thick, d: lv, x: pu, y: cn, z: pv, ry: rot });
  };
  if (!o.open) { put(U, V, cu, cv, 0); return; }
  const fr = Math.max(2.4, o.strut * 1.6);
  if (U <= 2 * fr + 2 || V <= 2 * fr + 2) { put(U, V, cu, cv, 0); return; }
  put(U, fr, cu, cv - V / 2 + fr / 2, 0);
  put(U, fr, cu, cv + V / 2 - fr / 2, 0);
  put(fr, V - 2 * fr, cu - U / 2 + fr / 2, cv, 0);
  put(fr, V - 2 * fr, cu + U / 2 - fr / 2, cv, 0);

  const iw = U - 2 * fr, ih = V - 2 * fr;
  const sign = plane === 'xy' ? 1 : -1;
  const step = Math.max(6, o.step) * Math.SQRT2;
  const span = (iw + ih) / 2;
  for (let fam = 0; fam < 2; fam++) {
    const rot = (fam === 0 ? sign : -sign) * 45 * D2R;
    for (let c = -span; c <= span + 1e-6; c += step) {
      let u0, u1;
      if (fam === 0) { u0 = Math.max(-iw / 2, -ih / 2 + c); u1 = Math.min(iw / 2, ih / 2 + c); }
      else { u0 = Math.max(-iw / 2, c - ih / 2); u1 = Math.min(iw / 2, c + ih / 2); }
      if (u1 - u0 < o.strut * 1.5) continue;
      const um = (u0 + u1) / 2;
      const vm = fam === 0 ? um - c : -um + c;
      put((u1 - u0) * Math.SQRT2, o.strut, cu + um, cv + vm, rot);
    }
  }
}

/* ── modelo ─────────────────────────────────────────────────────── */

function layout(p) {
  const t = p.parede, base = p.empilhar ? RAIL_H + p.folga + t : t;
  const postW = t * 2.2;
  const Wi = p.larg - 2 * postW;
  const cells = [];
  let y = base;
  p.rows.forEach((r, i) => {
    const div = Math.max(1, Math.round(r.div));
    const cw = (Wi - (div - 1) * t) / div;
    // a mão-francesa da prateleira de cima invade o alto da célula junto às laterais:
    // as paredes da gaveta descem o bastante para passar por baixo dela
    const rel = gussetRelief(p, i);
    for (let j = 0; j < div; j++) {
      cells.push({ row: i, col: j, y0: y, h: r.h, cw, rel, x: -Wi / 2 + j * (cw + t) + cw / 2 });
    }
    y += r.h + t;
  });
  return { t, base, postW, Wi, cells, H: y, rowsY: p.rows.map((r, i) => cells.find((c) => c.row === i).y0) };
}

// quanto a mão-francesa acima da linha `i` avança para dentro da célula, em altura
function gussetRelief(p, i) {
  if (!(p.gusset > 0.5) || i >= p.rows.length - 1) return 0;
  return Math.max(0, p.gusset - 1.2 * p.parede) + p.folga;
}

function shell(p, L) {
  const S = [], { t, base, postW, Wi, H } = L, W = p.larg, D = p.prof, f = p.folga;
  const open = !!p.vazado;

  if (p.empilhar) {
    const gw = RAIL_HW_IN + f, sw = W / 2 - gw;
    if (sw > 1) {
      S.push({ t: 'box', w: sw, h: base, d: D, x: -(gw + W / 2) / 2, y: base / 2, z: 0 });
      S.push({ t: 'box', w: sw, h: base, d: D, x: (gw + W / 2) / 2, y: base / 2, z: 0 });
    }
    S.push({ t: 'box', w: 2 * gw, h: t, d: D, x: 0, y: RAIL_H + f + t / 2, z: 0 });
    S.push({
      t: 'poly', axis: 'z', d: D * 0.82, x: 0, y: H, z: 0,
      pts: [[-RAIL_HW_IN, 0], [RAIL_HW_IN, 0], [RAIL_HW_TOP, RAIL_H], [-RAIL_HW_TOP, RAIL_H]],
    });
  } else {
    S.push({ t: 'box', w: W, h: t, d: D, x: 0, y: t / 2, z: 0 });
  }

  // laterais, costas e topo
  panel(S, { plane: 'yz', U: D, V: H, thick: t, cu: 0, cv: H / 2, cn: -(W / 2 - t / 2), open, step: p.passo, strut: p.strut });
  panel(S, { plane: 'yz', U: D, V: H, thick: t, cu: 0, cv: H / 2, cn: (W / 2 - t / 2), open, step: p.passo, strut: p.strut });
  panel(S, { plane: 'xy', U: W, V: H, thick: t, cu: 0, cv: H / 2, cn: -(D / 2 - t / 2), open, step: p.passo, strut: p.strut });
  panel(S, { plane: 'xz', U: W, V: D, thick: t, cu: 0, cv: 0, cn: H - t / 2, open, step: p.passo, strut: p.strut });

  // montantes frontais
  S.push({ t: 'box', w: postW, h: H, d: t * 1.8, x: -(W / 2 - postW / 2), y: H / 2, z: D / 2 - t * 0.9 });
  S.push({ t: 'box', w: postW, h: H, d: t * 1.8, x: (W / 2 - postW / 2), y: H / 2, z: D / 2 - t * 0.9 });

  // prateleiras (a última "prateleira" é o topo), divisórias e mãos-francesas a 45°
  const g = p.gusset;
  p.rows.forEach((r, i) => {
    const y0 = L.rowsY[i], top = y0 + r.h;
    if (i < p.rows.length - 1) {
      panel(S, { plane: 'xz', U: W - 2 * t, V: D - t, thick: t, cu: 0, cv: t / 2, cn: top + t / 2, open, step: p.passo, strut: p.strut });
      if (open) {
        const nx = p.rows[i + 1], nd = Math.max(1, Math.round(nx.div)), ncw = (Wi - (nd - 1) * t) / nd;
        for (let j = 0; j < nd; j++) {
          const cx = -Wi / 2 + j * (ncw + t) + ncw / 2;
          for (const s of [-1, 1]) S.push({ t: 'box', w: 7, h: t, d: D - t, x: cx + s * (ncw / 2 - 4.5), y: top + t / 2, z: t / 2 });
        }
      }
    }
    const div = Math.max(1, Math.round(r.div));
    const cw = (Wi - (div - 1) * t) / div;
    for (let j = 1; j < div; j++) {
      S.push({ t: 'box', w: t, h: r.h, d: D - t, x: -Wi / 2 + j * (cw + t) - t / 2, y: y0 + r.h / 2, z: t / 2 });
    }
    if (g > 0.5 && i < p.rows.length - 1) {
      const xi = W / 2 - t;
      S.push({ t: 'poly', axis: 'z', d: D - t, x: -xi, y: top, z: t / 2, pts: [[0, 0], [0, -g], [g, 0]] });
      S.push({ t: 'poly', axis: 'z', d: D - t, x: xi, y: top, z: t / 2, pts: [[0, 0], [0, -g], [-g, 0]] });
    }
  });

  // encaixe lateral: cauda de andorinha na direita, canal (duas nervuras) na esquerda
  if (p.lateral) {
    const hy = H * 0.72, cy = H / 2, xr = W / 2;
    S.push({
      t: 'poly', axis: 'y', d: hy, x: 0, y: cy, z: 0,
      pts: [[-DOVE_Z_IN, xr], [DOVE_Z_IN, xr], [DOVE_Z_OUT, xr + DOVE_X], [-DOVE_Z_OUT, xr + DOVE_X]],
    });
    for (const s of [1, -1]) {
      const zi = s * (DOVE_Z_IN + f), zo = s * (DOVE_Z_OUT + f);
      S.push({
        t: 'poly', axis: 'y', d: hy, x: 0, y: cy, z: 0,
        pts: [[zi, -xr], [zi + s * RIB_W, -xr], [zo + s * RIB_W, -xr - DOVE_X], [zo, -xr - DOVE_X]],
      });
    }
  }
  return S;
}

function drawer(p, cw, rh, rel) {
  const S = [], t = p.parede, f = p.folga, open = !!p.vazado;
  const dw = cw - 2 * f, dh = Math.max(t * 3, rh - f - 0.8 - (rel || 0)), dd = p.prof - t - 2;
  const fz = dd / 2, ft = t * 1.6;

  S.push({ t: 'box', w: dw, h: t, d: dd, x: 0, y: t / 2, z: 0 });
  panel(S, { plane: 'yz', U: dd, V: dh, thick: t, cu: 0, cv: dh / 2, cn: -(dw / 2 - t / 2), open, step: p.passo, strut: p.strut });
  panel(S, { plane: 'yz', U: dd, V: dh, thick: t, cu: 0, cv: dh / 2, cn: (dw / 2 - t / 2), open, step: p.passo, strut: p.strut });
  panel(S, { plane: 'xy', U: dw, V: dh, thick: t, cu: 0, cv: dh / 2, cn: -(dd / 2 - t / 2), open, step: p.passo, strut: p.strut });

  if (p.puxador === 'recorte') {
    const low = Math.max(t * 2, dh * 0.7), oh = dh - low;
    const notch = Math.min(Math.max(9, Math.min(30, dw * 0.24)) + 2 * oh * 0.82, dw * 0.78);
    const r = Math.min(oh * 0.82, (notch - Math.max(6, notch * 0.3)) / 2), side = (dw - notch) / 2;
    S.push({ t: 'box', w: side, h: dh, d: ft, x: -(dw - side) / 2, y: dh / 2, z: fz - ft / 2 });
    S.push({ t: 'box', w: side, h: dh, d: ft, x: (dw - side) / 2, y: dh / 2, z: fz - ft / 2 });
    S.push({ t: 'box', w: notch, h: low, d: ft, x: 0, y: low / 2, z: fz - ft / 2 });
    for (const s of [-1, 1]) {
      S.push({
        t: 'poly', axis: 'z', d: ft, x: 0, y: 0, z: fz - ft / 2,
        pts: [[(s * notch) / 2, low], [(s * (notch - 2 * r)) / 2, low], [(s * notch) / 2, low + r]],
      });
    }
  } else {
    S.push({ t: 'box', w: dw, h: dh, d: ft, x: 0, y: dh / 2, z: fz - ft / 2 });
    if (p.puxador === 'barra') {
      const by = dh * 0.72, bw = dw * 0.55, off = 7;
      S.push({ t: 'box', w: bw, h: t * 2, d: t * 2, x: 0, y: by, z: fz + off });
      for (const s of [-1, 1]) {
        S.push({
          t: 'poly', axis: 'x', d: t * 1.6, x: s * (bw / 2 - t), y: 0, z: 0,
          pts: [[by + t, fz], [by - off, fz], [by, fz + off]],
        });
      }
    }
  }

  if (p.etiqueta) {
    const lw = dw * 0.62, slot = Math.min(13, dh * 0.5), y0 = Math.max(t * 1.5, dh * 0.12);
    for (const y of [y0, y0 + slot]) {
      S.push({ t: 'box', w: lw, h: 0.9, d: 2.6, x: 0, y, z: fz + 1.3 });
    }
    S.push({ t: 'poly', axis: 'x', d: 1.0, x: 0, y: 0, z: 0, pts: [[y0, fz], [y0 - 2.2, fz], [y0, fz + 2.6]] });
  }
  return { solids: S, dw, dh, dd };
}

export function build(p) {
  const L = layout(p);
  const parts = [{ id: 'gabinete', label: 'Gabinete', qty: 1, solids: shell(p, L), print: 'costas' }];

  const kinds = new Map();
  for (const c of L.cells) {
    const key = `${c.cw.toFixed(2)}x${c.h.toFixed(2)}x${(c.rel || 0).toFixed(2)}`;
    if (!kinds.has(key)) {
      const d = drawer(p, c.cw, c.h, c.rel);
      kinds.set(key, {
        id: `gaveta-${kinds.size + 1}`,
        label: `Gaveta ${Math.round(d.dw)}×${Math.round(d.dh)}`,
        qty: 0, solids: d.solids, print: 'fundo', dims: d, cells: [],
      });
    }
    const k = kinds.get(key);
    k.qty++;
    k.cells.push(c);
  }
  const drawers = [...kinds.values()];
  for (const k of drawers) parts.push(k);

  for (const part of parts) {
    part.tris = triangulate(part.solids);
    part.vol = volume(part.solids);
    part.bbox = bbox(part.tris);
  }
  return { parts, layout: L, H: L.H, alturaTotal: L.H + (p.empilhar ? RAIL_H : 0) };
}

/* ── relatório de impressão ─────────────────────────────────────── */

const DENS = { PLA: 1.24, PETG: 1.27, ABS: 1.04, 'PLA-CF': 1.22 };

export function report(p, model, opt) {
  const bico = opt.bico || 0.4, dia = opt.filamento || 1.75, dens = DENS[opt.material] || 1.24;
  const total = model.parts.reduce((s, q) => s + q.vol * q.qty, 0);
  const cm3 = total / 1000;
  const area = Math.PI * (dia / 2) ** 2;
  const avisos = [];
  const perim = p.parede / bico;

  if (p.parede < bico * 2) avisos.push({ lvl: 'alto', txt: `Parede de ${p.parede.toFixed(1)} mm dá menos de 2 perímetros com bico ${bico} mm — a peça vai ficar frágil.` });
  else if (Math.abs(perim - Math.round(perim)) > 0.12) avisos.push({ lvl: 'medio', txt: `Parede ${p.parede.toFixed(1)} mm não é múltiplo do bico ${bico} mm. Use ${(Math.round(perim) * bico).toFixed(1)} mm (${Math.round(perim)} perímetros) para evitar preenchimento de gap.` });
  if (p.vazado && p.strut < bico * 2) avisos.push({ lvl: 'alto', txt: `Diagonais de ${p.strut.toFixed(1)} mm abaixo de 2 perímetros — aumente para ${(bico * 2).toFixed(1)} mm.` });
  if (p.folga < 0.3) avisos.push({ lvl: 'medio', txt: `Folga de ${p.folga.toFixed(2)} mm é apertada; gavetas podem emperrar depois da retração.` });
  if (p.folga > 0.6) avisos.push({ lvl: 'baixo', txt: 'Folga larga: as gavetas vão ter jogo lateral.' });
  const menor = Math.min(...p.rows.map((r) => r.h));
  if (menor < p.parede * 6) avisos.push({ lvl: 'medio', txt: `Linha de ${menor} mm é rasa demais para a parede escolhida.` });
  const g = model.parts.find((q) => q.id !== 'gabinete');
  if (g && g.dims.dw < 14) avisos.push({ lvl: 'medio', txt: 'Gaveta com menos de 14 mm de largura útil: difícil de pegar.' });
  const rel = gussetRelief(p, 0);
  if (rel > 0.2) avisos.push({ lvl: 'baixo', txt: `Paredes das gavetas ${rel.toFixed(1)} mm mais baixas nas linhas com mão-francesa, para passar por baixo dela. Mão-francesa menor devolve essa altura.` });

  return {
    cm3, gramas: cm3 * dens, metros: total / area / 1000,
    pecas: model.parts.reduce((s, q) => s + q.qty, 0),
    avisos,
  };
}

/* ── orientação de impressão e exportação ───────────────────────── */

function toPrint(tris, mode) {
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    if (mode === 'costas') { out[i] = x; out[i + 1] = -y; out[i + 2] = -z; }
    else { out[i] = x; out[i + 1] = -z; out[i + 2] = y; }
  }
  return out;
}

export function platePart(part) {
  const v = toPrint(part.tris, part.print);
  const b = bbox(v);
  for (let i = 0; i < v.length; i += 3) {
    v[i] -= (b.lo[0] + b.hi[0]) / 2;
    v[i + 1] -= (b.lo[1] + b.hi[1]) / 2;
    v[i + 2] -= b.lo[2];
  }
  return { name: part.label, tris: v, size: b.size };
}

export function plate(parts) {
  const items = parts.map(platePart);
  let x = 0;
  const gap = 12, total = items.reduce((s, i) => s + i.size[0], 0) + gap * (items.length - 1);
  for (const it of items) {
    const dx = -total / 2 + x + it.size[0] / 2;
    for (let i = 0; i < it.tris.length; i += 3) it.tris[i] += dx;
    x += it.size[0] + gap;
  }
  return items;
}

export function stlBlob(items) {
  let n = 0;
  for (const it of items) n += it.tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  new Uint8Array(buf, 0, 80).set(new TextEncoder().encode('Organizador parametrico - STL binario'));
  dv.setUint32(80, n, true);
  let o = 84;
  for (const it of items) {
    const v = it.tris;
    for (let i = 0; i < v.length; i += 9) {
      const ux = v[i + 3] - v[i], uy = v[i + 4] - v[i + 1], uz = v[i + 5] - v[i + 2];
      const wx = v[i + 6] - v[i], wy = v[i + 7] - v[i + 1], wz = v[i + 8] - v[i + 2];
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
      const len = Math.hypot(nx, ny, nz) || 1;
      dv.setFloat32(o, nx / len, true); dv.setFloat32(o + 4, ny / len, true); dv.setFloat32(o + 8, nz / len, true);
      for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, v[i + k], true);
      dv.setUint16(o + 48, 0, true);
      o += 50;
    }
  }
  return new Blob([buf], { type: 'model/stl' });
}

let CRC;
function crc32(u8) {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[i] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const enc = new TextEncoder(), body = [], dir = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    body.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
    dir.push(new Uint8Array(ch.buffer), name);
    off += 30 + name.length + data.length;
  }
  const dirSize = dir.reduce((s, c) => s + c.length, 0);
  const eo = new DataView(new ArrayBuffer(22));
  eo.setUint32(0, 0x06054b50, true);
  eo.setUint16(8, files.length, true); eo.setUint16(10, files.length, true);
  eo.setUint32(12, dirSize, true); eo.setUint32(16, off, true);
  return new Blob([...body, ...dir, new Uint8Array(eo.buffer)], { type: 'model/3mf' });
}

const xmlEsc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function threemfBlob(items) {
  const objs = [], build = [];
  items.forEach((it, idx) => {
    const map = new Map(), verts = [], tri = [];
    const key = (a, b, c) => `${a.toFixed(4)},${b.toFixed(4)},${c.toFixed(4)}`;
    const v = it.tris;
    for (let i = 0; i < v.length; i += 3) {
      const k = key(v[i], v[i + 1], v[i + 2]);
      let id = map.get(k);
      if (id === undefined) { id = verts.length; map.set(k, id); verts.push(`<vertex x="${+v[i].toFixed(4)}" y="${+v[i + 1].toFixed(4)}" z="${+v[i + 2].toFixed(4)}"/>`); }
      tri.push(id);
    }
    const tris = [];
    for (let i = 0; i < tri.length; i += 3) tris.push(`<triangle v1="${tri[i]}" v2="${tri[i + 1]}" v3="${tri[i + 2]}"/>`);
    objs.push(`<object id="${idx + 1}" type="model" name="${xmlEsc(it.name)}"><mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh></object>`);
    build.push(`<item objectid="${idx + 1}"/>`);
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="pt-BR" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Gerador paramétrico de gavetas</metadata><resources>${objs.join('')}</resources><build>${build.join('')}</build></model>`;
  const ct = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;
  const enc = new TextEncoder();
  return zipStore([
    { name: '[Content_Types].xml', data: enc.encode(ct) },
    { name: '_rels/.rels', data: enc.encode(rels) },
    { name: '3D/3dmodel.model', data: enc.encode(model) },
  ]);
}
