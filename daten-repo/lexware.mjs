// Läuft in der GitHub Action des privaten Repos gcad-kapazitaet-daten (siehe lexware.yml).
// Der Browser darf Lexware Office nicht direkt aufrufen (CORS) – und der API-Schlüssel soll nie im Browser liegen.
// Deshalb legt die App Aufträge als Datei ab, diese Action schickt sie an Lexware Office und legt die Antwort zurück.
//
//   lexware/auftraege/<id>.json   von der App:  { id, art: 'rechnung' | 'angebot' | 'kontakte', daten }
//   lexware/ergebnisse/<id>.json  von hier:     { id, ok, lexwareId, fehler, details, zeit }
//   lexware/status.json           von hier:     { verbunden, organisation, geprueft, fehler }
//   lexware/kontakte.json         von hier:     { abgeholt, kontakte: [{ id, name, nummer }] }
//
// Sicherheit: Es gibt nur diese drei Arten. Angelegt werden ausschließlich ENTWÜRFE (nie festgeschrieben,
// nie versendet). Die Nutzlast an Lexware wird hier aus erlaubten Feldern neu gebaut, nichts wird blind durchgereicht.
// Secret: LEXWARE_API_KEY (in Lexware Office unter Erweiterungen → Public API erzeugt).

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export const API = 'https://api.lexware.io';
const ORDNER = process.argv[2] || 'lexware';
const ARTEN = ['rechnung', 'angebot', 'kontakte'];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Nutzlast bauen (auch für Tests exportiert) ----------

const text = (x, max = 255) => String(x ?? '').slice(0, max);
const zahl = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10000) / 10000 : 0);
const datum = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x ?? '') ? x : new Date().toISOString().slice(0, 10));

/** „2026-10-28“ → „2026-10-28T00:00:00.000+01:00“ (deutsche Zeit, Sommer +02:00) */
export function lexDatum(tag) {
  const d = new Date(`${datum(tag)}T12:00:00Z`);
  const teil = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Berlin', timeZoneName: 'longOffset' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  const versatz = teil.replace('GMT', '') || '+00:00';
  return `${datum(tag)}T00:00:00.000${versatz}`;
}

function positionen(zeilen) {
  if (!Array.isArray(zeilen) || !zeilen.length) throw new Error('Keine Zeilen.');
  if (zeilen.length > 200) throw new Error('Zu viele Zeilen.');
  return zeilen.map((z) => ({
    type: 'custom', name: text(z.name) || 'Leistung', description: text(z.beschreibung, 2000) || undefined,
    quantity: zahl(z.menge), unitName: ['Stunden', 'Pauschal'].includes(z.einheit) ? z.einheit : 'Stück',
    unitPrice: { currency: 'EUR', netAmount: zahl(z.preisNetto), taxRatePercentage: 19 },
  }));
}

const adresse = (d) => (typeof d.kontaktId === 'string' && /^[0-9a-f-]{36}$/i.test(d.kontaktId)
  ? { contactId: d.kontaktId } : { name: text(d.name) || 'Kunde', countryCode: 'DE' });

export function rechnungNutzlast(d) {
  return {
    voucherDate: lexDatum(d.datum), address: adresse(d), lineItems: positionen(d.zeilen),
    totalPrice: { currency: 'EUR' }, taxConditions: { taxType: 'net' },
    shippingConditions: { shippingType: 'serviceperiod', shippingDate: lexDatum(d.leistungVon), shippingEndDate: lexDatum(d.leistungBis) },
    title: text(d.titel) || 'Rechnung', introduction: text(d.einleitung, 2000) || undefined,
  };
}

export function angebotNutzlast(d) {
  return {
    voucherDate: lexDatum(d.datum), expirationDate: lexDatum(d.gueltigBis), address: adresse(d), lineItems: positionen(d.zeilen),
    totalPrice: { currency: 'EUR' }, taxConditions: { taxType: 'net' },
    title: text(d.titel) || 'Angebot', introduction: text(d.einleitung, 2000) || undefined,
    remark: text(d.bemerkung, 2000) || 'Alle Preise netto zzgl. gesetzlicher Mehrwertsteuer.',
  };
}

// ---------- Lexware aufrufen ----------

export async function lex(pfad, { method = 'GET', body } = {}, schluessel = process.env.LEXWARE_API_KEY, holen = fetch) {
  for (let versuch = 0; versuch < 3; versuch++) {
    const a = await holen(`${API}${pfad}`, {
      method, headers: { Authorization: `Bearer ${schluessel}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (a.status === 429) { await pause(1500 * (versuch + 1)); continue; } // höchstens 2 Aufrufe je Sekunde
    const t = await a.text();
    let j = null;
    try { j = t ? JSON.parse(t) : null; } catch { /* kein JSON */ }
    if (!a.ok) {
      const meldung = j?.message ?? j?.error ?? `HTTP ${a.status}`;
      const f = new Error(verstaendlich(a.status, meldung));
      f.details = t.slice(0, 2000);
      f.status = a.status;
      throw f;
    }
    await pause(600);
    return j;
  }
  throw new Error('Lexware Office ist gerade überlastet. Bitte später noch einmal.');
}

function verstaendlich(status, meldung) {
  if (status === 401) return 'Der API-Schlüssel stimmt nicht mehr. Erzeuge in Lexware Office einen neuen und trag ihn als Secret ein.';
  if (status === 403) return 'Der API-Schlüssel darf das nicht. Prüfe in Lexware Office die Rechte der Public API.';
  if (status === 406 || status === 400 || status === 422) return `Lexware Office hat die Daten abgelehnt: ${meldung}`;
  if (status >= 500) return 'Lexware Office ist gerade nicht erreichbar. Bitte später noch einmal.';
  return `Lexware Office meldet: ${meldung}`;
}

export async function kontakteHolen(schluessel, holen) {
  const kontakte = [];
  for (let seite = 0; seite < 40; seite++) {
    const j = await lex(`/v1/contacts?customer=true&page=${seite}&size=250`, {}, schluessel, holen);
    for (const k of j?.content ?? []) {
      const name = k.company?.name ?? [k.person?.firstName, k.person?.lastName].filter(Boolean).join(' ');
      if (name) kontakte.push({ id: k.id, name, nummer: k.roles?.customer?.number ?? null });
    }
    if (j?.last !== false || seite + 1 >= (j?.totalPages ?? 1)) break;
  }
  return kontakte.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Einen Auftrag ausführen. Gibt das Ergebnis zurück (wirft nicht). */
export async function ausfuehren(auftrag, schluessel, holen) {
  const id = String(auftrag?.id ?? '');
  const zeit = new Date().toISOString();
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Auftrag ohne gültige ID.');
    if (!ARTEN.includes(auftrag.art)) throw new Error(`Unbekannte Art „${auftrag.art}“.`);
    if (auftrag.art === 'kontakte') return { id, ok: true, kontakte: (await kontakteHolen(schluessel, holen)).length, zeit };
    const pfad = auftrag.art === 'rechnung' ? '/v1/invoices' : '/v1/quotations';
    const body = auftrag.art === 'rechnung' ? rechnungNutzlast(auftrag.daten ?? {}) : angebotNutzlast(auftrag.daten ?? {});
    const j = await lex(pfad, { method: 'POST', body }, schluessel, holen); // ohne ?finalize=true → Entwurf
    return { id, ok: true, lexwareId: j?.id ?? null, zeit };
  } catch (f) {
    return { id, ok: false, fehler: f.message, details: f.details ?? null, zeit };
  }
}

// ---------- Ablauf in der Action ----------

async function main() {
  const schluessel = process.env.LEXWARE_API_KEY;
  await mkdir(join(ORDNER, 'auftraege'), { recursive: true });
  await mkdir(join(ORDNER, 'ergebnisse'), { recursive: true });
  const schreiben = (name, inhalt) => writeFile(join(ORDNER, name), `${JSON.stringify(inhalt, null, 2)}\n`);

  if (!schluessel) {
    await schreiben('status.json', { verbunden: false, geprueft: new Date().toISOString(), fehler: 'Secret LEXWARE_API_KEY fehlt noch.' });
    console.log('Noch kein API-Schlüssel eingetragen (Secret LEXWARE_API_KEY).');
    return;
  }

  // Schlüssel prüfen
  try {
    const profil = await lex('/v1/profile', {}, schluessel);
    await schreiben('status.json', { verbunden: true, organisation: profil?.companyName ?? null, geprueft: new Date().toISOString(), fehler: null });
  } catch (f) {
    await schreiben('status.json', { verbunden: false, geprueft: new Date().toISOString(), fehler: f.message });
    console.error(f.message);
    return; // Aufträge bleiben liegen und werden beim nächsten Lauf erledigt
  }

  // Aufträge
  const dateien = (await readdir(join(ORDNER, 'auftraege'))).filter((n) => n.endsWith('.json')).sort();
  let kontakteNoetig = process.env.KONTAKTE === 'ja';
  for (const name of dateien) {
    const pfad = join(ORDNER, 'auftraege', name);
    let auftrag = null;
    try { auftrag = JSON.parse(await readFile(pfad, 'utf8')); } catch { /* kaputt */ }
    const ergebnis = auftrag ? await ausfuehren(auftrag, schluessel) : { id: name.replace(/\.json$/, ''), ok: false, fehler: 'Auftrag nicht lesbar.', zeit: new Date().toISOString() };
    if (auftrag?.art === 'kontakte') kontakteNoetig = true;
    const ergebnisName = /^[0-9a-f-]{36}$/i.test(ergebnis.id) ? `${ergebnis.id}.json` : name;
    await schreiben(join('ergebnisse', ergebnisName), ergebnis);
    await rm(pfad);
    console.log(`${auftrag?.art ?? '?'} ${ergebnis.ok ? 'ok' : `Fehler: ${ergebnis.fehler}`}`);
  }

  // Kontakte für die Kundenauswahl (einmal am Tag oder auf Anfrage)
  if (kontakteNoetig) {
    try {
      const kontakte = await kontakteHolen(schluessel);
      await schreiben('kontakte.json', { abgeholt: new Date().toISOString(), kontakte });
      console.log(`${kontakte.length} Kontakte geholt.`);
    } catch (f) { console.error(`Kontakte: ${f.message}`); }
  }

  // Alte Ergebnisse nach 30 Tagen aufräumen
  const grenze = Date.now() - 30 * 86400000;
  for (const name of await readdir(join(ORDNER, 'ergebnisse'))) {
    try {
      const e = JSON.parse(await readFile(join(ORDNER, 'ergebnisse', name), 'utf8'));
      if (Date.parse(e.zeit) < grenze) await rm(join(ORDNER, 'ergebnisse', name));
    } catch { /* egal */ }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
