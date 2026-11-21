// Ajustes de CSS do build de TV (navegador das TVs Samsung 2018–2020: Chromium 56–69).
// Cada regra moderna ganha, antes dela, uma versão que esses navegadores entendem; os navegadores
// novos continuam usando a moderna (ela vem depois e vence).
//
// A página da TV é desenhada em 1280 x 720 (viewport fixo do build de TV), então dá para
// calcular min()/max()/clamp() com vw/vh na hora do build.

const VW = 1280, VH = 720, REM = 16;

/** Calcula uma expressão com px/vw/vh/rem, calc/min/max/clamp. Null se não der (%, em, var()...). */
function evaluate(expr) {
  let s = expr.trim();
  if (/var\(|%|\bem\b|\d(em|ch|ex|fr|deg|s)\b/.test(s)) return null;
  s = s.replace(/(-?\d*\.?\d+)(px|vw|vh|rem)?/g, (_, n, u) => {
    const v = parseFloat(n);
    return '(' + (u === 'vw' ? (v * VW) / 100 : u === 'vh' ? (v * VH) / 100 : u === 'rem' ? v * REM : v) + ')';
  });
  s = s.replace(/\bcalc\(/g, '(').replace(/\bmin\(/g, 'Math.min(').replace(/\bmax\(/g, 'Math.max(')
    .replace(/\bclamp\(/g, '__clamp(');
  if (/[^0-9.+\-*/(),\sMathminax_clp]/.test(s)) return null;
  try {
    const v = Function('__clamp', '"use strict";return (' + s + ')')((a, b, c) => Math.max(a, Math.min(b, c)));
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch {
    return null;
  }
}

/** Troca cada min()/max()/clamp() de um valor pelo número calculado. */
function lowerMath(value) {
  let out = '', i = 0, changed = false;
  while (i < value.length) {
    const m = /\b(min|max|clamp)\(/.exec(value.slice(i));
    if (!m) { out += value.slice(i); break; }
    const start = i + m.index;
    let depth = 0, j = start + m[0].length - 1;
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++;
      else if (value[j] === ')' && --depth === 0) break;
    }
    const v = evaluate(value.slice(start, j + 1));
    if (v === null) return null;
    out += value.slice(i, start) + v + 'px';
    changed = true;
    i = j + 1;
  }
  return changed ? out : null;
}

export default function tvPostcss() {
  return {
    postcssPlugin: 'streambox-tv',
    Rule(rule, { AtRule, Rule: NewRule }) {
      // :focus-visible derrubaria a regra inteira (":hover, :focus-visible")
      if (rule.selector.includes(':focus-visible')) rule.selector = rule.selector.replace(/:focus-visible/g, ':focus');
      // O Svelte 5 escreve ".a .b:where(.svelte-x)"; :where() só existe a partir do Chromium 88
      if (rule.selector.includes(':where(')) rule.selector = rule.selector.replace(/:where\((\.svelte-[a-z0-9]+)\)/g, '$1');

      // aspect-ratio (Chromium 88+): altura fixa se a largura for fixa; senão, o truque do padding-top
      let ratio = null, width = null;
      rule.each((d) => {
        if (d.type !== 'decl') return;
        if (d.prop === 'aspect-ratio') {
          const m = /^\s*(\d*\.?\d+)\s*\/\s*(\d*\.?\d+)\s*$/.exec(d.value);
          if (m) ratio = parseFloat(m[2]) / parseFloat(m[1]);
        }
        if (d.prop === 'width' && /^\d+px$/.test(d.value.trim())) width = parseFloat(d.value);
      });
      if (ratio && rule.parent && rule.parent.type !== 'atrule') {
        const sup = new AtRule({ name: 'supports', params: 'not (aspect-ratio: 1 / 1)' });
        if (width) {
          sup.append(new NewRule({ selector: rule.selector }).append({ prop: 'height', value: `${Math.round(width * ratio)}px` }));
        } else {
          const before = rule.selector.split(',').map((s) => s.trim() + '::before').join(',');
          sup.append(new NewRule({ selector: before }).append(
            { prop: 'content', value: '""' }, { prop: 'display', value: 'block' },
            { prop: 'padding-top', value: `${Math.round(ratio * 10000) / 100}%` },
          ));
        }
        rule.after(sup);
      }
    },
    Declaration(decl) {
      if (decl.__tv) return;
      // gap em grid: antes do Chromium 66 o nome era grid-gap
      const old = { gap: 'grid-gap', 'row-gap': 'grid-row-gap', 'column-gap': 'grid-column-gap' }[decl.prop];
      if (old) decl.cloneBefore({ prop: old, __tv: true });
      // place-items / place-self (Chromium 59+)
      if (decl.prop === 'place-items' || decl.prop === 'place-self') {
        const [a, b] = decl.value.trim().split(/\s+/);
        const kind = decl.prop === 'place-items' ? 'items' : 'self';
        decl.cloneBefore({ prop: `align-${kind}`, value: a, __tv: true });
        decl.cloneBefore({ prop: `justify-${kind}`, value: b || a, __tv: true });
      }
      // width: min(420px, 100%) -> width: 100% + max-width: 420px (com % não dá para calcular antes)
      const PCT = /min\(\s*([\d.]+)px\s*,\s*100%\s*\)/;
      const pct = decl.prop === 'width' && PCT.exec(decl.value);
      if (pct) {
        decl.cloneBefore({ value: decl.value.replace(PCT, '100%'), __tv: true });
        if (!decl.parent.some((d) => d.prop === 'max-width')) decl.cloneAfter({ prop: 'max-width', value: pct[1] + 'px', __tv: true });
        return;
      }
      // min() / max() / clamp() (Chromium 79+): valor já calculado para a tela da TV
      if (/\b(min|max|clamp)\(/.test(decl.value)) {
        const v = lowerMath(decl.value);
        if (v) decl.cloneBefore({ value: v, __tv: true });
      }
    },
  };
}
tvPostcss.postcss = true;
