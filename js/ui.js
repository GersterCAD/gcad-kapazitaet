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

const SVG = (pfad, groesse = 14, strich = 2) => el('span', {
  'aria-hidden': 'true', class: 'icon',
  html: `<svg width="${groesse}" height="${groesse}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strich}" stroke-linecap="round" stroke-linejoin="round">${pfad}</svg>`,
});
export const minusIcon = () => SVG('<path d="M5 12h14"/>');
export const plusIconGross = () => SVG('<path d="M12 5v14M5 12h14"/>');
export const hakenIcon = (groesse = 12) => SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>', groesse, 2.6);
export const glockeIcon = () => SVG('<path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 003.4 0"/>', 14, 1.6);
export const kreuzIcon = () => SVG('<path d="M6 6l12 12M18 6L6 18"/>', 12, 2);

/** Zahl deutsch: 1,5 – höchstens eine Nachkommastelle */
export function zahlText(h, stellen = 1) {
  const f = 10 ** stellen;
  return String(Math.round(h * f) / f).replace('.', ',');
}

/** Schalter aus dem Entwurf (52 × 32). wechsel(neuerWert) */
export function schalter(an, beschriftung, wechsel, fokus) {
  const knopf = el('button', {
    type: 'button', role: 'switch', class: 'schalter', 'aria-checked': String(an),
    ...(beschriftung.startsWith('#') ? { 'aria-labelledby': beschriftung.slice(1) } : { 'aria-label': beschriftung }),
    'data-fokus': fokus,
    onclick: () => wechsel(!an),
  }, [el('span', { 'aria-hidden': 'true' })]);
  return knopf;
}

/** Stepper aus dem Entwurf: − Wert + (44er Kreise) */
export function stepper({ wert, minus, plus, minusLabel, plusLabel, fokus, breit = false }) {
  return el('div', { class: `stepper${breit ? ' breit' : ''}` }, [
    el('button', { type: 'button', class: 'rund', 'aria-label': minusLabel, onclick: minus, 'data-fokus': fokus && `${fokus}-minus` }, [minusIcon()]),
    el('div', { class: 'stepper-wert zahl' }, wert),
    el('button', { type: 'button', class: 'rund', 'aria-label': plusLabel, onclick: plus, 'data-fokus': fokus && `${fokus}-plus` }, [plusIconGross()]),
  ]);
}

/** Auswahlpillen (aria-pressed), z. B. Wochentage oder Positionen */
export function wahlPille(text, gewaehlt, onclick, { art = '', label, fokus } = {}) {
  return el('button', {
    type: 'button', class: `wahl ${art}`.trim(), 'aria-pressed': String(gewaehlt), 'aria-label': label, onclick, 'data-fokus': fokus,
  }, text);
}

/** Feld mit Beschriftung darüber (Formulare ohne eigene Vorlage, Stil wie „Zeit buchen“) */
export function feldGruppe(beschriftung, eingabe, hinweis) {
  const id = eingabe.id || `f-${Math.random().toString(36).slice(2, 9)}`;
  eingabe.id = id;
  return el('div', { class: 'feldgruppe' }, [
    el('label', { for: id, class: 'feld-label' }, beschriftung),
    eingabe,
    hinweis ? el('div', { class: 'zeile-hinweis' }, hinweis) : null,
  ]);
}
