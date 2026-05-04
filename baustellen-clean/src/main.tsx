import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { logError } from '@/components/ErrorBoundary';

// Globale JS-Fehler (z.B. in async-Funktionen, setTimeout etc.)
window.onerror = (message, _source, _line, _col, error) => {
  logError(error ?? String(message), error?.stack, 'window.onerror');
};

// Unbehandelte Promise-Fehler (z.B. fehlgeschlagene Supabase-Calls ohne catch)
window.onunhandledrejection = (event) => {
  const err = event.reason;
  logError(err instanceof Error ? err : String(err), err?.stack, 'unhandledrejection');
};

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
