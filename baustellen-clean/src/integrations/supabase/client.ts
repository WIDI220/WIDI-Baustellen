import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Anmeldung gilt nur für das aktuelle Browserfenster (sessionStorage):
// Neuer Tab, neues Fenster oder Browser geschlossen → erneut anmelden.
// Dadurch meldet sich jede Person mit ihren eigenen Zugangsdaten an.
// Alte, dauerhaft gespeicherte Anmeldungen (localStorage) werden einmalig entfernt.
try {
  Object.keys(localStorage)
    .filter(k => k === 'widi_session' || (k.startsWith('sb-') && k.endsWith('-auth-token')))
    .forEach(k => localStorage.removeItem(k));
} catch { /* ignorieren */ }

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: sessionStorage, persistSession: true, autoRefreshToken: true }
});
