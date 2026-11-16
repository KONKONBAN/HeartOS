function supportsFlexGap() {
  const d = document.createElement('div');
  d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden;pointer-events:none';
  d.appendChild(document.createElement('div'));
  d.appendChild(document.createElement('div'));
  document.body.appendChild(d);
  const ok = d.scrollHeight === 1;
  d.remove();
  return ok;
}

function fallbackRules(rules: CSSRuleList, out: string[]) {
  for (const r of Array.from(rules)) {
    if (typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule) {
      if (matchMedia(r.media.mediaText).matches) fallbackRules(r.cssRules, out);
      continue;
    }
    if (typeof CSSSupportsRule !== 'undefined' && r instanceof CSSSupportsRule) {
      if (CSS.supports(r.conditionText)) fallbackRules(r.cssRules, out);
      continue;
    }
    if (!(r instanceof CSSStyleRule)) continue;
    const s = r.style;
    const display = s.getPropertyValue('display').trim();
    if (display !== 'flex' && display !== 'inline-flex') continue;
    const row = s.getPropertyValue('row-gap').trim();
    const col = s.getPropertyValue('column-gap').trim();
    if ((!row || row === 'normal' || row === '0px') && (!col || col === 'normal' || col === '0px')) continue;
    const column = s.getPropertyValue('flex-direction').trim().startsWith('column');
    const wrap = s.getPropertyValue('flex-wrap').trim() === 'wrap';
    for (const sel of r.selectorText.split(',').map((x) => x.trim()).filter(Boolean)) {
      if (column) out.push(`${sel} > * + * { margin-top: ${row || col}; }`);
      else if (wrap) out.push(`${sel} > * { margin-right: ${col || row}; margin-bottom: ${row || col}; }`);
      else {
        const g = col || row;
        out.push(`${sel} > * + * { margin-left: ${g}; }`, `${sel} > svg:first-child { margin-right: ${g}; }`, `${sel} > svg:first-child + * { margin-left: 0; }`);
      }
    }
  }
}

export function polyfillFlexGap() {
  try {
    if (supportsFlexGap()) return;
    document.documentElement.classList.add('no-flexgap');
    const out: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        fallbackRules(sheet.cssRules, out);
      } catch {
        /* bảng kiểu từ nguồn khác */
      }
    }
    if (!out.length) return;
    const style = document.createElement('style');
    style.setAttribute('data-flexgap', '');
    style.textContent = out.join('\n');
    document.head.insertBefore(style, document.head.firstChild);
  } catch {
    /* không chặn ứng dụng */
  }
}
