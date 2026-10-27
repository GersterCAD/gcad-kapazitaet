// Kleine DOM-Hilfen für die Oberfläche. Kein Framework.

/** Element bauen: el('div', { class: 'karte', onclick: fn }, [kinder | text]) */
export function el(tag, attrs = {}, kinder = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of [].concat(kinder)) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

/** SVG-Plus für „Projekt anlegen“ (aus dem Entwurf) */
export function plusIcon() {
  return el('span', {
    'aria-hidden': 'true',
    html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  });
}
