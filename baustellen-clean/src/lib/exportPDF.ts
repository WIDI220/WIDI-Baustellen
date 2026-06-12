import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STUNDENSATZ = 38.08;

// WIDI Logo als base64 (GIF)
const WIDI_LOGO_B64 = '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';

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
// ABNAHMESCHEIN – Luxuriöses Premium-Design
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
  const PW = 210; const PH = 297;

  const STUNDENSATZ_LOCAL = 38.08;
  const personal   = stunden.reduce((s: number, e: any) => s + Number(e.stunden) * Number(e.employees?.stundensatz ?? STUNDENSATZ_LOCAL), 0);
  const material   = materialien.reduce((s: number, m: any) => s + Number(m.gesamtpreis ?? 0), 0);
  const gesamtH    = stunden.reduce((s: number, e: any) => s + Number(e.stunden), 0);
  const nGenehmigt = nachtraege.filter((n: any) => n.status === 'genehmigt').reduce((s: number, n: any) => s + Number(n.betrag), 0);
  const today      = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
  const bsNummer   = bs.name?.match(/[A-Z]\d{2}-\d{4,6}/)?.[0] || '';

  // ─── Premium Farbpalette ─────────────────────────────────
  // Kein Schwarz – stattdessen warme Tiefen und lebhafte Akzente
  const P = {
    deep:     [22,  78,  50]  as [number,number,number],  // Tiefes Smaragdgrün
    rich:     [21, 128,  61]  as [number,number,number],  // Sattes Grün
    vivid:    [34, 197,  94]  as [number,number,number],  // Leuchtendes Grün
    mint:     [167,243,208]   as [number,number,number],  // Mint-Akzent
    foam:     [236,253,245]   as [number,number,number],  // Sehr helles Grün
    pearl:    [250,252,255]   as [number,number,number],  // Fast-Weiß
    white:    [255,255,255]   as [number,number,number],
    ink:      [30,  50,  40]  as [number,number,number],  // Dunkles Grün-Grau (kein Schwarz)
    dusk:     [55,  80,  65]  as [number,number,number],  // Mittleres Grün-Grau
    mist:     [120,155,130]   as [number,number,number],  // Helles Grau-Grün
    cloud:    [235,245,238]   as [number,number,number],  // Wolken-Grau
    gold:     [180,143,  0]   as [number,number,number],  // Gold-Akzent
    cream:    [255,251,235]   as [number,number,number],  // Cremeweiß
  };

  const sf = (c:[number,number,number]) => doc.setFillColor(c[0],c[1],c[2]);
  const st = (c:[number,number,number]) => doc.setTextColor(c[0],c[1],c[2]);
  const sd = (c:[number,number,number], w=0.25) => { doc.setDrawColor(c[0],c[1],c[2]); doc.setLineWidth(w); };

  // ─── Hintergrund-Textur (Glasmorphismus-Effekt) ──────────
  const drawBg = () => {
    // Weißer Basis-Hintergrund
    sf(P.white); doc.rect(0, 0, PW, PH, 'F');
    // Subtle diagonale Farbflächen für Tiefe
    doc.setFillColor(240, 253, 244);
    doc.triangle(0, 0, PW * 0.6, 0, 0, PH * 0.4, 'F');
    doc.setFillColor(250, 255, 250);
    doc.triangle(PW, PH, PW * 0.3, PH, PW, PH * 0.55, 'F');
  };

  // ─── Seiten-Template ─────────────────────────────────────
  const drawPageTemplate = () => {
    const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
    drawBg();

    // ── Luxuriöser Header ──
    // Hauptfläche – sattes Grün mit Tiefe
    sf(P.deep); doc.rect(0, 0, PW, 24, 'F');
    // Glanz-Streifen (3D-Effekt)
    doc.setFillColor(40, 130, 80);
    doc.rect(0, 0, PW, 10, 'F');
    // Akzentlinie unten
    sf(P.vivid); doc.rect(0, 23.2, PW, 1.2, 'F');
    // Dezenter Schatten unter Header
    doc.setFillColor(22, 78, 50); doc.setGState(new (doc as any).GState({ opacity: 0.15 }));
    doc.rect(0, 24, PW, 3, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

    // WIDI Text statt Logo – elegant typografisch
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); st(P.white);
    doc.text('WIDI', 10, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); st(P.mint);
    doc.text('Wirtschaftsdienste Hellersen GmbH', 10, 19.5);

    // Trennlinie
    sf(P.vivid); doc.rect(42, 6, 0.5, 13, 'F');

    // Rechts: Dokumenttyp
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); st(P.white);
    doc.text('ABNAHMESCHEIN', PW - 10, 12, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(P.mint);
    doc.text('Unternehmensverbund WIDI', PW - 10, 18, { align: 'right' });

    // ── Eleganter Footer ──
    // Glasmorphismus-Footer
    doc.setFillColor(P.cloud[0], P.cloud[1], P.cloud[2]);
    doc.rect(0, PH - 11, PW, 11, 'F');
    sf(P.rich); doc.rect(0, PH - 11, PW, 0.6, 'F');
    // Grüner Punkt-Akzent
    sf(P.vivid); doc.circle(8, PH - 5.5, 1.2, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(P.dusk);
    doc.text('WIDI Wirtschaftsdienste Hellersen GmbH · Unternehmensverbund WIDI', 13, PH - 4);
    st(P.rich);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(`Seite ${pg}`, PW - 10, PH - 4, { align: 'right' });
  };

  // ─── 3D Section-Header ───────────────────────────────────
  const secHeader = (title: string, y: number): number => {
    // Schatten-Layer
    doc.setFillColor(180, 220, 195);
    doc.roundedRect(9.8, y + 0.8, PW - 18, 9, 2, 2, 'F');
    // Haupt-Layer
    sf(P.deep); doc.roundedRect(9, y, PW - 18, 9, 2, 2, 'F');
    // Glanz oben
    doc.setFillColor(34, 120, 70);
    doc.roundedRect(9, y, PW - 18, 4, 2, 0, 'F');
    // Linker Akzent
    sf(P.vivid); doc.roundedRect(9, y, 3, 9, 2, 0, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); st(P.white);
    doc.text(title.toUpperCase(), 16, y + 6.2);
    return y + 13;
  };

  // ─── Daten-Zelle (kein Abschneiden!) ────────────────────
  const infoCell = (label: string, value: string, x: number, y: number, maxW: number) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(P.mist);
    doc.text(label, x, y + 1);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); st(P.ink);
    const clean = String(value || '–').replace(/_/g, ' ');
    const lines = doc.splitTextToSize(clean, maxW - 2);
    doc.text(lines, x, y + 7);
  };

  // ─── Glasmorphismus-Box ──────────────────────────────────
  const glassBox = (x: number, y: number, w: number, h: number) => {
    // Schatten
    doc.setFillColor(200, 230, 210);
    doc.roundedRect(x + 1, y + 1.2, w, h, 2.5, 2.5, 'F');
    // Glas-Fläche
    sf(P.foam); sd(P.mint, 0.3);
    doc.roundedRect(x, y, w, h, 2.5, 2.5, 'FD');
    // Glanz-Streifen
    doc.setFillColor(255, 255, 255);
    doc.setGState(new (doc as any).GState({ opacity: 0.6 }));
    doc.roundedRect(x + 1, y + 1, w - 2, h / 2.5, 2, 0, 'F');
    doc.setGState(new (doc as any).GState({ opacity: 1.0 }));
  };

  // ══════════════════════════════════════════════════════════
  // SEITE 1 – DECKBLATT
  // ══════════════════════════════════════════════════════════
  drawPageTemplate();
  let y = 28;

  // ── Hero-Block – Glasmorphismus + 3D ─────────────────────
  // Schatten-Layer
  doc.setFillColor(180, 220, 200);
  doc.roundedRect(10.5, y + 1.5, PW - 20, 46, 3, 3, 'F');
  // Haupt-Fläche: Tiefes Smaragd
  sf(P.deep); doc.roundedRect(9, y, PW - 18, 46, 3, 3, 'F');
  // Oberer Glanz (3D-Tiefe)
  doc.setFillColor(32, 110, 65);
  doc.roundedRect(9, y, PW - 18, 18, 3, 0, 'F');
  // Unterer Akzentstreifen
  sf(P.vivid); doc.rect(9, y + 42, PW - 18, 4, 'F');
  // Rechter dekorativer Kreis (3D-Effekt)
  doc.setFillColor(34, 197, 94);
  doc.setGState(new (doc as any).GState({ opacity: 0.12 }));
  doc.circle(PW - 15, y + 8, 32, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
  doc.circle(PW - 25, y + 40, 22, 'F');
  doc.setGState(new (doc as any).GState({ opacity: 1.0 }));

  // Projektnummer-Badge
  if (bsNummer) {
    sf(P.vivid); doc.roundedRect(PW - 58, y + 5, 46, 9, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); st(P.deep);
    doc.text(bsNummer, PW - 35, y + 11, { align: 'center' });
  }

  // Titel
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); st(P.white);
  doc.text('ABNAHMESCHEIN', 17, y + 14);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(P.mint);
  doc.text('Wirtschaftsdienste Hellersen GmbH  ·  Unternehmensverbund WIDI', 17, y + 21);

  // Projektname vollständig
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); st(P.white);
  const nameLines = doc.splitTextToSize(bs.name || '–', PW - 50);
  doc.text(nameLines.slice(0, 2), 17, y + 30);

  // Datum
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); st(P.mint);
  doc.text(today, PW - 14, y + 40, { align: 'right' });
  y += 52;

  // ── Projektdaten ─────────────────────────────────────────
  if (optionen.projektdaten) {
    y = secHeader('Projektdaten', y);
    const colW = (PW - 18) / 2;
    const fields = [
      ['Projektnummer',    bsNummer || bs.name?.slice(0, 30) || '–'],
      ['Auftraggeber',     bs.auftraggeber || '–'],
      ['Adresse / Objekt', bs.adresse || '–'],
      ['Projektleiter',    bs.projektleiter || '–'],
      ['Gewerk',           bs.gewerk || '–'],
      ['Startdatum',       fmtDate(bs.startdatum)],
      ['Fertigstellung',   fmtDate(bs.enddatum)],
      ['Status',           (bs.status || '–').replace(/_/g, ' ')],
    ];

    for (let i = 0; i < fields.length; i += 2) {
      const rowY = y;
      if ((i / 2) % 2 === 0) {
        sf(P.foam); doc.rect(9, rowY, PW - 18, 13, 'F');
      }
      // Dezente horizontale Trennlinie
      sd(P.cloud, 0.2); doc.line(9, rowY + 13, PW - 9, rowY + 13);
      // Linke Zelle
      infoCell(fields[i][0], fields[i][1], 14, rowY + 1, colW - 5);
      // Rechte Zelle
      if (i + 1 < fields.length) {
        sd(P.cloud, 0.2); doc.line(9 + colW, rowY + 2, 9 + colW, rowY + 11);
        infoCell(fields[i + 1][0], fields[i + 1][1], 14 + colW, rowY + 1, colW - 5);
      }
      y = rowY + 13;
    }
    y += 6;
  }

  // ── Leistungsbeschreibung ─────────────────────────────────
  if (optionen.beschreibung && bs.beschreibung) {
    if (y > 220) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader('Leistungsbeschreibung', y);
    sf(P.pearl); doc.roundedRect(9, y - 2, PW - 18, 1, 0, 0, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); st(P.dusk);
    const dLines = doc.splitTextToSize(bs.beschreibung, PW - 28);
    doc.text(dLines, 14, y + 2);
    y += dLines.length * 5 + 8;
  }

  // ── Stunden ───────────────────────────────────────────────
  if (optionen.stunden && stunden.length > 0) {
    if (y > 200) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader(`Erbrachte Leistungen  ·  ${fmt(gesamtH)} h  ·  ${eur(personal)}`, y);
    const maMap2: Record<string,{name:string;stunden:number;kosten:number}> = {};
    stunden.forEach((s: any) => {
      const name = s.employees?.name || 'Unbekannt';
      const satz = Number(s.employees?.stundensatz ?? STUNDENSATZ_LOCAL);
      if (!maMap2[name]) maMap2[name] = {name,stunden:0,kosten:0};
      maMap2[name].stunden += Number(s.stunden);
      maMap2[name].kosten  += Number(s.stunden) * satz;
    });
    autoTable(doc, {
      startY: y,
      head: [['Mitarbeiter','Stunden','Kosten (€)']],
      body: Object.values(maMap2).sort((a,b)=>b.stunden-a.stunden).map(m=>[m.name,`${fmt(m.stunden)} h`,eur(m.kosten)]),
      foot: [['Gesamt',`${fmt(gesamtH)} h`,eur(personal)]],
      headStyles:         {fillColor:P.deep,textColor:P.white,fontStyle:'bold',fontSize:8,cellPadding:4},
      bodyStyles:         {fontSize:8,textColor:P.ink,cellPadding:3.5},
      footStyles:         {fillColor:P.foam,textColor:P.deep,fontStyle:'bold',fontSize:8,cellPadding:3.5},
      alternateRowStyles: {fillColor:P.pearl},
      columnStyles:       {1:{halign:'right'},2:{halign:'right',fontStyle:'bold'}},
      margin:             {left:9,right:9},
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Material ──────────────────────────────────────────────
  if (optionen.material && materialien.length > 0) {
    if (y > 200) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader(`Material  ·  ${materialien.length} Positionen  ·  ${eur(material)}`, y);
    autoTable(doc, {
      startY: y,
      head: [['Bezeichnung','Menge','Einheit','Einzelpreis','Gesamt (€)']],
      body: materialien.map((m:any)=>[m.bezeichnung,fmt(m.menge),m.einheit||'–',eur(m.einzelpreis),eur(m.gesamtpreis)]),
      foot: [['Gesamt',`${materialien.length} Pos.`,'','',eur(material)]],
      headStyles:         {fillColor:P.deep,textColor:P.white,fontStyle:'bold',fontSize:7.5,cellPadding:4},
      bodyStyles:         {fontSize:7.5,textColor:P.ink,cellPadding:3.5},
      footStyles:         {fillColor:P.foam,textColor:P.deep,fontStyle:'bold',fontSize:8},
      alternateRowStyles: {fillColor:P.pearl},
      columnStyles:       {1:{halign:'right'},3:{halign:'right'},4:{halign:'right',fontStyle:'bold'}},
      margin:             {left:9,right:9},
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Nachträge ─────────────────────────────────────────────
  if (optionen.nachtraege && nachtraege.length > 0) {
    if (y > 200) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader(`Nachträge  ·  ${nachtraege.length} gesamt  ·  ${eur(nGenehmigt)} genehmigt`, y);
    autoTable(doc, {
      startY: y,
      head: [['Titel','Betrag (€)','Status','Datum']],
      body: nachtraege.map((n:any)=>[n.titel,eur(n.betrag),n.status.replace(/_/g,' '),fmtDate(n.datum)]),
      headStyles:         {fillColor:P.deep,textColor:P.white,fontStyle:'bold',fontSize:8,cellPadding:4},
      bodyStyles:         {fontSize:7.5,textColor:P.ink,cellPadding:3.5},
      alternateRowStyles: {fillColor:P.pearl},
      columnStyles:       {1:{halign:'right',fontStyle:'bold'},3:{cellWidth:24}},
      margin:             {left:9,right:9},
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Mängelliste ───────────────────────────────────────────
  if (optionen.maengelliste) {
    if (y > 200) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader('Mängelliste', y);
    autoTable(doc, {
      startY: y,
      head: [['Nr.','Beschreibung des Mangels','Verantwortlich','Frist','Erledigt am']],
      body: Array.from({length:6},(_,i)=>[(i+1).toString(),'','','','']),
      headStyles:         {fillColor:P.deep,textColor:P.white,fontStyle:'bold',fontSize:8,cellPadding:4},
      bodyStyles:         {fontSize:8,textColor:P.ink,minCellHeight:13,cellPadding:3.5},
      alternateRowStyles: {fillColor:P.pearl},
      columnStyles:       {0:{cellWidth:10,halign:'center'},2:{cellWidth:32},3:{cellWidth:24},4:{cellWidth:26}},
      margin:             {left:9,right:9},
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ── Bemerkungsfeld ────────────────────────────────────────
  if (optionen.bemerkungsfeld) {
    if (y > 225) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader('Bemerkungen / Sonstige Vereinbarungen', y);
    glassBox(9, y, PW - 18, 32);
    for (let li = 1; li <= 3; li++) {
      sd(P.mint, 0.2); doc.line(14, y + li * 7.5, PW - 14, y + li * 7.5);
    }
    y += 37;
  }

  // ── Fotos ─────────────────────────────────────────────────
  if (optionen.fotos && fotos.length > 0) {
    doc.addPage(); drawPageTemplate(); y = 28;
    y = secHeader(`Dokumentationsfotos  ·  ${Math.min(fotos.length,12)} von ${fotos.length}`, y);
    const cols = 3; const gap = 5;
    const imgW = (PW - 18 - gap * (cols - 1)) / cols;
    const imgH = imgW * 0.68;
    for (let i = 0; i < Math.min(fotos.length, 12); i += cols) {
      if (y + imgH + 14 > PH - 14) { doc.addPage(); drawPageTemplate(); y = 28; }
      const row = fotos.slice(i, i + cols);
      for (let j = 0; j < row.length; j++) {
        const foto = row[j];
        const x = 9 + j * (imgW + gap);
        // 3D Schatten
        doc.setFillColor(200, 220, 208);
        doc.roundedRect(x + 1.2, y + 1.2, imgW, imgH, 2, 2, 'F');
        // Rahmen
        sf(P.foam); sd(P.mint, 0.3); doc.roundedRect(x, y, imgW, imgH, 2, 2, 'FD');
        try {
          const imgData = await loadImageAsBase64(foto.url);
          if (imgData) {
            doc.addImage(imgData.data, imgData.format, x, y, imgW, imgH, undefined, 'FAST');
            sd(P.mint, 0.3); doc.roundedRect(x, y, imgW, imgH, 2, 2, 'S');
          }
        } catch { /* Platzhalter */ }
        const cap = [
          foto.kategorie ? (foto.kategorie.charAt(0).toUpperCase() + foto.kategorie.slice(1)) : '',
          foto.beschreibung,
          foto.datum ? fmtDate(foto.datum) : '',
        ].filter(Boolean).join(' · ');
        if (cap) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(P.mist);
          doc.text(doc.splitTextToSize(cap, imgW)[0] || '', x + imgW / 2, y + imgH + 5.5, { align: 'center' });
        }
      }
      y += imgH + 12;
    }
  }

  // ── Unterschriften ────────────────────────────────────────
  if (optionen.unterschriften) {
    if (y > 185) { doc.addPage(); drawPageTemplate(); y = 28; }
    y = secHeader('Abnahme & Unterschriften', y);

    // Abnahmestatus
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); st(P.deep);
    doc.text('Abnahmestatus:', 12, y + 5);
    y += 10;
    const statuses = ['Abgenommen ohne Mängel','Abgenommen mit Mängeln (s. Mängelliste)','Nicht abgenommen'];
    statuses.forEach((s, i) => {
      const sx = 9 + i * 66;
      // Elegante Checkbox mit 3D-Effekt
      sf(P.white); sd(P.rich, 0.5); doc.roundedRect(sx, y, 5.5, 5.5, 1, 1, 'FD');
      // Innerer Schatten
      doc.setFillColor(240, 253, 244); doc.roundedRect(sx + 0.5, y + 0.5, 4.5, 4.5, 0.8, 0.8, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); st(P.dusk);
      doc.text(s, sx + 7.5, y + 4.5);
    });
    y += 12;

    // Unterschriftsfelder – 3D Glasmorphismus
    const sigW = (PW - 22) / 3;
    const sigH = 40;
    const sigFields = [
      {label:'Auftragnehmer / WIDI', sub:'Projektleiter / Bauleiter'},
      {label:'Auftraggeber / Kunde', sub:'Bevollmächtigter Vertreter'},
      {label:'Bauleiter / Zeuge',    sub:'(optional)'},
    ];
    sigFields.forEach((field, i) => {
      const x = 9 + i * (sigW + 2);
      // 3D Schatten
      doc.setFillColor(195, 228, 210);
      doc.roundedRect(x + 1, y + 1.2, sigW, sigH, 2.5, 2.5, 'F');
      // Glas-Fläche
      sf(P.foam); sd(P.mint, 0.3); doc.roundedRect(x, y, sigW, sigH, 2.5, 2.5, 'FD');
      // Glanz-Layer
      doc.setFillColor(255,255,255);
      doc.setGState(new (doc as any).GState({opacity:0.7}));
      doc.roundedRect(x+1, y+1, sigW-2, sigH/3, 2, 0, 'F');
      doc.setGState(new (doc as any).GState({opacity:1.0}));
      // Farbiger Top-Streifen
      sf(P.rich); doc.roundedRect(x, y, sigW, 2, 2.5, 0, 'F');
      // Labels
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); st(P.deep);
      doc.text(field.label, x + 4, y + 9);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); st(P.mist);
      doc.text(field.sub, x + 4, y + 15);
      // Unterschriftslinie
      sd(P.mint, 0.4); doc.line(x + 4, y + sigH - 8, x + sigW - 4, y + sigH - 8);
      doc.setFontSize(5.8); st(P.mist);
      doc.text('Unterschrift  ·  Datum', x + 4, y + sigH - 4);
    });
    y += sigH + 10;

    // Ort/Datum
    glassBox(9, y, PW - 18, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); st(P.dusk);
    doc.text('Ort, Datum der Abnahme:', 14, y + 8);
    sd(P.rich, 0.4); doc.line(73, y + 8, PW - 14, y + 8);
    y += 16;
  }

  const filename = `${bsNummer || 'WIDI'}_Abnahmeschein.pdf`;
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

// ─────────────────────────────────────────────────────────────────────────────
// ABNAHMESCHEIN PDF — identisches Layout zur Excel-Vorlage, mit WIDI-Logo
// ─────────────────────────────────────────────────────────────────────────────

export interface AbnahmePDFPosition {
  leistung: string;
  einheit: string;
  menge: string;
}

export interface AbnahmePDFDaten {
  aNummer:        string;
  proj:           string;
  ausgefuehrtAm:  string;
  ausgefuehrtVon: string;
  positionen:     AbnahmePDFPosition[];
}

const WIDI_LOGO = 'data:image/jpeg;base64,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';

export function exportAbnahmescheinPDF(d: AbnahmePDFDaten): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = 210, H = 297;
  const ML = 20, MR = 20, MT = 0;
  const CW = W - ML - MR;

  // ── Farben ──────────────────────────────────────────────────────────────
  const GRAY_DARK  = [50,  50,  50]  as [number,number,number];
  const GRAY_MID   = [100, 100, 100] as [number,number,number];
  const GRAY_LIGHT = [220, 220, 220] as [number,number,number];
  const BLACK      = [20,  20,  20]  as [number,number,number];
  const WHITE      = [255, 255, 255] as [number,number,number];
  const HEADER_BG  = [245, 245, 245] as [number,number,number];

  // ── Logo ─────────────────────────────────────────────────────────────────
  // Logo oben links, skaliert auf ~55mm breit
  doc.addImage(WIDI_LOGO, 'JPEG', ML, 12, 55, 18);

  // ── Trennlinie unter Logo ──────────────────────────────────────────────
  doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.setLineWidth(0.4);
  doc.line(ML, 34, W - MR, 34);

  // ── Dokumenttitel rechts ───────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.text('Abnahmeschein', W - MR, 20, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.text('Sonderdienstleistung', W - MR, 26, { align: 'right' });

  let y = 42;

  // ── Adressblock Kunde ──────────────────────────────────────────────────
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('KUNDE', ML, y);

  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.setFontSize(10);
  doc.text('Märkische Kliniken GmbH - Hellersen', ML, y);
  y += 5;
  doc.text('Paulmannshöher Str. 14', ML, y);
  y += 5;
  doc.text('58515 Lüdenscheid', ML, y);

  // ── KST / Proj rechts neben Adresse ───────────────────────────────────
  const rx = ML + CW * 0.55;
  let ry = 47;
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.setFont('helvetica', 'bold');
  doc.text('KST', rx, ry);
  doc.text('PROJ', rx + 35, ry);
  ry += 5;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.setFontSize(10);
  doc.text('900120', rx, ry);

  // Proj mehrzeilig
  const projLines = doc.splitTextToSize(d.proj || '—', 60);
  doc.text(projLines, rx + 35, ry);

  // ── A-Nummer Badge ─────────────────────────────────────────────────────
  y += 14;
  doc.setFillColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.roundedRect(ML, y, 50, 8, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(WHITE[0], WHITE[1], WHITE[2]);
  doc.text(d.aNummer || '—', ML + 25, y + 5.5, { align: 'center' });

  y += 14;

  // ── Trennlinie ─────────────────────────────────────────────────────────
  doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.setLineWidth(0.3);
  doc.line(ML, y, W - MR, y);
  y += 6;

  // ── Leistungstabelle ───────────────────────────────────────────────────
  const colW = [CW * 0.60, CW * 0.22, CW * 0.18];

  // Header
  doc.setFillColor(HEADER_BG[0], HEADER_BG[1], HEADER_BG[2]);
  doc.rect(ML, y, CW, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  doc.text('LEISTUNGSBESCHREIBUNG', ML + 3, y + 4.8);
  doc.text('EINHEIT', ML + colW[0] + 3, y + 4.8);
  doc.text('MENGE', ML + colW[0] + colW[1] + 3, y + 4.8);
  y += 7;

  // Positionen
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);

  const pos = d.positionen.length > 0 ? d.positionen : [{ leistung: '—', einheit: '—', menge: '—' }];
  pos.forEach((p, i) => {
    const rowBg = i % 2 === 0 ? WHITE : [250, 250, 250] as [number,number,number];
    doc.setFillColor(rowBg[0], rowBg[1], rowBg[2]);
    doc.rect(ML, y, CW, 8, 'F');

    // Rahmen
    doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, CW, 8);
    // Spalten-Trennlinien
    doc.line(ML + colW[0], y, ML + colW[0], y + 8);
    doc.line(ML + colW[0] + colW[1], y, ML + colW[0] + colW[1], y + 8);

    doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(p.leistung || '—', ML + 3, y + 5.4);
    doc.text(p.einheit  || '—', ML + colW[0] + 3, y + 5.4);
    doc.text(p.menge    || '—', ML + colW[0] + colW[1] + 3, y + 5.4);
    y += 8;
  });

  y += 12;

  // ── Ausgeführt am / von ────────────────────────────────────────────────
  doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.setLineWidth(0.3);
  doc.line(ML, y, W - MR, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.text('AUSGEFÜHRT AM', ML, y);
  doc.text('AUSGEFÜHRT VON', ML + CW * 0.45, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(BLACK[0], BLACK[1], BLACK[2]);
  doc.text(d.ausgefuehrtAm  || '—', ML, y);
  const vonLines = doc.splitTextToSize(d.ausgefuehrtVon || '—', CW * 0.55);
  doc.text(vonLines, ML + CW * 0.45, y);

  y += Math.max(vonLines.length * 6, 6) + 16;

  // ── Unterschrift Blocks ─────────────────────────────────────────────────
  const sigW = (CW - 10) / 2;

  // Block Ausgeführt von
  doc.setDrawColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  doc.setLineWidth(0.4);
  doc.line(ML, y, ML + sigW, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.text('Unterschrift Ausführender', ML, y + 4);

  // Block Kunde
  doc.line(ML + sigW + 10, y, W - MR, y);
  doc.text('Unterschrift Kunde', ML + sigW + 10, y + 4);

  y += 20;

  // ── Hinweistext ────────────────────────────────────────────────────────
  doc.setLineWidth(0.3);
  doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.line(ML, y, W - MR, y);
  y += 6;
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(8);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  const hinweis = 'Bitte vor Unterschrift prüfen. Reklamationen können nur bis zu 24 Stunden nach Beendigung der Durchführung entgegen genommen werden.';
  const hinweisLines = doc.splitTextToSize(hinweis, CW);
  doc.text(hinweisLines, ML, y);

  // ── Geprüft rechts unten ──────────────────────────────────────────────
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(GRAY_DARK[0], GRAY_DARK[1], GRAY_DARK[2]);
  doc.text('Geprüft: ___________________', W - MR, H - 15, { align: 'right' });

  // ── Footer Linie ─────────────────────────────────────────────────────
  doc.setDrawColor(GRAY_LIGHT[0], GRAY_LIGHT[1], GRAY_LIGHT[2]);
  doc.setLineWidth(0.3);
  doc.line(ML, H - 10, W - MR, H - 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(GRAY_MID[0], GRAY_MID[1], GRAY_MID[2]);
  doc.text('WIDI Wirtschaftsdienste Hellersen GmbH · Unternehmensverbund WIDI', ML, H - 6);
  doc.text('KST 900120', W - MR, H - 6, { align: 'right' });

  // ── Download ──────────────────────────────────────────────────────────
  const aNr = (d.aNummer || 'Abnahmeschein').replace(/[^A-Za-z0-9-]/g,'_');
  const dat = (d.ausgefuehrtAm || '').replace(/\./g,'-');
  doc.save(`Abnahmeschein_${aNr}_${dat}.pdf`);
}
