import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const STUNDENSATZ = 38.08;

const C = {
  navy:    [15, 31, 61]   as [number,number,number],
  blue:    [30, 58, 95]   as [number,number,number],
  accent:  [59, 130, 246] as [number,number,number],
  green:   [16, 185, 129] as [number,number,number],
  red:     [239, 68, 68]  as [number,number,number],
  amber:   [245, 158, 11] as [number,number,number],
  purple:  [139, 92, 246] as [number,number,number],
  orange:  [249, 115, 22] as [number,number,number],
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
  // Top-Bar
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
  setFill(doc, C.blue); doc.rect(x, y, 4, 4, 'F');
  doc.text(`Personal: ${eur(personal)}`, x+6, y+3);
  setFill(doc, [14,165,233]); doc.rect(x+70, y, 4, 4, 'F');
  doc.text(`Material: ${eur(material)}`, x+76, y+3);
  return y + 8;
}

export function exportBaustellePDF(
  bs: any,
  stunden: any[],
  materialien: any[],
  nachtraege: any[],
  fotos: any[]
) {
  const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

  // ── Berechnungen ──
  const personal   = stunden.reduce((s,w) => s + Number(w.stunden??0) * Number(w.employees?.stundensatz ?? STUNDENSATZ), 0);
  const material   = materialien.reduce((s,m) => s + Number(m.gesamtpreis??0), 0);
  const nGenehmigt = nachtraege.filter(n=>n.status==='genehmigt').reduce((s,n)=>s+Number(n.betrag??0),0);
  const nEingereicht=nachtraege.filter(n=>n.status==='eingereicht').reduce((s,n)=>s+Number(n.betrag??0),0);
  const nAbgelehnt = nachtraege.filter(n=>n.status==='abgelehnt').reduce((s,n)=>s+Number(n.betrag??0),0);
  const gesamt     = personal + material;
  const budget     = Number(bs.budget ?? 0);
  const effBudget  = budget + nGenehmigt;
  const pct        = effBudget > 0 ? Math.min(Math.round(gesamt / effBudget * 100), 999) : 0;
  const over       = gesamt > effBudget && effBudget > 0;
  const gesamtH    = stunden.reduce((s,w)=>s+Number(w.stunden??0),0);
  const marge      = effBudget - gesamt;
  const margePct   = effBudget > 0 ? Math.round(marge / effBudget * 100) : 0;

  // MA-Auswertung
  const maMap: Record<string,{name:string,stunden:number,kosten:number}> = {};
  stunden.forEach(w => {
    const mid = w.mitarbeiter_id || w.employees?.id || 'x';
    if (!maMap[mid]) maMap[mid] = {name:w.employees?.name||'Unbekannt',stunden:0,kosten:0};
    maMap[mid].stunden += Number(w.stunden??0);
    maMap[mid].kosten  += Number(w.stunden??0) * Number(w.employees?.stundensatz??STUNDENSATZ);
  });
  const maList = Object.values(maMap).sort((a,b)=>b.stunden-a.stunden);

  // Material nach Status
  const matBestellt  = materialien.filter(m=>m.status==='bestellt').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
  const matGeliefert = materialien.filter(m=>m.status==='geliefert').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);
  const matVerbraucht= materialien.filter(m=>m.status==='verbraucht').reduce((s,m)=>s+Number(m.gesamtpreis??0),0);

  const statusLabels: Record<string,string> = {offen:'Offen',in_bearbeitung:'In Bearbeitung',pausiert:'Pausiert',abgeschlossen:'Abgeschlossen',abgerechnet:'Abgerechnet'};

  // ════════════════════════════════
  // SEITE 1 – DECKBLATT & ÜBERSICHT
  // ════════════════════════════════
  header(doc, bs.name, 'Projektbericht');

  let y = 22;

  // Titel-Block
  setFill(doc, C.navy); doc.roundedRect(14, y, 182, 28, 2, 2, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(16); setColor(doc, C.white);
  doc.text(bs.name, 20, y+10);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5);
  doc.text(`${bs.auftraggeber||'Kein Auftraggeber'}  ·  ${bs.adresse||''}`, 20, y+17);
  doc.text(`Status: ${statusLabels[bs.status]||bs.status}  ·  Gewerk: ${bs.gewerk||'–'}  ·  Projektleiter: ${bs.projektleiter||'–'}`, 20, y+23);
  // Status-Dot
  const dotColor = {offen:C.gray,in_bearbeitung:C.accent,pausiert:C.amber,abgeschlossen:C.green,abgerechnet:C.purple}[bs.status as string]||C.gray;
  setFill(doc, dotColor); doc.circle(180, y+10, 4, 'F');
  y += 34;

  // KPIs Zeile 1
  y = kpiRow(doc, [
    {label:'Effektives Budget', value:eur(effBudget)},
    {label:'Gesamtkosten', value:eur(gesamt), color: over ? C.red : C.green},
    {label:'Marge', value:`${marge>=0?'+':''}${eur(marge)} (${margePct}%)`, color: marge>=0?C.green:C.red},
    {label:'Budget-Auslastung', value:`${pct}%`, color: over?C.red:pct>80?C.amber:C.navy},
  ], y);

  // KPIs Zeile 2
  y = kpiRow(doc, [
    {label:'Personalkosten', value:eur(personal), color:C.purple},
    {label:'Materialkosten', value:eur(material), color:C.orange},
    {label:'Gesamtstunden', value:`${fmt(gesamtH)}h`, color:C.blue},
    {label:'Mitarbeiter', value:`${maList.length}`, color:C.navy},
  ], y);

  // Budget-Balken
  y = sectionTitle(doc, 'Budget-Auslastung', y);
  if (effBudget > 0) {
    y = progressBar(doc, 14, y, 160, pct, over);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); setColor(doc, C.gray);
    doc.text(`${eur(gesamt)} verbraucht  ·  ${eur(effBudget - gesamt)} verbleibend  ·  Budget: ${eur(budget)}`, 14, y);
    y += 5;
    if (nGenehmigt > 0) {
      setColor(doc, C.green); doc.setFont('helvetica','bold'); doc.setFontSize(7);
      doc.text(`✓ ${eur(nGenehmigt)} genehmigte Nachträge im Budget enthalten`, 14, y); y += 4;
    }
    if (nEingereicht > 0) {
      setColor(doc, C.accent); doc.setFont('helvetica','normal');
      doc.text(`⏳ ${eur(nEingereicht)} eingereichte Nachträge noch ausstehend`, 14, y); y += 4;
    }
    y += 4;
  }

  // Kostenaufteilung
  if (gesamt > 0) {
    y = sectionTitle(doc, 'Kostenaufteilung', y);
    y = splitBar(doc, 14, y, 182, personal, material);
    y += 4;
  }

  // Projektdetails
  y = sectionTitle(doc, 'Projektdetails', y);
  const details = [
    ['Startdatum', fmtDate(bs.startdatum)], ['Frist / Ende', fmtDate(bs.enddatum)],
    ['Auftraggeber', bs.auftraggeber||'–'], ['Adresse', bs.adresse||'–'],
    ['Gewerk', bs.gewerk||'–'], ['Projektleiter', bs.projektleiter||'–'],
  ];
  details.forEach(([l,v],i) => {
    const col = i % 3; const row = Math.floor(i / 3);
    const cx = 14 + col * 61;
    const cy = y + row * 10;
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

  // ════════════════════════════
  // SEITE 2 – ZEITERFASSUNG
  // ════════════════════════════
  if (stunden.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Zeiterfassung');
    let sy = 22;

    sy = sectionTitle(doc, `Zeiterfassung  –  ${fmt(gesamtH)}h gesamt  ·  ${eur(personal)} Personalkosten`, sy);

    // MA-Übersicht
    if (maList.length > 0) {
      doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.navy);
      doc.text('Übersicht nach Mitarbeiter', 14, sy); sy += 5;

      maList.forEach((m, i) => {
        const maxH = maList[0].stunden;
        const barW = 80;
        const mPct = maxH > 0 ? m.stunden / maxH : 0;
        const rowY = sy + i * 9;
        if (rowY > 270) return; // Seitenende

        // Hintergrund abwechselnd
        if (i % 2 === 0) { setFill(doc, C.light); doc.rect(14, rowY-2, 182, 9, 'F'); }

        doc.setFont('helvetica','normal'); doc.setFontSize(8); setColor(doc, C.text);
        doc.text(m.name, 14, rowY+4);

        // Mini-Balken
        setFill(doc, C.border); doc.roundedRect(80, rowY, barW, 4, 1,1,'F');
        setFill(doc, C.accent); doc.roundedRect(80, rowY, barW*mPct, 4, 1,1,'F');

        doc.setFont('helvetica','bold'); doc.setFontSize(7.5); setColor(doc, C.navy);
        doc.text(`${fmt(m.stunden)}h`, 165, rowY+3.5);
        setColor(doc, C.gray);
        doc.text(eur(m.kosten), 196, rowY+3.5, {align:'right'});
      });
      sy += maList.length * 9 + 8;
    }

    // Detail-Tabelle
    doc.setFont('helvetica','bold'); doc.setFontSize(8); setColor(doc, C.navy);
    doc.text('Alle Einträge', 14, sy); sy += 3;

    autoTable(doc, {
      startY: sy,
      head: [['Datum', 'Mitarbeiter', 'Stunden', 'Stundensatz', 'Kosten', 'Tätigkeit / Beschreibung']],
      body: stunden.map(w => [
        fmtDate(w.datum),
        w.employees?.name || '–',
        `${w.stunden}h`,
        `${eur(Number(w.employees?.stundensatz ?? STUNDENSATZ))}/h`,
        eur(Number(w.stunden) * Number(w.employees?.stundensatz ?? STUNDENSATZ)),
        w.beschreibung || '–',
      ]),
      foot: [['', 'Gesamt', `${fmt(gesamtH)}h`, '', eur(personal), '']],
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle:'bold', fontSize:7.5 },
      bodyStyles: { fontSize:7, textColor:C.text },
      footStyles: { fillColor:C.light, textColor:C.navy, fontStyle:'bold', fontSize:7.5 },
      alternateRowStyles: { fillColor:C.light },
      columnStyles: {
        0:{cellWidth:20},
        2:{halign:'right'},
        3:{halign:'right'},
        4:{halign:'right', fontStyle:'bold'},
        5:{cellWidth:50},
      },
      margin: {left:14, right:14},
    });
    footer(doc);
  }

  // ════════════════════════════
  // SEITE 3 – MATERIAL
  // ════════════════════════════
  if (materialien.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Material');
    let my = 22;

    my = sectionTitle(doc, `Material  –  ${materialien.length} Positionen  ·  ${eur(material)} gesamt`, my);

    // Status-KPIs
    my = kpiRow(doc, [
      {label:'Bestellt', value:eur(matBestellt), color:C.amber},
      {label:'Geliefert', value:eur(matGeliefert), color:C.accent},
      {label:'Verbraucht', value:eur(matVerbraucht), color:C.green},
      {label:'Gesamt', value:eur(material), color:C.navy},
    ], my);

    autoTable(doc, {
      startY: my,
      head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamtpreis', 'Status', 'Datum']],
      body: materialien.map(m => [
        m.bezeichnung,
        fmt(m.menge),
        m.einheit || '–',
        eur(m.einzelpreis),
        eur(m.gesamtpreis),
        m.status,
        fmtDate(m.datum),
      ]),
      foot: [['Gesamt', `${materialien.length} Pos.`, '', '', eur(material), '', '']],
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle:'bold', fontSize:7.5 },
      bodyStyles: { fontSize:7, textColor:C.text },
      footStyles: { fillColor:C.light, textColor:C.navy, fontStyle:'bold', fontSize:7.5 },
      alternateRowStyles: { fillColor:C.light },
      columnStyles: {
        1:{halign:'right'},
        3:{halign:'right'},
        4:{halign:'right', fontStyle:'bold'},
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 5) {
          const v = String(data.cell.raw);
          if (v==='bestellt') data.cell.styles.textColor = C.amber;
          if (v==='geliefert') data.cell.styles.textColor = C.accent;
          if (v==='verbraucht') data.cell.styles.textColor = C.green;
        }
      },
      margin: {left:14, right:14},
    });
    footer(doc);
  }

  // ════════════════════════════
  // SEITE 4 – NACHTRÄGE
  // ════════════════════════════
  if (nachtraege.length > 0) {
    doc.addPage();
    header(doc, bs.name, 'Nachträge');
    let ny = 22;

    ny = sectionTitle(doc, `Nachträge  –  ${nachtraege.length} gesamt  ·  ${eur(nGenehmigt)} genehmigt`, ny);

    ny = kpiRow(doc, [
      {label:'Genehmigt', value:eur(nGenehmigt), color:C.green},
      {label:'Eingereicht (ausstehend)', value:eur(nEingereicht), color:C.accent},
      {label:'Abgelehnt', value:eur(nAbgelehnt), color:C.red},
      {label:'Gesamt beantragt', value:eur(nGenehmigt+nEingereicht+nAbgelehnt), color:C.navy},
    ], ny);

    autoTable(doc, {
      startY: ny,
      head: [['Titel', 'Betrag', 'Status', 'Datum', 'Beschreibung', 'Begründung']],
      body: nachtraege.map(n => [
        n.titel,
        eur(n.betrag),
        n.status,
        fmtDate(n.datum),
        n.beschreibung || '–',
        n.begruendung || '–',
      ]),
      headStyles: { fillColor: C.navy, textColor: C.white, fontStyle:'bold', fontSize:7.5 },
      bodyStyles: { fontSize:7, textColor:C.text },
      alternateRowStyles: { fillColor:C.light },
      columnStyles: {
        1:{halign:'right', fontStyle:'bold'},
        3:{cellWidth:18},
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const v = String(data.cell.raw);
          if (v==='genehmigt') data.cell.styles.textColor = C.green;
          if (v==='eingereicht') data.cell.styles.textColor = C.accent;
          if (v==='abgelehnt') data.cell.styles.textColor = C.red;
          if (v==='entwurf') data.cell.styles.textColor = C.gray;
        }
      },
      margin: {left:14, right:14},
    });
    footer(doc);
  }

  // ════════════════════════════
  // SEITE 5 – ZUSAMMENFASSUNG
  // ════════════════════════════
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

  if (effBudget > 0) {
    zy = progressBar(doc, 14, zy, 172, pct, over);
    zy += 6;
  }

  zy = sectionTitle(doc, 'Personalkosten nach Mitarbeiter', zy);
  autoTable(doc, {
    startY: zy,
    head: [['Mitarbeiter', 'Stunden', 'Stundensatz', 'Kosten', 'Anteil']],
    body: maList.map(m => [
      m.name,
      `${fmt(m.stunden)}h`,
      `${eur(m.kosten > 0 && m.stunden > 0 ? m.kosten/m.stunden : STUNDENSATZ)}/h`,
      eur(m.kosten),
      personal > 0 ? `${Math.round(m.kosten/personal*100)}%` : '–',
    ]),
    foot: [['Gesamt', `${fmt(gesamtH)}h`, '', eur(personal), '100%']],
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle:'bold', fontSize:7.5 },
    bodyStyles: { fontSize:7.5, textColor:C.text },
    footStyles: { fillColor:C.light, textColor:C.navy, fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles: { fillColor:C.light },
    columnStyles: { 1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right', fontStyle:'bold'}, 4:{halign:'right'} },
    margin: {left:14, right:14},
  });

  const afterMa = (doc as any).lastAutoTable.finalY + 8;

  if (materialien.length > 0 && afterMa < 230) {
    sectionTitle(doc, 'Material-Übersicht', afterMa);
    autoTable(doc, {
      startY: afterMa + 12,
      head: [['Bezeichnung', 'Menge', 'Einheit', 'Einzelpreis', 'Gesamt', 'Status']],
      body: materialien.map(m => [m.bezeichnung, fmt(m.menge), m.einheit||'–', eur(m.einzelpreis), eur(m.gesamtpreis), m.status]),
      headStyles: { fillColor: C.blue, textColor: C.white, fontStyle:'bold', fontSize:7 },
      bodyStyles: { fontSize:7, textColor:C.text },
      alternateRowStyles: { fillColor:C.light },
      columnStyles: { 3:{halign:'right'}, 4:{halign:'right', fontStyle:'bold'} },
      margin: {left:14, right:14},
    });
  }

  footer(doc);

  const filename = `${bs.name.replace(/[^\wäöüÄÖÜß\s]/g,'').trim().replace(/\s+/g,'_')}_Bericht.pdf`;
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
  const bsNummer = bs.name.match(/[A-Z]\d{2}-\d{5}/)?.[0] || bs.name.slice(0, 20);
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── SEITE 1: Deckblatt Teilabrechnung ──
  header(doc, bs.name, 'Teilabrechnung – Protokoll');
  let y = 22;

  // Titel-Block
  setFill(doc, C.navy); doc.roundedRect(14, y, 182, 32, 2, 2, 'F');
  setFill(doc, C.accent); doc.roundedRect(14, y + 28, 182, 4, 0, 0, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); setColor(doc, C.white);
  doc.text('TEILABRECHNUNG', 20, y + 9);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  doc.text(bs.name, 20, y + 16);
  doc.text(`Auftraggeber: ${bs.auftraggeber || '–'}  ·  Adresse: ${bs.adresse || '–'}`, 20, y + 22);
  // Dok-Nummer oben rechts
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(doc, [147, 197, 253] as [number,number,number]);
  doc.text(bsNummer, 196, y + 9, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7); setColor(doc, [147, 197, 253] as [number,number,number]);
  doc.text(`Erstellt: ${today}`, 196, y + 15, { align: 'right' });
  doc.text(`${teilabrechnungen.length} Teilabrechnung(en)`, 196, y + 21, { align: 'right' });
  y += 40;

  // Übersicht KPIs
  y = kpiRow(doc, [
    { label: 'Gesamtbudget (effektiv)', value: eur(effektivBudget) },
    { label: 'Bereits teilabgerechnet', value: eur(gesamtTA), color: C.gray },
    { label: 'Noch offenes Budget', value: eur(restBudget), color: restBudget >= 0 ? C.green : C.red },
    { label: 'Anzahl Teilabrechnungen', value: String(teilabrechnungen.length), color: C.navy },
  ], y);

  // Fortschrittsbalken
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

  // Verlauf-Tabelle
  y = sectionTitle(doc, 'Verlauf aller Teilabrechnungen', y);

  autoTable(doc, {
    startY: y,
    head: [['Nr.', 'Datum', 'Erstellt von', 'Betrag (€)', 'Anteil (%)', 'Begründung']],
    body: teilabrechnungen.map(ta => [
      `#${ta.lfd_nr}`,
      new Date(ta.erstellt_am).toLocaleDateString('de-DE'),
      ta.erstellt_von,
      eur(Number(ta.betrag_eur)),
      `${Number(ta.betrag_prozent).toFixed(2)}%`,
      ta.begruendung,
    ]),
    foot: [['', '', 'Summe', eur(gesamtTA), `${effektivBudget > 0 ? (gesamtTA / effektivBudget * 100).toFixed(2) : 0}%`, '']],
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: C.text },
    footStyles: { fillColor: C.light, textColor: C.navy, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.light },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 20 },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right' },
      5: { cellWidth: 60 },
    },
    margin: { left: 14, right: 14 },
  });

  footer(doc);

  // ── SEITE 2+: Eine Seite pro Teilabrechnung mit Signaturzeile ──
  teilabrechnungen.forEach((ta: any) => {
    doc.addPage();
    header(doc, bs.name, `Teilabrechnung #${ta.lfd_nr}`);
    let ty = 22;

    // Titel
    setFill(doc, C.navy); doc.roundedRect(14, ty, 182, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); setColor(doc, C.white);
    doc.text(`Teilabrechnung #${ta.lfd_nr}`, 20, ty + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`${bs.name}  ·  ${bs.auftraggeber || '–'}`, 20, ty + 15);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); setColor(doc, [147, 197, 253] as [number,number,number]);
    doc.text(bsNummer, 196, ty + 8, { align: 'right' });
    ty += 28;

    // Kerndaten
    ty = kpiRow(doc, [
      { label: 'Betrag', value: eur(Number(ta.betrag_eur)), color: C.navy },
      { label: 'Anteil am Budget', value: `${Number(ta.betrag_prozent).toFixed(2)}%`, color: C.blue },
      { label: 'Erstellt am', value: new Date(ta.erstellt_am).toLocaleDateString('de-DE') },
      { label: 'Erstellt von', value: ta.erstellt_von },
    ], ty);

    // Begründung
    ty = sectionTitle(doc, 'Begründung', ty);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); setColor(doc, C.text);
    const bLines = doc.splitTextToSize(ta.begruendung, 178);
    doc.text(bLines, 14, ty);
    ty += bLines.length * 5 + 8;

    // Notizen
    if (ta.notizen) {
      ty = sectionTitle(doc, 'Interne Notizen', ty);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); setColor(doc, C.gray);
      const nLines = doc.splitTextToSize(ta.notizen, 178);
      doc.text(nLines, 14, ty);
      ty += nLines.length * 5 + 8;
    }

    // Kommentare
    const kommentare = ta.bs_teilabrechnung_kommentare || [];
    if (kommentare.length > 0) {
      ty = sectionTitle(doc, `Kommentare (${kommentare.length})`, ty);
      kommentare
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .forEach((k: any) => {
          if (ty > 240) return;
          setFill(doc, C.light); doc.roundedRect(14, ty, 182, 14, 1.5, 1.5, 'F');
          doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.navy);
          doc.text(k.erstellt_von, 18, ty + 5);
          doc.setFont('helvetica', 'normal'); setColor(doc, C.gray);
          doc.text(new Date(k.created_at).toLocaleDateString('de-DE') + ' ' + new Date(k.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), 196, ty + 5, { align: 'right' });
          doc.setFontSize(8); setColor(doc, C.text);
          const kLines = doc.splitTextToSize(k.text, 174);
          doc.text(kLines[0] || '', 18, ty + 11);
          ty += 18;
        });
      ty += 4;
    }

    // Dokumente-Liste
    const dokumente = ta.bs_teilabrechnung_dokumente || [];
    if (dokumente.length > 0) {
      ty = sectionTitle(doc, `Angehängte Dokumente (${dokumente.length})`, ty);
      dokumente.forEach((d: any, i: number) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(doc, C.text);
        doc.text(`${i + 1}. ${d.name}`, 18, ty);
        ty += 6;
      });
      ty += 4;
    }

    // ── SIGNATURZEILE ──────────────────────────────────────────
    // Immer am unteren Seitenrand, unabhängig vom Inhalt
    const sigY = 248;

    // Trennlinie
    setDraw(doc, C.border); doc.setLineWidth(0.5);
    doc.line(14, sigY, 196, sigY);

    // Überschrift
    setFill(doc, C.light); doc.rect(14, sigY, 182, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); setColor(doc, C.navy);
    doc.text('BESTÄTIGUNG & UNTERSCHRIFTEN', 105, sigY + 5.5, { align: 'center' });

    const sigBoxY = sigY + 10;

    // Drei Unterschriftsfelder
    const fields = [
      { label: 'Erstellt von', value: ta.erstellt_von, x: 14 },
      { label: 'Geprüft / Genehmigt', value: '', x: 80 },
      { label: 'Auftraggeber / Kunde', value: '', x: 146 },
    ];

    fields.forEach(field => {
      // Box
      setDraw(doc, C.border); doc.setLineWidth(0.3);
      doc.roundedRect(field.x, sigBoxY, 60, 26, 1, 1, 'S');

      // Label
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); setColor(doc, C.gray);
      doc.text(field.label.toUpperCase(), field.x + 3, sigBoxY + 5);

      // Vorausgefüllter Wert (nur bei Erstellt von)
      if (field.value) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setColor(doc, C.text);
        doc.text(field.value, field.x + 3, sigBoxY + 13);
      }

      // Signatur-Linie
      setDraw(doc, [180, 180, 190] as [number,number,number]); doc.setLineWidth(0.3);
      doc.line(field.x + 3, sigBoxY + 20, field.x + 57, sigBoxY + 20);

      // "Unterschrift, Datum"
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); setColor(doc, C.gray);
      doc.text('Unterschrift, Datum', field.x + 3, sigBoxY + 24.5);
    });

    // Metadaten unter den Feldern
    const metaY = sigBoxY + 30;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); setColor(doc, C.gray);
    doc.text(`Dokument-Nr.: ${bsNummer}-TA${String(ta.lfd_nr).padStart(2,'0')}  ·  Erstellt: ${today}  ·  Betrag: ${eur(Number(ta.betrag_eur))}  ·  Anteil: ${Number(ta.betrag_prozent).toFixed(2)}%`, 14, metaY);

    footer(doc);
  });

  const filename = `${bsNummer}_Teilabrechnung_Protokoll.pdf`;
  doc.save(filename);
}
