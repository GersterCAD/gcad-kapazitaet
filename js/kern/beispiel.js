// Beispieldaten zum Ausprobieren, angelehnt an den Entwurf Index A (Stand 27.10.2026).
// Alle Namen sind erfunden – dieses Repo ist öffentlich, echte Kunden gehören nicht hierher.

import { leereDaten, neueId } from './daten.js';
import { alsText, ausText, plusTage } from './datum.js';

export function beispielDaten() {
  const d = leereDaten();
  const id = {};
  const projekt = (schluessel, p) => {
    id[schluessel] = neueId();
    d.projekte.push({ id: id[schluessel], prioritaet: 2, puffer: 10, positionen: [], ...p });
  };
  const meilenstein = (schluessel, datum, titel, typ, erledigt = false) =>
    d.meilensteine.push({ id: neueId(), projektId: id[schluessel], datum, titel, typ, erledigt, erinnerungTage: [7, 2] });
  const zeit = (schluessel, datum, positionNr, stunden, notiz = '') =>
    d.zeiteintraege.push({ id: neueId(), datum, projektId: id[schluessel], positionNr, stunden, notiz });

  // Laufende Aufträge
  projekt('empfang', {
    nr: '26-041', name: 'Kanzlei Muster · Empfang', kunde: 'Kanzlei Muster', art: 'Werkplanung',
    status: 'laeuft', schaetzungH: 42, start: '2026-10-19', deadline: '2026-11-20', prioritaet: 1, farbe: '#445F6E',
    positionen: [
      { nr: '1', bezeichnung: 'Empfangstheke', sollH: 18 },
      { nr: '2', bezeichnung: 'Wandverkleidung', sollH: 12 },
      { nr: '3', bezeichnung: 'Garderobe', sollH: 8 },
      { nr: '4', bezeichnung: 'Details und Stückliste', sollH: 4 },
    ],
  });
  projekt('frankfurt', {
    nr: '26-044', name: 'Projekt Frankfurt', kunde: 'Beispiel Bau GmbH', art: 'Werkplanung',
    status: 'laeuft', schaetzungH: 54.5, start: '2026-10-26', deadline: '2026-11-27', prioritaet: 1, farbe: '#7C93A0',
    positionen: [
      { nr: '1', bezeichnung: 'Schrankwand Flur', sollH: 10 },
      { nr: '2', bezeichnung: 'Teeküche', sollH: 12 },
      { nr: '3', bezeichnung: 'Verkleidung IT', sollH: 8 },
      { nr: '4', bezeichnung: 'Besprechungstisch', sollH: 6 },
      { nr: '5', bezeichnung: 'Sideboards', sollH: 10 },
      { nr: '6', bezeichnung: 'Akustikpaneele', sollH: 8.5 },
    ],
  });
  projekt('bar', {
    nr: '26-047', name: 'Gastro Getränkebar', kunde: 'Gasthaus Beispiel', art: 'Werkplanung',
    status: 'auftrag', schaetzungH: 57, start: '2026-11-02', deadline: '2026-12-11', farbe: '#B4C3CC',
    positionen: [
      { nr: '1', bezeichnung: 'Theke', sollH: 24 },
      { nr: '2', bezeichnung: 'Rückbuffet', sollH: 16 },
      { nr: '3', bezeichnung: 'Werkplanung komplett', sollH: 17 },
    ],
  });

  // Anfrage, noch nicht fest
  projekt('cafe', {
    nr: '', name: 'Café Rösterei · Entwurf', kunde: 'Rösterei Beispiel', art: 'Entwurf',
    status: 'anfrage', schaetzungH: 56, start: '2026-11-30', deadline: '2026-12-18', prioritaet: 2, farbe: '',
  });

  // Abgeschlossen, für den Lernwert (3 × Werkplanung)
  projekt('alt1', { nr: '26-012', name: 'Praxis Beispiel · Empfang', kunde: 'Praxis Beispiel', art: 'Werkplanung', status: 'abgeschlossen', schaetzungH: 30, start: '2026-03-02', deadline: '2026-03-27', farbe: '' });
  projekt('alt2', { nr: '26-019', name: 'Büro Muster · Möblierung', kunde: 'Muster AG', art: 'Werkplanung', status: 'abgeschlossen', schaetzungH: 40, start: '2026-05-04', deadline: '2026-06-05', farbe: '' });
  projekt('alt3', { nr: '26-027', name: 'Laden Beispiel · Regale', kunde: 'Laden Beispiel', art: 'Werkplanung', status: 'abgeschlossen', schaetzungH: 24, start: '2026-07-06', deadline: '2026-07-24', farbe: '' });

  meilenstein('empfang', '2026-11-06', 'Freigabe Entwurf', 'meilenstein');
  meilenstein('empfang', '2026-11-20', 'Deadline Werkplanung', 'deadline');
  meilenstein('frankfurt', '2026-11-13', 'Pos. 1–3 an Kunde', 'meilenstein');
  meilenstein('frankfurt', '2026-11-27', 'Deadline Abgabe', 'deadline');
  meilenstein('bar', '2026-11-27', 'Theke freigegeben', 'meilenstein');
  meilenstein('bar', '2026-12-11', 'Deadline Werkplanung komplett', 'deadline');

  // Ist 21 h bzw. 8 h wie im Entwurf
  zeit('empfang', '2026-10-19', '1', 4); zeit('empfang', '2026-10-20', '1', 5);
  zeit('empfang', '2026-10-21', '1', 3); zeit('empfang', '2026-10-22', '2', 4.5);
  zeit('empfang', '2026-10-26', '2', 3); zeit('empfang', '2026-10-27', '2', 1.5);
  zeit('frankfurt', '2026-10-26', '1', 4); zeit('frankfurt', '2026-10-27', '1', 4);

  // Abgeschlossene: Ist über der Schätzung (+20 %, +15 %, +25 %)
  const verteilt = (schluessel, ab, summe) => {
    let tag = ausText(ab);
    for (let rest = summe; rest > 0; tag = plusTage(tag, 1)) {
      if (tag.getDay() === 0 || tag.getDay() === 6) continue;
      const h = Math.min(6, rest);
      zeit(schluessel, alsText(tag), null, h);
      rest -= h;
    }
  };
  verteilt('alt1', '2026-03-02', 36);
  verteilt('alt2', '2026-05-04', 46);
  verteilt('alt3', '2026-07-06', 30);

  d.blockzeiten.push(
    { id: neueId(), titel: 'Büro, Rechnungen, lexoffice', art: 'buero', stundenProWoche: 4, wochentag: [5], von: '08:00', bis: '12:00', kuerzbar: false, verschiebbar: false },
    { id: neueId(), titel: 'Entwicklung neuer Dinge', art: 'entwicklung', stundenProWoche: 6, wochentag: [1, 3], von: '14:00', bis: '17:00', kuerzbar: true, verschiebbar: false },
  );
  d.abwesenheiten.push({ id: neueId(), von: '2026-12-28', bis: '2027-01-01', art: 'urlaub' });

  return d;
}

/** Beispieltermine, wie sie später aus dem Kalender-JSON kommen (nur für die Beispieldaten). */
export function beispielTermine() {
  const t = (kalender, tag, von, bis, titel) => ({
    uid: `beispiel-${tag}-${von}`, kalender, titel, ganztaegig: false,
    start: `${tag}T${von}`, ende: `${tag}T${bis}`,
  });
  const g = (kalender, tag, bisExkl, titel) => ({ uid: `beispiel-${tag}-ganz`, kalender, titel, ganztaegig: true, start: tag, ende: bisExkl });
  return [
    t('Gerster CAD', '2026-10-26', '10:00', '11:00', 'Telefonat Gasthaus Beispiel'),
    t('Gerster CAD', '2026-10-28', '09:00', '12:00', 'Baustellentermin Getränkebar'),
    t('Gerster CAD', '2026-10-29', '14:00', '15:00', 'Abstimmung Kanzlei Muster'),
    t('Privat', '2026-10-29', '18:00', '20:00', 'Sport'),
    t('Gerster CAD', '2026-11-03', '09:00', '11:00', 'Aufmaß Frankfurt'),
    t('Gerster CAD', '2026-11-05', '13:00', '15:00', 'Werkstattbesuch Schreinerei'),
    g('Familie', '2026-11-07', '2026-11-08', 'Geburtstag'),
    t('Gerster CAD', '2026-11-10', '10:00', '12:00', 'Abstimmung Frankfurt'),
    t('Gerster CAD', '2026-11-16', '08:00', '11:00', 'Baustellentermin Kanzlei'),
    t('Gerster CAD', '2026-11-19', '14:00', '16:00', 'Abnahme Entwurf Getränkebar'),
    t('Gerster CAD', '2026-11-24', '09:00', '12:00', 'Messe Holz und Handwerk'),
    t('Gerster CAD', '2026-12-01', '10:00', '12:00', 'Erstgespräch Rösterei'),
    t('Gerster CAD', '2026-12-09', '14:00', '16:00', 'Steuerberater'),
    t('Gerster CAD', '2026-12-15', '09:00', '13:00', 'Jahresgespräch Kunden'),
  ];
}
