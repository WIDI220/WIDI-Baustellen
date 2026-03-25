// PDF Export Utility — nutzt window.print() mit speziellen Print-Styles
// Kein externes Package nötig — funktioniert im Browser

export function printAsPDF(htmlContent: string, titel: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8"/>
  <title>${titel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      background: #0f172a;
      color: #fff;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    @page {
      size: A4;
      margin: 15mm 15mm 15mm 15mm;
    }
    @media print {
      body { background: #0f172a !important; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    /* WIDI Branding */
    .pdf-header {
      background: linear-gradient(135deg, #1e3a8a, #2563eb);
      padding: 24px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      border-radius: 0 0 12px 12px;
    }
    .pdf-logo { display: flex; align-items: center; gap: 12px; }
    .pdf-logo-box {
      width: 42px; height: 42px; border-radius: 12px;
      background: rgba(255,255,255,0.15);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 900; color: #fff;
    }
    .pdf-logo-text h1 { font-size: 18px; font-weight: 900; color: #fff; letter-spacing: -0.03em; }
    .pdf-logo-text p { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 2px; }
    .pdf-meta { text-align: right; }
    .pdf-meta h2 { font-size: 16px; font-weight: 800; color: #fff; }
    .pdf-meta p { font-size: 11px; color: rgba(255,255,255,0.5); margin-top: 3px; }
    /* Content */
    .pdf-body { padding: 0 32px 32px; }
    .kpi-grid { display: grid; gap: 12px; margin-bottom: 20px; }
    .kpi-grid-4 { grid-template-columns: repeat(4,1fr); }
    .kpi-grid-3 { grid-template-columns: repeat(3,1fr); }
    .kpi-card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 14px 16px;
      border-top: 3px solid var(--accent);
    }
    .kpi-val { font-size: 24px; font-weight: 900; color: var(--accent); letter-spacing: -0.04em; }
    .kpi-lbl { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 3px; text-transform: uppercase; letter-spacing: 0.05em; }
    .section {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px; overflow: hidden; margin-bottom: 18px;
    }
    .section-header {
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      font-size: 13px; font-weight: 700; color: #fff;
      background: rgba(255,255,255,0.04);
    }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th {
      padding: 9px 14px; text-align: left;
      font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.35);
      text-transform: uppercase; letter-spacing: 0.06em;
      background: rgba(255,255,255,0.03);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    td { padding: 10px 14px; color: rgba(255,255,255,0.8); border-bottom: 1px solid rgba(255,255,255,0.04); }
    tr:last-child td { border-bottom: none; }
    tr.total td { font-weight: 700; color: #fff; background: rgba(255,255,255,0.05); }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 6px;
      font-size: 10px; font-weight: 600;
    }
    .badge-green { background: rgba(16,185,129,0.2); color: #34d399; }
    .badge-blue  { background: rgba(37,99,235,0.2);  color: #60a5fa; }
    .badge-amber { background: rgba(245,158,11,0.2); color: #fbbf24; }
    .badge-red   { background: rgba(239,68,68,0.2);  color: #f87171; }
    .accent-blue  { --accent: #3b82f6; }
    .accent-green { --accent: #10b981; }
    .accent-amber { --accent: #f59e0b; }
    .accent-purple{ --accent: #8b5cf6; }
    .footer {
      margin-top: 32px; padding-top: 14px;
      border-top: 1px solid rgba(255,255,255,0.08);
      display: flex; justify-content: space-between;
      font-size: 10px; color: rgba(255,255,255,0.2);
    }
    .print-btn {
      position: fixed; bottom: 20px; right: 20px;
      padding: 12px 24px; background: #2563eb; color: #fff;
      border: none; border-radius: 12px; font-size: 14px;
      font-weight: 700; cursor: pointer;
      box-shadow: 0 8px 24px rgba(37,99,235,0.4);
    }
    .print-btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
${htmlContent}
<button class="print-btn no-print" onclick="window.print()">🖨 Drucken / Als PDF speichern</button>
</body>
</html>`);

  printWindow.document.close();
}

export function widiHeader(titel: string, untertitel: string): string {
  const datum = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  return `
  <div class="pdf-header">
    <div class="pdf-logo">
      <div class="pdf-logo-box">W</div>
      <div class="pdf-logo-text">
        <h1>WIDI Controlling</h1>
        <p>WIDI Hellersen GmbH</p>
      </div>
    </div>
    <div class="pdf-meta">
      <h2>${titel}</h2>
      <p>${untertitel} · ${datum}</p>
    </div>
  </div>
  <div class="pdf-body">`;
}

export function widiFooter(): string {
  const jetzt = new Date().toLocaleString('de-DE');
  return `
  <div class="footer">
    <span>WIDI Hellersen GmbH · Vertraulich</span>
    <span>Erstellt: ${jetzt}</span>
  </div>
  </div>`; // closes pdf-body
}
