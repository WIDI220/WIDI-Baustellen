import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { logError } from '@/components/ErrorBoundary';
import { toast } from 'sonner';

// ── toast.error abfangen: jeder Fehler-Toast wird auch geloggt ──
// So werden ALLE 63 Fehlermeldungen in der App automatisch erfasst,
// ohne jede Datei einzeln anfassen zu müssen.
const originalToastError = toast.error.bind(toast);
(toast as any).error = (message: any, options?: any) => {
  // Nur echte Fehlermeldungen loggen, keine Validierungsfehler ("Bitte Feld ausfüllen" etc.)
  const msg = typeof message === 'string' ? message : String(message ?? '');
  const istValidierungsfehler = msg.length < 60 && (
    msg.startsWith('Bitte') || msg.startsWith('Kein') || msg.startsWith('Nur ')
  );
  if (!istValidierungsfehler) {
    logError(new Error(msg), undefined, 'toast.error');
  }
  return originalToastError(message, options);
};

// ── Globale JS-Abstürze ──────────────────────────────────────
window.onerror = (message, _source, _line, _col, error) => {
  logError(error ?? String(message), error?.stack, 'window.onerror');
};

// ── Unbehandelte Promise-Fehler ──────────────────────────────
window.onunhandledrejection = (event) => {
  const err = event.reason;
  logError(err instanceof Error ? err : String(err), err?.stack, 'unhandledrejection');
};

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
