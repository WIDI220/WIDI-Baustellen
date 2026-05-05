import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { useState, useEffect } from 'react';
import { getLocalSession, clearLocalSession } from '@/pages/AuthPage';
import { MonthProvider } from '@/contexts/MonthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// Layouts
import AppLayoutBaustellen from '@/components/AppLayout';
import AppLayoutTickets from '@/components/AppLayoutTickets';
import AppLayoutAuswertung from '@/components/AppLayoutAuswertung';
import AppLayoutDGUV from '@/components/AppLayoutDGUV';

// Startseite & Auth
import StartPage from '@/pages/StartPage';
import AdminLogPage from '@/pages/AdminLogPage';
import AdminPage from '@/pages/admin/AdminPage';
import AuthPage from '@/pages/AuthPage';

// DGUV
import DGUVRoadmap from '@/pages/DGUVRoadmap';
import DGUVAuswertung from '@/pages/DGUVAuswertung';

// Baustellen
import Dashboard from '@/pages/Dashboard';
import BaustellenPage from '@/pages/BaustellenPage';
import BaustelleDetail from '@/pages/BaustelleDetail';
import ZeiterfassungPage from '@/pages/ZeiterfassungPage';
import MaterialPage from '@/pages/MaterialPage';
import NachtraegePage from '@/pages/NachtraegePage';
import FotosPage from '@/pages/FotosPage';
import EskalationenPage from '@/pages/EskalationenPage';
import AuftragImportPage from '@/pages/AuftragImportPage';
import MitarbeiterPage from '@/pages/MitarbeiterPage';
import ArchivPage from '@/pages/ArchivPage';
import WochenplanungPage from '@/pages/WochenplanungPage';

// Tickets
import TicketsDashboard from '@/pages/TicketsDashboard';
import TicketsPage from '@/pages/TicketsPage';
import TicketZeiterfassungPage from '@/pages/TicketZeiterfassungPage';
import AnalysePage from '@/pages/AnalysePage';
import TicketMitarbeiterPage from '@/pages/TicketMitarbeiterPage';
import TicketEskalationenPage from '@/pages/TicketEskalationenPage';
import PdfRuecklauf from '@/pages/PdfRuecklauf';
import ExcelImportPage from '@/pages/ExcelImportPage';
import TicketVerwaltungPage from '@/pages/TicketVerwaltungPage';
import InternePage from '@/pages/InternePage';

// Auswertung
import MitarbeiterAuswertungPage from '@/pages/MitarbeiterAuswertungPage';
import AufgabenPage from '@/pages/AufgabenPage';
import StundenAnfragenPage from '@/pages/StundenAnfragenPage';
import HandwerkerVerwaltungPage from '@/pages/HandwerkerVerwaltungPage';



const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 10000, refetchOnWindowFocus: true },
  },
});

function AppRoutes() {
  const [loggedIn, setLoggedIn] = useState<boolean>(() => !!getLocalSession());

  useEffect(() => {
    const check = () => setLoggedIn(!!getLocalSession());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  // Realtime Fehler-Alarm: nur für Admin sichtbar, auf jeder Seite
  useEffect(() => {
    const session = getLocalSession();
    if (session?.email !== 'j.paredis@widi-hellersen.de') return;

    const channel = supabase
      .channel('error-alarm')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'error_logs',
      }, (payload) => {
        const err = payload.new as any;
        toast.error(
          `🚨 Fehler bei ${err.user_email ?? 'Unbekannt'}`,
          {
            description: `${err.message ?? ''}${err.route ? ' · ' + err.route : ''}`,
            duration: 12000,
            action: {
              label: 'Zum Protokoll',
              onClick: () => window.location.href = '/admin',
            },
          }
        );
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loggedIn]);

  if (!loggedIn) return (
    <Routes>
      <Route path="*" element={<AuthPage onLogin={() => setLoggedIn(true)} />} />
    </Routes>
  );

  return (
    <Routes>
      {/* ── Startseite ─────────────────────────────────── */}
      <Route path="/" element={<StartPage />} />
      <Route path="/stunden-anfragen" element={<StundenAnfragenPage />} />
      <Route path="/handwerker-verwaltung" element={<HandwerkerVerwaltungPage />} />
      <Route path="/admin/log" element={<AdminLogPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/planung" element={<WochenplanungPage />} />

      {/* ── DGUV-Bereich ───────────────────────────────── */}
      <Route path="/dguv"              element={<Navigate to="/dguv/roadmap" replace />} />
      <Route path="/dguv/roadmap"      element={<AppLayoutDGUV><DGUVRoadmap /></AppLayoutDGUV>} />
      <Route path="/dguv/auswertung"   element={<AppLayoutDGUV><DGUVAuswertung /></AppLayoutDGUV>} />

      {/* ── Baustellen-Bereich ─────────────────────────── */}
      <Route path="/baustellen/*" element={
        <AppLayoutBaustellen>
          <Routes>
            <Route path="dashboard"    element={<Dashboard />} />
            <Route path="liste"        element={<BaustellenPage />} />
            <Route path="liste/:id"    element={<BaustelleDetail />} />
            <Route path="zeiterfassung" element={<ZeiterfassungPage />} />
            <Route path="material"     element={<MaterialPage />} />
            <Route path="nachtraege"   element={<NachtraegePage />} />
            <Route path="fotos"        element={<FotosPage />} />
            <Route path="eskalationen" element={<EskalationenPage />} />
            <Route path="import"       element={<AuftragImportPage />} />
            <Route path="mitarbeiter"  element={<MitarbeiterPage />} />
            <Route path="archiv"       element={<ArchivPage />} />
            <Route path="*"            element={<Navigate to="dashboard" replace />} />
          </Routes>
        </AppLayoutBaustellen>
      } />

      {/* ── Ticket-Bereich ─────────────────────────────── */}
      <Route path="/tickets/*" element={
        <MonthProvider>
          <AppLayoutTickets>
            <Routes>
              <Route path="dashboard"    element={<TicketsDashboard />} />
              <Route path="verwaltung"   element={<TicketVerwaltungPage />} />
              <Route path="intern"       element={<InternePage />} />
              <Route path="liste"        element={<TicketsPage />} />
              <Route path="analyse"      element={<AnalysePage />} />
              <Route path="aufgaben"     element={<AufgabenPage />} />
              <Route path="mitarbeiter"  element={<TicketMitarbeiterPage />} />
              <Route path="eskalationen" element={<TicketEskalationenPage />} />
              <Route path="pdf-ruecklauf" element={<PdfRuecklauf />} />
              <Route path="import"       element={<ExcelImportPage />} />
              <Route path="*"            element={<Navigate to="dashboard" replace />} />
            </Routes>
          </AppLayoutTickets>
        </MonthProvider>
      } />

      {/* ── Auswertungs-Bereich ────────────────────────── */}
      <Route path="/auswertung/*" element={
        <AppLayoutAuswertung>
          <Routes>
            <Route path=""       element={<MitarbeiterAuswertungPage />} />
            <Route path="detail" element={<MitarbeiterAuswertungPage />} />
            <Route path="monate" element={<MitarbeiterAuswertungPage />} />
          </Routes>
        </AppLayoutAuswertung>
      } />

      {/* ── Fallback ───────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="bottom-right" richColors />
        </BrowserRouter>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
