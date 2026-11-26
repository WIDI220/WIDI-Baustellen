"""SP Data Monatsabrechnung (PDF, auch Scan) auslesen.

POST /api/spdata-lesen
Header:  Authorization: Bearer <Supabase-Access-Token des angemeldeten Nutzers>
Body:    {"pdf": "<base64>", "dateiname": "..."}
Antwort: {"seiten": [ {name, personalnummer, monat, stand, summe:{...}, tage:[...]} ]}

Die PDF wird an Claude übergeben (liest auch eingescannte Seiten). Nur für angemeldete App-Nutzer.
"""
from http.server import BaseHTTPRequestHandler
import json, os, re, urllib.request, urllib.error

MODEL = os.environ.get('SPDATA_MODEL', 'claude-sonnet-5-5')

PROMPT = """Du bekommst eine PDF mit einer oder mehreren „Monatsabrechnung“-Seiten aus dem Zeiterfassungsprogramm SP Data.
Jede Monatsabrechnung gehört zu genau einem Mitarbeiter (Name oben links, Personalnummer rechts daneben).
Geht eine Monatsabrechnung über mehrere Seiten, fasse sie zu einem Eintrag zusammen.

Lies die Werte exakt ab (deutsches Zahlenformat 1,25 = 1.25). Erfinde nichts: Was leer oder unleserlich ist, ist null.
Spalten der Tabelle: Datum | kommt-geht | Zeiterfassung | Ges. | Soll | Pause | A.o. | Ist-Zeit | Krank | Urlaub | GLZ | Flexi | Ü-Std. | Abwesenheitsgrund.
Die Zeile „Summe:“ unten enthält die Monatssummen. „Wochensumme“-Zeilen nicht als Tage übernehmen.

Antworte NUR mit JSON in genau dieser Form, ohne weiteren Text:
{"seiten":[{"name":"Nachname, Vorname","personalnummer":"013356","monat":"2026-10","stand":"2026-11-05",
"summe":{"ges":179.28,"soll":171.0,"pause":9.0,"ao":0.0,"ist":170.28,"krank":23.0,"urlaub":0.0,"flexi":-3.40,"ue_std":2.68},
"tage":[{"datum":"2026-10-01","kommt_geht":"06:28-13:52","ges":7.40,"soll":8.0,"ist":6.90,"krank":null,"urlaub":null,"flexi":-1.10,"ue_std":null,"grund":null}]}]}"""


def _json(handler, code, obj):
    body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _angemeldet(token):
    url = (os.environ.get('VITE_SUPABASE_URL') or os.environ.get('SUPABASE_URL') or '').rstrip('/')
    key = os.environ.get('VITE_SUPABASE_ANON_KEY') or os.environ.get('SUPABASE_ANON_KEY') or ''
    if not (url and key and token):
        return False
    req = urllib.request.Request(f'{url}/auth/v1/user', headers={'apikey': key, 'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception:
        return False


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        auth = self.headers.get('Authorization', '')
        token = auth[7:] if auth.lower().startswith('bearer ') else ''
        if not _angemeldet(token):
            return _json(self, 401, {'error': 'Nicht angemeldet'})
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            return _json(self, 500, {'error': 'ANTHROPIC_API_KEY fehlt in Vercel'})
        try:
            length = int(self.headers.get('Content-Length', 0))
            data = json.loads(self.rfile.read(length) or b'{}')
            pdf_b64 = data.get('pdf') or ''
            if not pdf_b64:
                return _json(self, 400, {'error': 'Keine PDF übergeben'})
        except Exception as e:
            return _json(self, 400, {'error': f'Ungültige Anfrage: {e}'})

        payload = {
            'model': MODEL,
            'max_tokens': 16000,
            'messages': [{'role': 'user', 'content': [
                {'type': 'document', 'source': {'type': 'base64', 'media_type': 'application/pdf', 'data': pdf_b64}},
                {'type': 'text', 'text': PROMPT},
            ]}],
        }
        req = urllib.request.Request('https://api.anthropic.com/v1/messages', data=json.dumps(payload).encode('utf-8'), headers={
            'x-api-key': api_key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=290) as r:
                resp = json.loads(r.read())
        except urllib.error.HTTPError as e:
            return _json(self, 502, {'error': f'Claude-API {e.code}: {e.read().decode("utf-8", "ignore")[:400]}'})
        except Exception as e:
            return _json(self, 502, {'error': f'Claude-API nicht erreichbar: {e}'})

        text = ''.join(b.get('text', '') for b in resp.get('content', []) if b.get('type') == 'text')
        m = re.search(r'\{.*\}', text, re.S)
        if not m:
            return _json(self, 502, {'error': 'Antwort enthielt kein JSON', 'roh': text[:500]})
        try:
            out = json.loads(m.group(0))
        except Exception as e:
            return _json(self, 502, {'error': f'JSON nicht lesbar: {e}', 'roh': text[:500]})
        return _json(self, 200, {'seiten': out.get('seiten', []), 'modell': MODEL})

    def do_GET(self):
        return _json(self, 405, {'error': 'Nur POST'})
