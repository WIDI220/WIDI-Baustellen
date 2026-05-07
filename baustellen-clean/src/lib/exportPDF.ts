import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STUNDENSATZ = 38.08;

// WIDI Logo als base64 (GIF)
const WIDI_LOGO_B64 = 'R0lGODlhFAFSAPf/ANXf7e6DAOypMbK0tqWoqvj4+PDw8J2gogCb2rm8vfX19ZaanO+2L73Awet8Aq6xsgByura5ugBstZibnTWWSvOSAPK/LHl+gUebRwCp5cbIyXKuOXF2eYeLjeHi4uzt7fCKAH6ChPfTJIq7KdPV1nqyNPLDLMvMzY2Qk+l3BYqNkGurO5CUlgxFlwNMnACFyfb299U7F/viHNxSFFykQaGkpurq6/KNAACCVAB8V9LU1fjaIXV6fcPFxpueoI28J/C6Lt3e3waOT4S3LvXLKeFgEdEsGPPHKwCKUfnfHmaoPffWJPvkGayvsYiMjq+ys9lKFYSIi6OmqI6RlGpvcpGVl+Xm5u7v783P0Le6u9DR0pSXmQCLzvLy8wBUos4cGQBeqt5ZErS3uMHDxFWhQ1iiQu2tMCyTTCWSTQCX18jKywCR087Q0QCm4tfY2airrNHT1HR4e+6xMNAlGeRoDpG/IwCg3nh9f4KGiKqtrthFFoe6LOJjEG9zdvnbIYCEh3yAgwBjrj+ZSdMzGPzpE+ZuC4C1MOdxCQB5wFCfRByRTvjZIQCS09dBFghJmpPAIWOnP99cEgCCxwB8wgB/VvbPJ+VtDBKPTwCP0s8gGc0XGfzqEpTBH7y+wNna28/R0qCjpfX29uLj5IOHisLQ5XB1d6msrmhtcGlucfr6+vfZpdZCQ6/Wym+1oOmZmvLFxb/e1e6zSld/t/ni4mxxdI/Ftfrpy5St0f39/QB/xWtwc/v8/N/g4f7+/vf4+Pv7++fo6PPz9MXHyG5yde3u7ubn597f3/z8/Orr6/Hx8by+v4GFiNvc3W90d8nLzKuur+jp6dja2tnb23uAguTl5vzqE7/Bw+fn6L2/wNXX1+Tr9OTk5X+Dht7f4PzmGOnq6vznF7O1t8PFx+Pk5PC3L9jZ2m1ydQB4v3Z7ftrb3NU4F+vs7Nzd3szOz/voFHJ3egBXpfjYI/jesMDf1f34+LbH4Ov18vvs0u2srdzt6PzoF/XQ0Nvt5/Dz+Gdsb////yH/C1hNUCBEYXRhWE1QPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRhLyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS41LWMwMjEgNzkuMTU1NzcyLCAyMDE0LzAxLzEzLTE5OjQ0OjAwICAgICAgICAiPiA8cmRmOlJERiB4bWxuczpyZGY9Imh0dHA6Ly93d3cudzMub3JnLzE5OTkvMDIvMjItcmRmLXN5bnRheC1ucyMiPiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0iIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtbG5zOnhtcE1NPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vIiB4bWxuczpzdFJlZj0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL3NUeXBlL1Jlc291cmNlUmVmIyIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ0MgMjAxNCAoTWFjaW50b3NoKSIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDo5QkNCRTY2QTMwRTgxMUU0QjAyQ0VENjAyM0U2NzkzNyIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDo5QkNCRTY2QjMwRTgxMUU0QjAyQ0VENjAyM0U2NzkzNyI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOjlCQ0JFNjY4MzBFODExRTRCMDJDRUQ2MDIzRTY3OTM3IiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOjlCQ0JFNjY5MzBFODExRTRCMDJDRUQ2MDIzRTY3OTM3Ii8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+Af/+/fz7+vn49/b19PPy8fDv7u3s6+rp6Ofm5eTj4uHg397d3Nva2djX1tXU09LR0M/OzczLysnIx8bFxMPCwcC/vr28u7q5uLe2tbSzsrGwr66trKuqqainpqWko6KhoJ+enZybmpmYl5aVlJOSkZCPjo2Mi4qJiIeGhYSDgoGAf359fHt6eXh3dnV0c3JxcG9ubWxramloZ2ZlZGNiYWBfXl1cW1pZWFdWVVRTUlFQT05NTEtKSUhHRkVEQ0JBQD8+PTw7Ojk4NzY1NDMyMTAvLi0sKyopKCcm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';

const C = {
  navy:    [15, 31, 61]    as [number,number,number],
  blue:    [30, 58, 95]    as [number,number,number],
  accent:  [37, 99, 235]   as [number,number,number],
  green:   [16, 185, 129]  as [number,number,number],
  widiGreen: [34, 139, 34] as [number,number,number],
  widiDark:  [20, 80, 20]  as [number,number,number],
  red:     [239, 68, 68]   as [number,number,number],
  amber:   [245, 158, 11]  as [number,number,number],
  purple:  [139, 92, 246]  as [number,number,number],
  orange:  [249, 115, 22]  as [number,number,number],
  white:   [255, 255, 255] as [number,number,number],
  light:   [244, 246, 250] as [number,number,number],
  border:  [229, 233, 242] as [number,number,number],
  gray:    [107, 122, 153] as [number,number,number],
  text:    [50,  65,  90]  as [number,number,number],
};

const eur = (n: number) => n.toLocaleString('de-DE', { style:'currency', currency:'EUR', minimumFractionDigits:2 });
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits:0, maximumFractionDigits:2 });
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('de-DE') : '–';

function setColor(doc: jsPDF, c: [number,number,number]) { doc.setTextColor(c[0], c[1], c[2]); }
function setFill(doc: jsPDF, c: [number,number,number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setDraw(doc: jsPDF, c: [number,number,number]) { doc.setDrawColor(c[0], c[1], c[2]); }

function header(doc: jsPDF, bsName: string, subtitle: string) {
  setFill(doc, C.navy); doc.rect(0, 0, 210, 14, 'F');
  setFill(doc, C.accent); doc.rect(0, 14, 210, 2, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  setColor(doc, C.white);
  doc.text('WIDI BAUSTELLEN CONTROLLING', 14, 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
  doc.text(`${bsName}  ·  ${subtitle}`, 14, 11);
  const now = new Date().toLocaleDateString('de-DE', {day:'2-digit', month:'long', year:'numeric'});
  doc.text(now, 196, 6, {align:'right'});
  const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
  doc.text(`Seite ${pg}`, 196, 11, {align:'right'});
}

function footer(doc: jsPDF) {
  setDraw(doc, C.border); doc.line(14, 284, 196, 284);
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
  setColor(doc, C.gray);
  doc.text('Vertraulich – Nur für interne Verwendung', 14, 288);
  doc.text('WIDI Baustellen Controlling', 196, 288, {align:'right'});
}

function sectionTitle(doc: jsPDF, title: string, y: number): number {
  setFill(doc, C.light); doc.rect(14, y, 182, 8, 'F');
  setFill(doc, C.accent); doc.rect(14, y, 3, 8, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  setColor(doc, C.navy);
  doc.text(title, 20, y + 5.5);
  return y + 12;
}

function kpiRow(doc: jsPDF, items: {label:string, value:string, color?:[number,number,number]}[], y: number): number {
  const w = 182 / items.length;
  items.forEach((item, i) => {
    const x = 14 + i * w;
    setFill(doc, C.light); doc.roundedRect(x + (i>0?2:0), y, w - (i>0?4:2), 16, 1.5, 1.5, 'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); setColor(doc, C.gray);
    doc.text(item.label, x + (i>0?5:3), y + 5.5);
    doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    setColor(doc, item.color || C.navy);
    doc.text(item.value, x + (i>0?5:3), y + 13);
  });
  return y + 20;
}

function progressBar(doc: jsPDF, x: number, y: number, w: number, pct: number, over: boolean): number {
  setFill(doc, C.border); doc.roundedRect(x, y, w, 4.5, 1, 1, 'F');
  const fill = Math.min(pct, 100) / 100 * w;
  if (fill > 0) {
    setFill(doc, over ? C.red : pct > 80 ? C.amber : C.accent);
    doc.roundedRect(x, y, fill, 4.5, 1, 1, 'F');
  }
  doc.setFont('helvetica','bold'); doc.setFontSize(7);
  setColor(doc, over ? C.red : C.navy);
  doc.text(`${pct}%`, x + w + 2, y + 3.5);
  return y + 7;
}

function splitBar(doc: jsPDF, x: number, y: number, w: number, personal: number, material: number): number {
  const total = personal + material;
  if (total === 0) return y + 10;
  const pW = (personal / total) * w;
  const mW = w - pW;
  setFill(doc, C.blue); doc.roundedRect(x, y, pW, 6, 0, 0, 'F');
  setFill(doc, [14, 165, 233]); doc.roundedRect(x + pW, y, mW, 6, 0, 0, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(6.5); setColor(doc, C.white);
  if (pW > 25) doc.text(`Personal ${Math.round(personal/total*100)}%`, x + pW/2, y+4.2, {align:'center'});
  if (mW > 25) doc.text(`Material ${Math.round(material/total*100)}%`, x+pW+mW/2, y+4.2, {align:'center'});
  y += 9;
  doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.gray);
  return y;
}

// Hilfsfunktion: Bild per URL als base64 laden
async function loadImageAsBase64(url: string): Promise<{data:string, format:'JPEG'|'PNG'|'GIF'} | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const reader = new FileReader();
    return await new Promise((resolve) => {
      reader.onload = () => {
        const result = reader.result as string;
        const format = blob.type.includes('png') ? 'PNG' : blob.type.includes('gif') ? 'GIF' : 'JPEG';
        resolve({ data: result, format });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function exportBaustellePDF(
  bs: any,
  stunden: any[],
  materialien: any[],
  nachtraege: any[],
  fotos: any[] = [],
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const STUNDENSATZ_LOCAL = 38.08;
  const maMap: Record<string, {name:string, stunden:number, kosten:number}> = {};
  stunden.forEach(s => {
    const name = s.employees?.name || 'Unbekannt';
    const satz = Number(s.employees?.stundensatz ?? STUNDENSATZ_LOCAL);
    if (!maMap[name]) maMap[name] = {name, stunden:0, kosten:0};
    maMap[name].stunden += Number(s.stunden);
    maMap[name].kosten  += Number(s.stunden) * satz;
  });
  const maList = Object.values(maMap).sort((a,b) => b.kosten - a.kosten);

  const gesamtH   = stunden.reduce((s,e) => s + Number(e.stunden), 0);
  const personal  = stunden.reduce((s,e) => s + Number(e.stunden) * Number(e.employees?.stundensatz ?? STUNDENSATZ_LOCAL), 0);
  const material  = materialien.reduce((s,m) => s + Number(m.gesamtpreis ?? 0), 0);
  const gesamt    = personal + material;
  const budget    = Number(bs.budget ?? 0);
  const nGenehmigt   = nachtraege.filter(n=>n.status==='genehmigt').reduce((s,n)=>s+Number(n.betrag),0);
  const nEingereicht = nachtraege.filter(n=>n.status==='eingereicht').reduce((s,n)=>s+Number(n.betrag),0);
  const nAbgelehnt   = nachtraege.filter(n=>n.status==='abgelehnt').reduce((s,n)=>s+Number(n.betrag),0);
  const effBudget = budget + nGenehmigt;
  const pct  = effBudget > 0 ? Math.round(gesamt / effBudget * 100) : 0;
  const over = pct > 100;
  const marge = effBudget - gesamt;
  const matBestellt  = materialien.filter(m=>m.status==='bestellt').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
  const matGeliefert = materialien.filter(m=>m.status==='geliefert').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
  const matVerbraucht= materialien.filter(m=>m.status==='verbraucht').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);

  // ════════ SEITE 1 – ÜBERSICHT ════════
  header(doc, bs.name, 'Projektbericht');
  let y = 22;

  // Titel-Block
  setFill(doc, C.navy); doc.roundedRect(14, y, 182, 28, 2, 2, 'F');
  setFill(doc, C.accent); doc.roundedRect(14, y+24, 182, 4, 0, 0, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(15); setColor(doc, C.white);
  const shortName = bs.name.length > 60 ? bs.name.slice(0,57)+'…' : bs.name;
  doc.text(shortName, 20, y+10);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(`${bs.auftraggeber||'–'}  ·  ${bs.adresse||'–'}`, 20, y+17);
  const badge = bs.status?.toUpperCase() || 'AKTIV';
  doc.setFont('helvetica','bold'); doc.setFontSize(7);
  setColor(doc, [147,197,253] as [number,number,number]);
  doc.text(badge, 196, y+10, {align:'right'});
  y += 36;

  // KPIs
  y = kpiRow(doc, [
    {label:'Effektives Budget', value:eur(effBudget)},
    {label:'Gesamtkosten', value:eur(gesamt), color:over?C.red:C.navy},
    {label:'Verbleibend', value:eur(marge), color:marge>=0?C.green:C.red},
    {label:'Auslastung', value:`${pct}%`, color:over?C.red:pct>80?C.amber:C.navy},
  ], y);

  y = kpiRow(doc, [
    {label:'Personalkosten', value:eur(personal), color:C.blue},
    {label:'Materialkosten', value:eur(material), color:C.orange},
    {label:'Stunden gesamt', value:`${fmt(gesamtH)}h`, color:C.purple},
    {label:'Einträge', value:String(stunden.length), color:C.gray},
  ], y);

  if (effBudget > 0) {
    y = sectionTitle(doc, 'Budget-Auslastung', y);
    y = progressBar(doc, 14, y, 172, pct, over);
    y += 4;
  }

  if (gesamt > 0) {
    y = sectionTitle(doc, 'Kostenaufteilung', y);
    y = splitBar(doc, 14, y, 182, personal, material);
    y += 4;
  }

  if (nachtraege.length > 0) {
    y = sectionTitle(doc, `Nachträge  (${nachtraege.length})`, y);
    y = kpiRow(doc, [
      {label:'Genehmigt', value:eur(nGenehmigt), color:C.green},
      {label:'Eingereicht', value:eur(nEingereicht), color:C.accent},
      {label:'Abgelehnt', value:eur(nAbgelehnt), color:C.red},
    ], y);
    y += 2;
  }

  y = sectionTitle(doc, 'Projektdetails', y);
  const details = [
    ['Startdatum', fmtDate(bs.startdatum)], ['Frist / Ende', fmtDate(bs.enddatum)],
    ['Auftraggeber', bs.auftraggeber||'–'], ['Adresse', bs.adresse||'–'],
    ['Gewerk', bs.gewerk||'–'], ['Projektleiter', bs.projektleiter||'–'],
  ];
  details.forEach(([l,v],i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const cx = 14 + col * 61; const cy = y + row * 10;
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); setColor(doc, C.gray);
    doc.text(l, cx, cy);
    doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.text);
    doc.text(String(v), cx, cy+4.5);
  });
  y += Math.ceil(details.length / 3) * 10 + 4;

  if (bs.beschreibung) {
    y = sectionTitle(doc, 'Projektbeschreibung', y);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.text);
    const lines = doc.splitTextToSize(bs.beschreibung, 178);
    doc.text(lines, 14, y);
    y += lines.length * 4 + 6;
  }

  footer(doc);

  // ════════ SEITE 2 – ZEITERFASSUNG ════════
  if (stunden.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Zeiterfassung');
    let sy = 22;
    sy = sectionTitle(doc, `Zeiterfassung  –  ${fmt(gesamtH)}h gesamt  ·  ${eur(personal)} Personalkosten`, sy);

    if (maList.length > 0) {
      doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.navy);
      doc.text('Übersicht nach Mitarbeiter', 14, sy); sy += 5;
      maList.forEach((m, i) => {
        const maxH = maList[0].stunden;
        const barW = 80;
        const mPct = maxH > 0 ? m.stunden / maxH : 0;
        const rowY = sy + i * 9;
        if (rowY > 270) return;
        if (i % 2 === 0) { setFill(doc, C.light); doc.rect(14, rowY-2, 182, 9, 'F'); }
        doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.text);
        doc.text(m.name, 14, rowY+4);
        setFill(doc, C.border); doc.roundedRect(80, rowY, barW, 4, 1,1,'F');
        setFill(doc, C.accent); doc.roundedRect(80, rowY, barW*mPct, 4, 1,1,'F');
        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); setColor(doc, C.navy);
        doc.text(`${fmt(m.stunden)}h`, 165, rowY+3.5);
        setColor(doc, C.gray);
        doc.text(eur(m.kosten), 196, rowY+3.5, {align:'right'});
      });
      sy += maList.length * 9 + 8;
    }

    doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.navy);
    doc.text('Alle Einträge', 14, sy); sy += 3;
    autoTable(doc, {
      startY: sy,
      head: [['Datum', 'Mitarbeiter', 'Stunden', 'Stundensatz', 'Kosten', 'Tätigkeit']],
      body: stunden.map(w => [
        fmtDate(w.datum), w.employees?.name||'–', `${w.stunden}h`,
        `${eur(Number(w.employees?.stundensatz??STUNDENSATZ_LOCAL))}/h`,
        eur(Number(w.stunden)*Number(w.employees?.stundensatz??STUNDENSATZ_LOCAL)),
        w.beschreibung||'–',
      ]),
      foot: [['','Gesamt',`${fmt(gesamtH)}h`,'',eur(personal),'']],
      headStyles: {fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7.5},
      bodyStyles: {fontSize:7, textColor:C.text},
      footStyles: {fillColor:C.light, textColor:C.navy, fontStyle:'bold', fontSize:7.5},
      alternateRowStyles: {fillColor:C.light},
      columnStyles: {0:{cellWidth:20},2:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold'},5:{cellWidth:50}},
      margin: {left:14, right:14},
    });
    footer(doc);
  }

  // ════════ SEITE 3 – MATERIAL ════════
  if (materialien.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Material');
    let my = 22;
    my = sectionTitle(doc, `Material  –  ${materialien.length} Positionen  ·  ${eur(material)} gesamt`, my);
    my = kpiRow(doc, [
      {label:'Bestellt', value:eur(matBestellt), color:C.amber},
      {label:'Geliefert', value:eur(matGeliefert), color:C.accent},
      {label:'Verbraucht', value:eur(matVerbraucht), color:C.green},
      {label:'Gesamt', value:eur(material), color:C.navy},
    ], my);
    autoTable(doc, {
      startY: my,
      head: [['Bezeichnung','Menge','Einheit','Einzelpreis','Gesamtpreis','Status','Datum']],
      body: materialien.map(m=>[m.bezeichnung,fmt(m.menge),m.einheit||'–',eur(m.einzelpreis),eur(m.gesamtpreis),m.status,fmtDate(m.datum)]),
      foot: [['Gesamt',`${materialien.length} Pos.`,'','',eur(material),'','']],
      headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:7,textColor:C.text},
      footStyles:{fillColor:C.light,textColor:C.navy,fontStyle:'bold',fontSize:7.5},
      alternateRowStyles:{fillColor:C.light},
      columnStyles:{1:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold'}},
      margin:{left:14,right:14},
    });
    footer(doc);
  }

  // ════════ SEITE 4 – NACHTRÄGE ════════
  if (nachtraege.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Nachträge');
    let ny = 22;
    ny = sectionTitle(doc, `Nachträge  –  ${nachtraege.length} gesamt  ·  ${eur(nGenehmigt)} genehmigt`, ny);
    ny = kpiRow(doc, [
      {label:'Genehmigt', value:eur(nGenehmigt), color:C.green},
      {label:'Eingereicht', value:eur(nEingereicht), color:C.accent},
      {label:'Abgelehnt', value:eur(nAbgelehnt), color:C.red},
      {label:'Gesamt', value:eur(nGenehmigt+nEingereicht+nAbgelehnt), color:C.navy},
    ], ny);
    autoTable(doc, {
      startY: ny,
      head: [['Titel','Betrag','Status','Datum','Beschreibung']],
      body: nachtraege.map(n=>[n.titel,eur(n.betrag),n.status,fmtDate(n.datum),n.beschreibung||'–']),
      headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:7,textColor:C.text},
      alternateRowStyles:{fillColor:C.light},
      columnStyles:{1:{halign:'right',fontStyle:'bold'},3:{cellWidth:18}},
      didParseCell:(data)=>{ if(data.section==='body'&&data.column.index===2){const v=String(data.cell.raw);if(v==='genehmigt')data.cell.styles.textColor=C.green;if(v==='eingereicht')data.cell.styles.textColor=C.accent;if(v==='abgelehnt')data.cell.styles.textColor=C.red;}},
      margin:{left:14,right:14},
    });
    footer(doc);
  }

  // ════════ SEITE 5 – FOTOS ════════
  if (fotos.length > 0) {
    // Fotos nach Kategorie gruppieren
    const fotoByKat: Record<string, any[]> = {};
    fotos.forEach(f => {
      const kat = f.kategorie || 'sonstiges';
      if (!fotoByKat[kat]) fotoByKat[kat] = [];
      fotoByKat[kat].push(f);
    });
    const KAT_LABELS: Record<string,string> = {vorher:'Vorher',nachher:'Nachher',maengel:'Mängel',abnahme:'Abnahme',fortschritt:'Fortschritt',sonstiges:'Sonstiges'};

    doc.addPage();
    header(doc, bs.name, 'Dokumentationsfotos');
    let fy = 22;
    fy = sectionTitle(doc, `Fotos  –  ${fotos.length} gesamt`, fy);

    for (const [kat, katFotos] of Object.entries(fotoByKat)) {
      if (fy > 250) { doc.addPage(); header(doc, bs.name, 'Dokumentationsfotos'); footer(doc); fy = 22; }
      doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.navy);
      doc.text(KAT_LABELS[kat] || kat, 14, fy); fy += 4;

      // 3 Fotos pro Zeile
      const cols = 3;
      const imgW = 56; const imgH = 40;
      const gap = 7;

      for (let i = 0; i < katFotos.length; i += cols) {
        if (fy + imgH + 10 > 275) { doc.addPage(); header(doc, bs.name, 'Dokumentationsfotos'); footer(doc); fy = 22; }
        const row = katFotos.slice(i, i + cols);
        for (let j = 0; j < row.length; j++) {
          const foto = row[j];
          const x = 14 + j * (imgW + gap);
          try {
            const imgData = await loadImageAsBase64(foto.url);
            if (imgData) {
              doc.addImage(imgData.data, imgData.format, x, fy, imgW, imgH, undefined, 'FAST');
            } else {
              setFill(doc, C.light); doc.rect(x, fy, imgW, imgH, 'F');
              setColor(doc, C.gray); doc.setFontSize(7);
              doc.text('Foto nicht verfügbar', x + imgW/2, fy + imgH/2, {align:'center'});
            }
          } catch {
            setFill(doc, C.light); doc.rect(x, fy, imgW, imgH, 'F');
          }
          if (foto.beschreibung) {
            doc.setFont('helvetica','normal'); doc.setFontSize(6); setColor(doc, C.gray);
            const desc = foto.beschreibung.length > 30 ? foto.beschreibung.slice(0,27)+'…' : foto.beschreibung;
            doc.text(desc, x + imgW/2, fy + imgH + 4, {align:'center'});
          }
          if (foto.datum) {
            doc.setFont('helvetica','normal'); doc.setFontSize(5.5); setColor(doc, C.gray);
            doc.text(fmtDate(foto.datum), x + imgW/2, fy + imgH + 8, {align:'center'});
          }
        }
        fy += imgH + 14;
      }
      fy += 4;
    }
    footer(doc);
  }

  // ════════ LETZTE SEITE – ZUSAMMENFASSUNG ════════
  doc.addPage();
  header(doc, bs.name, 'Zusammenfassung');
  let zy = 22;
  zy = sectionTitle(doc, 'Finanzielle Zusammenfassung', zy);
  zy = kpiRow(doc, [
    {label:'Budget (original)', value:eur(budget)},
    {label:'Genehmigte Nachträge', value:`+ ${eur(nGenehmigt)}`, color:C.green},
    {label:'Effektives Budget', value:eur(effBudget), color:C.navy},
    {label:'Auslastung', value:`${pct}%`, color:over?C.red:pct>80?C.amber:C.navy},
  ], zy);
  zy = kpiRow(doc, [
    {label:'Personalkosten', value:eur(personal), color:C.purple},
    {label:'Materialkosten', value:eur(material), color:C.orange},
    {label:'Gesamtkosten', value:eur(gesamt), color:over?C.red:C.navy},
    {label:'Marge', value:`${marge>=0?'+':''}${eur(marge)}`, color:marge>=0?C.green:C.red},
  ], zy);
  if (effBudget > 0) { zy = progressBar(doc, 14, zy, 172, pct, over); zy += 6; }
  zy = sectionTitle(doc, 'Personalkosten nach Mitarbeiter', zy);
  autoTable(doc, {
    startY: zy,
    head: [['Mitarbeiter','Stunden','Stundensatz','Kosten','Anteil']],
    body: maList.map(m=>[m.name,`${fmt(m.stunden)}h`,`${eur(m.kosten>0&&m.stunden>0?m.kosten/m.stunden:STUNDENSATZ_LOCAL)}/h`,eur(m.kosten),personal>0?`${Math.round(m.kosten/personal*100)}%`:'–']),
    foot: [['Gesamt',`${fmt(gesamtH)}h`,'',eur(personal),'100%']],
    headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:7.5},
    bodyStyles:{fontSize:7.5,textColor:C.text},
    footStyles:{fillColor:C.light,textColor:C.navy,fontStyle:'bold',fontSize:7.5},
    alternateRowStyles:{fillColor:C.light},
    columnStyles:{1:{halign:'right'},2:{halign:'right'},3:{halign:'right',fontStyle:'bold'},4:{halign:'right'}},
    margin:{left:14,right:14},
  });
  footer(doc);

  const filename = `${bs.name.replace(/[^\wäöüÄÖÜß\s]/g,'').trim().replace(/\s+/g,'_')}_Bericht.pdf`;
  doc.save(filename);
}

// ════════════════════════════════════════════════════════
// ABNAHMESCHEIN
// ════════════════════════════════════════════════════════
export interface AbnahmeOptionen {
  projektdaten: boolean;
  beschreibung: boolean;
  stunden: boolean;
  material: boolean;
  nachtraege: boolean;
  fotos: boolean;
  maengelliste: boolean;
  unterschriften: boolean;
  bemerkungsfeld: boolean;
}

export async function exportAbnahmeschein(
  bs: any,
  stunden: any[],
  materialien: any[],
  nachtraege: any[],
  fotos: any[],
  optionen: AbnahmeOptionen,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const STUNDENSATZ_LOCAL = 38.08;
  const personal  = stunden.reduce((s,e) => s + Number(e.stunden) * Number(e.employees?.stundensatz ?? STUNDENSATZ_LOCAL), 0);
  const material  = materialien.reduce((s,m) => s + Number(m.gesamtpreis ?? 0), 0);
  const gesamt    = personal + material;
  const gesamtH   = stunden.reduce((s,e) => s + Number(e.stunden), 0);
  const budget    = Number(bs.budget ?? 0);
  const nGenehmigt = nachtraege.filter(n=>n.status==='genehmigt').reduce((s,n)=>s+Number(n.betrag),0);
  const effBudget = budget + nGenehmigt;
  const today = new Date().toLocaleDateString('de-DE', {day:'2-digit', month:'long', year:'numeric'});
  const bsNummer = bs.name.match(/[A-Z]\d{2}-\d{4,6}/)?.[0] || '';

  // WIDI Grün Design
  const G = {
    dark:   [20, 80, 20]   as [number,number,number],
    mid:    [34, 120, 34]  as [number,number,number],
    light:  [200, 230, 200] as [number,number,number],
    bg:     [240, 250, 240] as [number,number,number],
    white:  [255,255,255]  as [number,number,number],
    gray:   [100,120,100]  as [number,number,number],
    text:   [30, 50, 30]   as [number,number,number],
    border: [150, 200, 150] as [number,number,number],
  };

  const gHeader = () => {
    // Grüner Header-Balken
    doc.setFillColor(G.dark[0], G.dark[1], G.dark[2]);
    doc.rect(0, 0, 210, 22, 'F');
    doc.setFillColor(G.mid[0], G.mid[1], G.mid[2]);
    doc.rect(0, 22, 210, 3, 'F');

    // WIDI Logo (GIF als base64)
    try {
      doc.addImage('data:image/gif;base64,' + WIDI_LOGO_B64, 'GIF', 14, 2, 40, 18);
    } catch {
      // Logo-Fallback: Text
      doc.setFont('helvetica','bold'); doc.setFontSize(14);
      doc.setTextColor(255,255,255);
      doc.text('widi', 14, 14);
    }

    // Rechts: Titel
    doc.setFont('helvetica','bold'); doc.setFontSize(9);
    doc.setTextColor(255,255,255);
    doc.text('ABNAHMESCHEIN', 196, 9, {align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(7);
    doc.setTextColor(180, 220, 180);
    doc.text('Wirtschaftsdienste Hellersen GmbH  ·  Unternehmensverbund WIDI', 196, 15, {align:'right'});

    const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
    doc.setTextColor(180,220,180);
    doc.text(`Seite ${pg}`, 196, 20, {align:'right'});
  };

  const gFooter = () => {
    doc.setDrawColor(G.border[0], G.border[1], G.border[2]);
    doc.line(14, 284, 196, 284);
    doc.setFont('helvetica','normal'); doc.setFontSize(6);
    doc.setTextColor(G.gray[0], G.gray[1], G.gray[2]);
    doc.text('WIDI Wirtschaftsdienste Hellersen GmbH  ·  Unternehmensverbund WIDI', 14, 288);
    doc.text(today, 196, 288, {align:'right'});
  };

  const gSection = (title: string, y: number): number => {
    doc.setFillColor(G.light[0], G.light[1], G.light[2]);
    doc.rect(14, y, 182, 7, 'F');
    doc.setFillColor(G.mid[0], G.mid[1], G.mid[2]);
    doc.rect(14, y, 3, 7, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.setTextColor(G.dark[0], G.dark[1], G.dark[2]);
    doc.text(title, 20, y + 5);
    return y + 11;
  };

  // ═══ SEITE 1 – DECKBLATT ═══
  gHeader();
  let y = 30;

  // Grüner Titel-Block
  doc.setFillColor(G.dark[0], G.dark[1], G.dark[2]);
  doc.roundedRect(14, y, 182, 30, 2, 2, 'F');
  doc.setFillColor(G.mid[0], G.mid[1], G.mid[2]);
  doc.roundedRect(14, y+26, 182, 4, 0, 0, 'F');

  doc.setFont('helvetica','bold'); doc.setFontSize(13);
  doc.setTextColor(255,255,255);
  doc.text('ABNAHMESCHEIN', 20, y+9);
  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  const shortName = bs.name.length > 65 ? bs.name.slice(0,62)+'…' : bs.name;
  doc.text(shortName, 20, y+17);
  doc.text(`Auftraggeber: ${bs.auftraggeber||'–'}`, 20, y+23);
  doc.setFont('helvetica','bold'); doc.setFontSize(8);
  doc.setTextColor(180, 230, 180);
  doc.text(bsNummer, 196, y+9, {align:'right'});
  doc.setFont('helvetica','normal'); doc.setFontSize(7);
  doc.text(today, 196, y+17, {align:'right'});
  y += 38;

  // ═══ PROJEKTDATEN ═══
  if (optionen.projektdaten) {
    y = gSection('Projektdaten', y);
    const felder = [
      ['Projektnummer', bsNummer||bs.name.slice(0,20)],
      ['Projektbezeichnung', bs.name],
      ['Auftraggeber', bs.auftraggeber||'–'],
      ['Adresse / Objekt', bs.adresse||'–'],
      ['Startdatum', fmtDate(bs.startdatum)],
      ['Fertigstellungsdatum', fmtDate(bs.enddatum)],
      ['Projektleiter', bs.projektleiter||'–'],
      ['Gewerk', bs.gewerk||'–'],
    ];
    felder.forEach(([label, wert], i) => {
      const col = i % 2; const row = Math.floor(i / 2);
      const cx = 14 + col * 91; const cy = y + row * 11;
      if (i % 2 === 0) {
        doc.setFillColor(G.bg[0], G.bg[1], G.bg[2]);
        doc.rect(14, cy - 2, 182, 11, 'F');
      }
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
      doc.setTextColor(G.gray[0], G.gray[1], G.gray[2]);
      doc.text(label, cx + 2, cy + 3);
      doc.setFont('helvetica','bold'); doc.setFontSize(8);
      doc.setTextColor(G.text[0], G.text[1], G.text[2]);
      const wertShort = String(wert).length > 40 ? String(wert).slice(0,37)+'…' : String(wert);
      doc.text(wertShort, cx + 2, cy + 8);
    });
    y += Math.ceil(felder.length / 2) * 11 + 4;
  }

  // ═══ BESCHREIBUNG ═══
  if (optionen.beschreibung && bs.beschreibung) {
    y = gSection('Leistungsbeschreibung', y);
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(G.text[0], G.text[1], G.text[2]);
    const lines = doc.splitTextToSize(bs.beschreibung, 178);
    doc.text(lines, 14, y);
    y += lines.length * 4.5 + 6;
  }

  // ═══ STUNDEN / PERSONAL ═══
  if (optionen.stunden && stunden.length > 0) {
    if (y > 210) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    y = gSection(`Erbrachte Leistungen – ${fmt(gesamtH)}h  ·  ${eur(personal)}`, y);
    const maMap2: Record<string,{name:string,stunden:number,kosten:number}> = {};
    stunden.forEach(s => {
      const name = s.employees?.name||'Unbekannt';
      const satz = Number(s.employees?.stundensatz??STUNDENSATZ_LOCAL);
      if(!maMap2[name]) maMap2[name]={name,stunden:0,kosten:0};
      maMap2[name].stunden += Number(s.stunden);
      maMap2[name].kosten  += Number(s.stunden)*satz;
    });
    autoTable(doc, {
      startY: y,
      head: [['Mitarbeiter','Stunden','Kosten']],
      body: Object.values(maMap2).sort((a,b)=>b.stunden-a.stunden).map(m=>[m.name,`${fmt(m.stunden)}h`,eur(m.kosten)]),
      foot: [['Gesamt',`${fmt(gesamtH)}h`,eur(personal)]],
      headStyles:{fillColor:[G.dark[0],G.dark[1],G.dark[2]],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:7.5,textColor:[G.text[0],G.text[1],G.text[2]]},
      footStyles:{fillColor:[G.light[0],G.light[1],G.light[2]],textColor:[G.dark[0],G.dark[1],G.dark[2]],fontStyle:'bold',fontSize:8},
      alternateRowStyles:{fillColor:[G.bg[0],G.bg[1],G.bg[2]]},
      columnStyles:{1:{halign:'right'},2:{halign:'right',fontStyle:'bold'}},
      margin:{left:14,right:14},
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══ MATERIAL ═══
  if (optionen.material && materialien.length > 0) {
    if (y > 210) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    y = gSection(`Material – ${materialien.length} Positionen  ·  ${eur(material)}`, y);
    autoTable(doc, {
      startY: y,
      head: [['Bezeichnung','Menge','Einheit','Einzelpreis','Gesamt']],
      body: materialien.map(m=>[m.bezeichnung,fmt(m.menge),m.einheit||'–',eur(m.einzelpreis),eur(m.gesamtpreis)]),
      foot: [['Gesamt',`${materialien.length} Pos.`,'','',eur(material)]],
      headStyles:{fillColor:[G.dark[0],G.dark[1],G.dark[2]],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:7,textColor:[G.text[0],G.text[1],G.text[2]]},
      footStyles:{fillColor:[G.light[0],G.light[1],G.light[2]],textColor:[G.dark[0],G.dark[1],G.dark[2]],fontStyle:'bold'},
      alternateRowStyles:{fillColor:[G.bg[0],G.bg[1],G.bg[2]]},
      columnStyles:{1:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold'}},
      margin:{left:14,right:14},
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══ NACHTRÄGE ═══
  if (optionen.nachtraege && nachtraege.length > 0) {
    if (y > 210) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    y = gSection(`Nachträge – ${nachtraege.length} gesamt  ·  ${eur(nGenehmigt)} genehmigt`, y);
    autoTable(doc, {
      startY: y,
      head: [['Titel','Betrag','Status','Datum']],
      body: nachtraege.map(n=>[n.titel,eur(n.betrag),n.status,fmtDate(n.datum)]),
      headStyles:{fillColor:[G.dark[0],G.dark[1],G.dark[2]],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:7,textColor:[G.text[0],G.text[1],G.text[2]]},
      alternateRowStyles:{fillColor:[G.bg[0],G.bg[1],G.bg[2]]},
      columnStyles:{1:{halign:'right',fontStyle:'bold'}},
      margin:{left:14,right:14},
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══ MÄNGELLISTE ═══
  if (optionen.maengelliste) {
    if (y > 210) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    y = gSection('Mängelliste', y);
    autoTable(doc, {
      startY: y,
      head: [['Nr.','Beschreibung des Mangels','Verantwortlich','Frist','Behoben am']],
      body: Array.from({length:5}, (_,i)=>[`${i+1}`,'','','','']),
      headStyles:{fillColor:[G.dark[0],G.dark[1],G.dark[2]],textColor:[255,255,255],fontStyle:'bold',fontSize:7.5},
      bodyStyles:{fontSize:8,textColor:[G.text[0],G.text[1],G.text[2]],minCellHeight:10},
      alternateRowStyles:{fillColor:[G.bg[0],G.bg[1],G.bg[2]]},
      columnStyles:{0:{cellWidth:10,halign:'center'}},
      margin:{left:14,right:14},
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ═══ BEMERKUNGSFELD ═══
  if (optionen.bemerkungsfeld) {
    if (y > 220) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    y = gSection('Bemerkungen / Sonstige Vereinbarungen', y);
    doc.setFillColor(G.bg[0], G.bg[1], G.bg[2]);
    doc.setDrawColor(G.border[0], G.border[1], G.border[2]);
    doc.roundedRect(14, y, 182, 24, 1, 1, 'FD');
    y += 28;
  }

  // ═══ FOTOS ═══
  if (optionen.fotos && fotos.length > 0) {
    doc.addPage(); gHeader(); gFooter(); y = 30;
    y = gSection(`Dokumentationsfotos (${fotos.length})`, y);
    const cols = 3; const imgW = 56; const imgH = 38; const gap = 7;
    for (let i = 0; i < Math.min(fotos.length, 12); i += cols) {
      if (y + imgH + 14 > 275) { doc.addPage(); gHeader(); gFooter(); y = 30; }
      const row = fotos.slice(i, i + cols);
      for (let j = 0; j < row.length; j++) {
        const foto = row[j];
        const x = 14 + j * (imgW + gap);
        try {
          const imgData = await loadImageAsBase64(foto.url);
          if (imgData) {
            doc.addImage(imgData.data, imgData.format, x, y, imgW, imgH, undefined, 'FAST');
          } else {
            doc.setFillColor(G.light[0], G.light[1], G.light[2]);
            doc.rect(x, y, imgW, imgH, 'F');
            doc.setFontSize(7); doc.setTextColor(G.gray[0], G.gray[1], G.gray[2]);
            doc.text('Foto nicht verfügbar', x+imgW/2, y+imgH/2, {align:'center'});
          }
        } catch {
          doc.setFillColor(G.light[0], G.light[1], G.light[2]);
          doc.rect(x, y, imgW, imgH, 'F');
        }
        if (foto.beschreibung) {
          doc.setFont('helvetica','normal'); doc.setFontSize(6);
          doc.setTextColor(G.gray[0], G.gray[1], G.gray[2]);
          doc.text(foto.beschreibung.slice(0,30), x+imgW/2, y+imgH+4, {align:'center'});
        }
      }
      y += imgH + 12;
    }
  }

  // ═══ UNTERSCHRIFTEN ═══
  if (optionen.unterschriften) {
    if (y > 220) { doc.addPage(); gHeader(); gFooter(); y = 30; }
    else { y += 6; }
    y = gSection('Abnahme & Unterschriften', y);

    // Abnahme-Status Checkbox
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    doc.setTextColor(G.dark[0], G.dark[1], G.dark[2]);
    doc.text('Abnahmestatus:', 14, y);
    const statuses = ['Abgenommen ohne Mängel','Abgenommen mit Mängeln (s.o.)','Nicht abgenommen'];
    statuses.forEach((s, i) => {
      const sx = 14 + i * 60;
      doc.setDrawColor(G.mid[0], G.mid[1], G.mid[2]);
      doc.rect(sx, y+4, 5, 5, 'S');
      doc.setFont('helvetica','normal'); doc.setFontSize(7.5);
      doc.setTextColor(G.text[0], G.text[1], G.text[2]);
      doc.text(s, sx+7, y+8.5);
    });
    y += 16;

    // Unterschriftsfelder
    const sigFields = [
      {label:'Auftragnehmer / WIDI', sub:'Projektleiter'},
      {label:'Auftraggeber / Kunde', sub:'Bevollmächtigter'},
      {label:'Bauleiter / Zeuge', sub:'Optional'},
    ];
    sigFields.forEach((field, i) => {
      const x = 14 + i * 62;
      doc.setFillColor(G.bg[0], G.bg[1], G.bg[2]);
      doc.setDrawColor(G.border[0], G.border[1], G.border[2]);
      doc.roundedRect(x, y, 58, 32, 1.5, 1.5, 'FD');
      doc.setFont('helvetica','bold'); doc.setFontSize(7);
      doc.setTextColor(G.dark[0], G.dark[1], G.dark[2]);
      doc.text(field.label, x+3, y+6);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
      doc.setTextColor(G.gray[0], G.gray[1], G.gray[2]);
      doc.text(field.sub, x+3, y+11);
      doc.setDrawColor(G.border[0], G.border[1], G.border[2]);
      doc.line(x+3, y+26, x+55, y+26);
      doc.setFontSize(6);
      doc.text('Unterschrift, Datum', x+3, y+30.5);
    });
    y += 40;

    // Datum / Ort
    doc.setFont('helvetica','normal'); doc.setFontSize(8);
    doc.setTextColor(G.text[0], G.text[1], G.text[2]);
    doc.text('Ort, Datum der Abnahme:', 14, y);
    doc.setDrawColor(G.border[0], G.border[1], G.border[2]);
    doc.line(65, y, 140, y);
    y += 8;
  }

  gFooter();

  const filename = `${bsNummer||'WIDI'}_Abnahmeschein_${today.replace(/\s/g,'_')}.pdf`;
  doc.save(filename);
}


export function exportTeilabrechungPDF(
  bs: any,
  teilabrechnungen: any[],
  effektivBudget: number
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const gesamtTA  = teilabrechnungen.reduce((s, t) => s + Number(t.betrag_eur ?? 0), 0);
  const restBudget = effektivBudget - gesamtTA;
  const bsNummer = bs.name.match(/[A-Z]\d{2}-\d{4,6}/)?.[0] || bs.name.slice(0, 20);
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  header(doc, bs.name, 'Teilabrechnung – Protokoll');
  let y = 22;

  setFill(doc, C.navy); doc.roundedRect(14, y, 182, 32, 2, 2, 'F');
  setFill(doc, C.accent); doc.roundedRect(14, y + 28, 182, 4, 0, 0, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(doc, C.white);
  doc.text('TEILABRECHNUNG', 20, y + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(bs.name, 20, y + 16);
  doc.text(`Auftraggeber: ${bs.auftraggeber || '–'}  ·  Adresse: ${bs.adresse || '–'}`, 20, y + 22);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(doc, [147, 197, 253] as [number,number,number]);
  doc.text(bsNummer, 196, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(doc, [147, 197, 253] as [number,number,number]);
  doc.text(`Erstellt: ${today}`, 196, y + 15, { align: 'right' });
  doc.text(`${teilabrechnungen.length} Teilabrechnung(en)`, 196, y + 21, { align: 'right' });
  y += 40;

  y = kpiRow(doc, [
    { label: 'Gesamtbudget (effektiv)', value: eur(effektivBudget) },
    { label: 'Bereits teilabgerechnet', value: eur(gesamtTA), color: C.gray },
    { label: 'Noch offenes Budget', value: eur(restBudget), color: restBudget >= 0 ? C.green : C.red },
    { label: 'Anzahl Teilabrechnungen', value: String(teilabrechnungen.length), color: C.navy },
  ], y);

  if (effektivBudget > 0) {
    const pct = Math.round(gesamtTA / effektivBudget * 100);
    y = sectionTitle(doc, 'Budget-Auslastung Teilabrechnungen', y);
    setFill(doc, C.border); doc.roundedRect(14, y, 160, 5, 1, 1, 'F');
    setFill(doc, [100, 116, 139] as [number,number,number]);
    doc.roundedRect(14, y, Math.min(pct, 100) / 100 * 160, 5, 1, 1, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); setColor(doc, C.navy);
    doc.text(`${pct}% abgerechnet`, 176, y + 3.5, { align: 'right' });
    y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(doc, C.gray);
    doc.text(`${eur(gesamtTA)} abgerechnet  ·  ${eur(restBudget)} offen  ·  Gesamtbudget: ${eur(effektivBudget)}`, 14, y);
    y += 10;
  }

  y = sectionTitle(doc, 'Verlauf aller Teilabrechnungen', y);
  autoTable(doc, {
    startY: y,
    head: [['Nr.', 'Datum', 'Erstellt von', 'Betrag (€)', 'Anteil (%)', 'Begründung']],
    body: teilabrechnungen.map(ta => [`#${ta.lfd_nr}`,new Date(ta.erstellt_am).toLocaleDateString('de-DE'),ta.erstellt_von,eur(Number(ta.betrag_eur)),`${Number(ta.betrag_prozent).toFixed(2)}%`,ta.begruendung]),
    foot: [['','','Summe',eur(gesamtTA),`${effektivBudget>0?(gesamtTA/effektivBudget*100).toFixed(2):0}%`,'']],
    headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:7.5},
    bodyStyles:{fontSize:7.5,textColor:C.text},
    footStyles:{fillColor:C.light,textColor:C.navy,fontStyle:'bold',fontSize:8},
    alternateRowStyles:{fillColor:C.light},
    columnStyles:{0:{cellWidth:10,halign:'center'},1:{cellWidth:20},3:{halign:'right',fontStyle:'bold'},4:{halign:'right'},5:{cellWidth:60}},
    margin:{left:14,right:14},
  });
  footer(doc);

  teilabrechnungen.forEach((ta: any) => {
    doc.addPage();
    header(doc, bs.name, `Teilabrechnung #${ta.lfd_nr}`);
    let ty = 22;
    setFill(doc, C.navy); doc.roundedRect(14, ty, 182, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(doc, C.white);
    doc.text(`Teilabrechnung #${ta.lfd_nr}`, 20, ty + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`${bs.name}  ·  ${bs.auftraggeber || '–'}`, 20, ty + 15);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(doc, [147, 197, 253] as [number,number,number]);
    doc.text(bsNummer, 196, ty + 8, { align: 'right' });
    ty += 28;
    ty = kpiRow(doc, [{label:'Betrag',value:eur(Number(ta.betrag_eur)),color:C.navy},{label:'Anteil am Budget',value:`${Number(ta.betrag_prozent).toFixed(2)}%`,color:C.blue},{label:'Erstellt am',value:new Date(ta.erstellt_am).toLocaleDateString('de-DE')},{label:'Erstellt von',value:ta.erstellt_von}],ty);
    ty = sectionTitle(doc, 'Begründung', ty);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.text);
    const bLines = doc.splitTextToSize(ta.begruendung, 178);
    doc.text(bLines, 14, ty); ty += bLines.length * 5 + 8;
    if (ta.notizen) { ty = sectionTitle(doc,'Interne Notizen',ty); doc.setFont('helvetica','normal'); doc.setFontSize(8.5); setColor(doc,C.gray); const nLines=doc.splitTextToSize(ta.notizen,178); doc.text(nLines,14,ty); ty+=nLines.length*5+8; }
    const sigY = 248;
    setDraw(doc, C.border); doc.setLineWidth(0.5); doc.line(14, sigY, 196, sigY);
    setFill(doc, C.light); doc.rect(14, sigY, 182, 8, 'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); setColor(doc, C.navy);
    doc.text('BESTÄTIGUNG & UNTERSCHRIFTEN', 105, sigY+5.5, {align:'center'});
    const sigBoxY = sigY + 10;
    [{label:'Erstellt von',value:ta.erstellt_von,x:14},{label:'Geprüft / Genehmigt',value:'',x:80},{label:'Auftraggeber / Kunde',value:'',x:146}].forEach(field=>{
      setDraw(doc,C.border); doc.setLineWidth(0.3); doc.roundedRect(field.x,sigBoxY,60,26,1,1,'S');
      doc.setFont('helvetica','bold'); doc.setFontSize(6.5); setColor(doc,C.gray); doc.text(field.label.toUpperCase(),field.x+3,sigBoxY+5);
      if(field.value){doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc,C.text); doc.text(field.value,field.x+3,sigBoxY+13);}
      setDraw(doc,[180,180,190] as [number,number,number]); doc.setLineWidth(0.3); doc.line(field.x+3,sigBoxY+20,field.x+57,sigBoxY+20);
      doc.setFont('helvetica','normal'); doc.setFontSize(5.5); setColor(doc,C.gray); doc.text('Unterschrift, Datum',field.x+3,sigBoxY+24.5);
    });
    doc.setFont('helvetica','normal'); doc.setFontSize(6.5); setColor(doc,C.gray);
    doc.text(`Dokument-Nr.: ${bsNummer}-TA${String(ta.lfd_nr).padStart(2,'0')}  ·  Erstellt: ${today}  ·  Betrag: ${eur(Number(ta.betrag_eur))}  ·  Anteil: ${Number(ta.betrag_prozent).toFixed(2)}%`, 14, sigBoxY+30);
    footer(doc);
  });

  const filename = `${bsNummer}_Teilabrechnung_Protokoll.pdf`;
  doc.save(filename);
}
