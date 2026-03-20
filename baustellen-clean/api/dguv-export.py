from http.server import BaseHTTPRequestHandler
import json
import io
import base64
from datetime import datetime
import re

try:
    import openpyxl
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
    HAS_OPENPYXL = True
except ImportError:
    HAS_OPENPYXL = False

# ═══════════════════════════════════════
# NORMBEZEICHNUNGEN
# ═══════════════════════════════════════
NORMBEZ = ["Airhockeytisch","Aktenvernichter","Anschlusskabel","Apple TV","Aquariumzubehör","Babyphone","Barcode / QR-Codescanner","Batterietester","Beamer","Beistellmodul (Telefon)","Beschriftungsgerät","Bettbeleuchtung","Bildimporter","Blaulichtlampe","Blu-ray / DVD Player","Bohrmaschine","Bratpfanne","Brutschrank","Bügelbrett","Bügeleisen","CD / Radio / Kassettenrekorder","Crêpes-Eisen","Dartscheibe (elektrisch)","Deckenfluter","Dekobeleuchtung","Desinfektionsmittelmischgerät","Digitaler Fotorahmen","Diktiergerät","Docking Station","Dosieranlage","Dreiwalzwerk","Drucker","Duftlampe","Dunstabzugshaube","Durchlauferhitzer","Eierkocher","Einkochautomat","Einschaltstrombegrenzer","Elektroherd","Elektronische Wetterstation","Entsafter","Etikettendrucker","Falschgelddetektor","Faltmaschine","Fango-Ofen","Faxgerät","Fernseher","Flaschenwärmer","Fleischwolf (elektrisch)","Fliegenfalle (elektrisch)","Fritteuse","Fräsmaschine","Fußschalter","Fußwärmer","Fön","Gefrierschrank","Geldzähler","Globus (elektrisch)","Glühweinkocher","Graviergerät","Grill (elektrisch)","Haarschneidemaschine","Haartrockner","Handlampe","Handmixer","Handnotleuchte","Handstaubsauger","Headset","Heizbad","Heizdecke","Heizkissen","Heizlüfter","Heizung (elektrisch)","Heißgeräteanschlussleitung","Heißklebepistole","Heißluftfön","Infrarotlampe","Kabeltrommel","Kaffeemaschine","Kaffeemühle","Kaffeevollautomat","Kalender (digital)","Kaltgeräteanschlussleitung","Kamin (elektrisch)","Kartenlesegerät","Kartenzahlungsgerät","Keyboard","Kiesbad","Kochplatte","Konferenztelefon","Konvektor","Körperwaage","Küchenmaschine","Küchenwaage","Kühl- und Gefrierkombination","Kühlschrank","Kühltruhe","LED Treiber","Labeldrucker","Ladegerät / Ladestation","Laminiergerät","Lasergerät","Lautsprecher","Lesehilfe","Lichterbogen","Lichterkette","Liege (elektrisch)","Lockenstab","Luft-Kompressor","Luftfilteranlage","Lötkolben","Lüfter","Massagegerät (Infrarot)","Mehrfachsteckdose","Mikrofon","Mikrowelle","Milchaufschäumer","Milchwaage","Mischpult","Modem","Monitor","Multifunktionsgerät (Drucker&Scanner)","Nachtlicht","Nähmaschine","Overhead Projektor","PC","PC (mobil)","PC Arbeitsplatz","Parafinbad","Parkscheinentwerter","Partytopf","Patchmaschine","Pendelleuchte","Popcornmaschine","Pumpe (elektrisch)","Rasierer","Receiver","Rechenmaschine","Router/Switch","Sandwichmaker","Scanner","Scheinwerfer","Schleifmaschine","Schließfach","Schneidemaschine","Schokoladenbrunnen","Schranklampe","Schreibmaschine (elektrisch)","Schreibtischlampe","Schwarzlichtlampe","Sessel (elektrisch)","Spielekonsole","Sportgerät (elektrisch)","Spülmaschine","Stabmixer","Standbohrmaschine","Standlampe","Standmixer","Staub/Nasssauger","Steckdose mit Schalter","Steckernetzteil","Stift","Stromverteiler 400V","Säge","Tacker (elektrisch)","Tafelsteuerung","Tauchpumpe","Teekocher","Teigknetmaschine","Tellerwärmer","Temperaturfühler","Tiefkühltruhe","Tisch (elektrisch)","Tischfräse","Toaster","Topf (elektrisch)","Trockner","USV (Unterbrechungsfreie Stromversorgung)","Uhr","Ultraschallreinigungsgerät","Untertischgerät","VGA Switch","Ventilator","Verlängerung 230V","Verlängerung 400V","Vernebler","Verstärker","Videokamera","Videokonferenzanlage","Videorekorder","Waffeleisen","Waschmaschine","Wasserbett","Wasserbrunnen","Wasserkocher","Wasserspender","Wecker","Whiteboard","Wok (elektrisch)","Wärmematte","Wärmeplatte","Wärmeschrank","Wärmestrahler","Wärmewagen","Zahnbürste (elektrisch)","Zeichentisch","Zeitschaltuhr (elektrisch)","Zigarettenstopfgerät","Zimmerantenne","iPad","mobiles Klimagerät","Überspannungsschutz Feinschutz Typ 3"]

# ═══════════════════════════════════════
# TABELLE3 (Raum-Mapping) - statische Daten aus Vorlage
# ═══════════════════════════════════════
TABELLE3_HEADERS = ['Raum-ID', 'Raumbez.', 'Kostenstelle', 'Kostenstellenbez.', 'Liegenschafts-ID', 'Gesellschaft', 'Kundenbez.', 'WIDI Kunden Nr']

def fuzzy_score(a, b):
    s, t = a.lower().strip(), b.lower().strip()
    if s == t: return 1.0
    if t in s or s in t: return 0.85
    matches = sum(1 for c in min([s,t], key=len) if c in max([s,t], key=len))
    return matches / max(len(s), len(t))

def find_best_norm(bez):
    if not bez: return bez
    bez = bez.strip()
    exact = next((n for n in NORMBEZ if n.lower() == bez.lower()), None)
    if exact: return exact
    best_score, best_match = 0, bez
    for norm in NORMBEZ:
        score = fuzzy_score(bez, norm)
        if score > best_score:
            best_score, best_match = score, norm
    return best_match if best_score > 0.75 else bez

def format_date(val):
    if not val: return val
    val = str(val).strip()
    m = re.match(r'^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$', val)
    if m:
        year = f"20{m.group(3)}" if len(m.group(3)) == 2 else m.group(3)
        return f"{year}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    return val

def extract_raum(abteilung):
    if not abteilung: return ''
    m = re.search(r'\.(R\d{3,4})', str(abteilung))
    return m.group(1) if m else ''

def shorten_kunde(val):
    if not val: return val
    val = str(val).strip()
    val = re.sub(r'^\d+\s*-\s*', '', val)
    val = re.sub(r',.*$', '', val).strip()
    return val

def process_rows(rows):
    aenderungen = []
    processed = []
    for row in rows:
        r = dict(row)
        id_ = str(r.get('ID', '')).strip()

        # 1. Bezeichnung normieren
        bez = str(r.get('BEZEICHNUNG', '') or '').strip()
        if bez:
            neu_bez = find_best_norm(bez)
            if neu_bez != bez:
                aenderungen.append({'id': id_, 'feld': 'BEZEICHNUNG', 'vorher': bez, 'nachher': neu_bez, 'typ': 'auto'})
                r['BEZEICHNUNG'] = neu_bez

        # 2. Datum formatieren
        for datfeld in ['LETZTE PRÜFUNG', 'NÄCHSTE PRÜFUNG', 'ERFASST AM', 'GEÄNDERT AM']:
            val = str(r.get(datfeld, '') or '').strip()
            if val and '.' in val:
                neu = format_date(val)
                if neu != val:
                    r[datfeld] = neu

        # 3. RAUM extrahieren
        abt = str(r.get('ABTEILUNG', '') or '')
        raum = extract_raum(abt)
        if raum and not r.get('RAUM'):
            r['RAUM'] = raum
            aenderungen.append({'id': id_, 'feld': 'RAUM', 'vorher': '', 'nachher': raum, 'typ': 'auto'})

        # 4. Kundenbezeichnung kürzen
        kunde = str(r.get('KUNDENBEZEICHNUNG', '') or '').strip()
        if re.match(r'^\d+\s*-\s*', kunde):
            kurz = shorten_kunde(kunde)
            r['KUNDENBEZEICHNUNG'] = kurz
            aenderungen.append({'id': id_, 'feld': 'KUNDENBEZEICHNUNG', 'vorher': kunde, 'nachher': kurz, 'typ': 'auto'})

        # 5. Neu? markieren
        bem = str(r.get('BEMERKUNG', '') or '').strip().lower()
        if bem in ['neu', 'neru'] or bem.startswith('neu,') or bem.startswith('neu '):
            r['Neu?'] = 'NEU'
            if bem != 'neu':
                aenderungen.append({'id': id_, 'feld': 'BEMERKUNG', 'vorher': r.get('BEMERKUNG',''), 'nachher': 'NEU', 'typ': 'auto'})

        processed.append(r)
    return processed, aenderungen

def build_excel(rows):
    # Exakte Spaltenreihenfolge wie Vorlage
    COLS = ['OBJEKTTYP','ID','BEZEICHNUNG','TYP','SERIENNUMMER','HERSTELLER','STATUS',
            'INTERVALL (MONATE)','LETZTE PRÜFUNG','LETZTER PRÜFER','STATUS TERMIN',
            'ERGEBNIS DER LETZTEN PRÜFUNG','NÄCHSTE PRÜFUNG','ABTEILUNG','KOSTENSTELLE',
            'DOKUMENTE','PRÜFSEQUENZ','AKTIV','ERFASST AM','GEÄNDERT AM','ERFASST VON',
            'BEMERKUNG','KUNDENBEZEICHNUNG','KUNDEN-ID','LIEGENSCHAFT','LIEGENSCHAFTS-ID',
            'GEBÄUDE','GEBÄUDE-ID','EBENE','EBENEN-ID','RAUM','RAUM-ID','Neu?']

    COL_WIDTHS = [12,7,42.4,18.6,25.4,16.1,10.4,20.9,18.1,17.4,16.3,31.1,19.3,23.3,
                  15.1,14.6,15.0,7.7,13.0,15.1,14.0,13.7,76.0,19.4,15.1,18.4,10.9,
                  13.3,8.3,12.1,8.1,10.6,13.1]

    YELLOW_COLS = {3, 14}  # BEZEICHNUNG (col 3), ABTEILUNG (col 14) - 1-indexed

    wb = Workbook()

    # ─── Tabelle6 (Pivot-Zusammenfassung) ───
    ws6 = wb.active
    ws6.title = 'Tabelle6'
    ws6.column_dimensions['A'].width = 60
    ws6.column_dimensions['B'].width = 30

    # Pivot berechnen
    from collections import Counter
    kunde_counts = Counter()
    for row in rows:
        k = str(row.get('KUNDENBEZEICHNUNG', '') or '').strip()
        if k:
            kunde_counts[k] += 1

    ws6['A3'] = 'Zeilenbeschriftungen'
    ws6['B3'] = 'Anzahl von KUNDENBEZEICHNUNG'
    ws6['A3'].font = Font(bold=True, size=11)
    ws6['B3'].font = Font(bold=True, size=11)

    row_idx = 4
    total = 0
    for kunde, count in sorted(kunde_counts.items()):
        ws6.cell(row=row_idx, column=1, value=kunde)
        ws6.cell(row=row_idx, column=2, value=count)
        total += count
        row_idx += 1

    ws6.cell(row=row_idx, column=1, value='Gesamtergebnis').font = Font(bold=True)
    ws6.cell(row=row_idx, column=2, value=total).font = Font(bold=True)

    # ─── Tabelle1 (Hauptdaten) ───
    ws1 = wb.create_sheet('Tabelle1')

    yellow_fill = PatternFill('solid', fgColor='FFFF00')

    # Header
    for col_idx, col_name in enumerate(COLS, 1):
        cell = ws1.cell(row=1, column=col_idx, value=col_name)
        cell.font = Font(size=11)
        if col_idx in YELLOW_COLS:
            cell.fill = yellow_fill

    # Spaltenbreiten
    for col_idx, width in enumerate(COL_WIDTHS, 1):
        ws1.column_dimensions[get_column_letter(col_idx)].width = width

    # Daten
    for row_num, row in enumerate(rows, 2):
        for col_idx, col_name in enumerate(COLS, 1):
            val = row.get(col_name, '')
            if val is None or str(val).strip() in ('', 'nan', 'None'):
                val = None
            cell = ws1.cell(row=row_num, column=col_idx, value=val)
            cell.font = Font(size=11)

    # ─── Tabelle2 (Normbezeichnungen) ───
    ws2 = wb.create_sheet('Tabelle2')
    ws2.column_dimensions['A'].width = 40
    ws2['A1'] = 'Anlagenbezeichnung'
    ws2['A1'].font = Font(size=10)
    for i, bez in enumerate(NORMBEZ, 2):
        ws2.cell(row=i, column=1, value=bez).font = Font(size=10)

    # ─── Tabelle3 (Raum-Mapping) - leer lassen, wird aus Vorlage befüllt ───
    ws3 = wb.create_sheet('Tabelle3')
    gray_fill = PatternFill('solid', fgColor='AAAAAA')
    for col_idx, header in enumerate(TABELLE3_HEADERS, 1):
        cell = ws3.cell(row=1, column=col_idx, value=header)
        cell.fill = gray_fill
        cell.font = Font(bold=True, size=10)

    # ─── Tabelle4 (leer) ───
    wb.create_sheet('Tabelle4')

    # Reihenfolge der Sheets wie Original
    wb._sheets = [ws6, ws1, ws2, ws3, wb['Tabelle4']]

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

def parse_csv(text):
    lines = [l for l in text.split('\n') if l.strip()]
    if not lines: return []
    sep = ';' if lines[0].count(';') > lines[0].count(',') else ','
    import csv
    reader = csv.DictReader(lines, delimiter=sep)
    return [dict(r) for r in reader]

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if not HAS_OPENPYXL:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(json.dumps({'error': 'openpyxl not installed'}).encode())
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)

        try:
            data = json.loads(body)
            csv_text = data.get('csv', '')
            rows = parse_csv(csv_text)
            processed, aenderungen = process_rows(rows)
            excel_bytes = build_excel(processed)
            excel_b64 = base64.b64encode(excel_bytes).decode()

            result = {
                'success': True,
                'excel_b64': excel_b64,
                'anzahl': len(processed),
                'aenderungen': aenderungen[:500],
                'stats': {
                    'gesamt': len(processed),
                    'auto': len([a for a in aenderungen if a['typ'] == 'auto']),
                    'bezeichnung': len([a for a in aenderungen if a['feld'] == 'BEZEICHNUNG']),
                    'raum': len([a for a in aenderungen if a['feld'] == 'RAUM']),
                    'kunde': len([a for a in aenderungen if a['feld'] == 'KUNDENBEZEICHNUNG']),
                    'neu': len([a for a in aenderungen if a['feld'] == 'BEMERKUNG']),
                }
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'success': False, 'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
