// Datumshilfen für den Rechenkern. Ohne Oberfläche, ohne DOM.
// Datum als Text immer YYYY-MM-DD, gerechnet wird mit lokaler Mitternacht.

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const zwei = (n) => String(n).padStart(2, '0');

/** Date → "YYYY-MM-DD" */
export function alsText(d) {
  return `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date (lokal, 0 Uhr) */
export function ausText(s) {
  const [j, m, t] = s.split('-').map(Number);
  return new Date(j, m - 1, t);
}

/** Tage addieren, gibt ein neues Date zurück */
export function plusTage(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** ISO-Kalenderwoche: { jahr, woche } (Woche mit dem Donnerstag zählt) */
export function isoWoche(d) {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const tag = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - tag);
  const jahresanfang = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const woche = Math.ceil(((x - jahresanfang) / 86400000 + 1) / 7);
  return { jahr: x.getUTCFullYear(), woche };
}

/** Wochenschlüssel wie in den Daten: "2026-W46" */
export function wochenSchluessel(d) {
  const { jahr, woche } = isoWoche(d);
  return `${jahr}-W${zwei(woche)}`;
}

/** Montag der Woche, in der d liegt */
export function montag(d) {
  return plusTage(d, -((d.getDay() + 6) % 7));
}

/** "Di 27.10.2026" */
export function tagLang(d) {
  return `${WOCHENTAGE[d.getDay()]} ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "Di 27.10." */
export function tagKurz(d) {
  return `${WOCHENTAGE[d.getDay()]} ${zwei(d.getDate())}.${zwei(d.getMonth() + 1)}.`;
}
