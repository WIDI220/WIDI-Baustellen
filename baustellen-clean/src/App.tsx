import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { MonthProvider } from '@/contexts/MonthContext';

// Layouts
import AppLayoutBaustellen from '@/components/AppLayout';
import AppLayoutTickets from '@/components/AppLayoutTickets';
import AppLayoutAuswertung from '@/components/AppLayoutAuswertung';
import AppLayoutDGUV from '@/components/AppLayoutDGUV';

// Startseite & Auth
import StartPage from '@/pages/StartPage';
import AdminLogPage from '@/pages/AdminLogPage';
import AuthPage from '@/pages/AuthPage';

// DGUV
import DGUVPage from '@/pages/DGUVPage';
import DGUVRoadmap from '@/pages/DGUVRoadmap';
import DGUVAuswertung from '@/pages/DGUVAuswertung';
import DGUVAbgleich from '@/pages/DGUVAbgleich';
import DGUVPruefer from '@/pages/DGUVPruefer';
import DGUVImport from '@/pages/DGUVImport';
import DGUVMessAuswertung from '@/pages/DGUVMessAuswertung';

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
import WochenplanerPage from '@/pages/WochenplanerPage';import WochenplanungPage from '@/pages/WochenplanungPage';

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



const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 10000, refetchOnWindowFocus: true },
  },
});

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen bg-[#1a3356] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );

  if (!user) return (
    <Routes>
      <Route path="*" element={<AuthPage />} />
    </Routes>
  );

  return (
    <Routes>
      {/* ── Startseite ─────────────────────────────────── */}
      <Route path="/" element={<StartPage />} />
      <Route path="/admin/log" element={<AdminLogPage />} />
      <Route path="/planung" element={<WochenplanungPage />} />

      {/* ── DGUV-Bereich ───────────────────────────────── */}
      <Route path="/dguv"              element={<AppLayoutDGUV><DGUVPage /></AppLayoutDGUV>} />
      <Route path="/dguv/roadmap"      element={<AppLayoutDGUV><DGUVRoadmap /></AppLayoutDGUV>} />
      <Route path="/dguv/auswertung"   element={<AppLayoutDGUV><DGUVAuswertung /></AppLayoutDGUV>} />
      <Route path="/dguv/abgleich"     element={<AppLayoutDGUV><DGUVAbgleich /></AppLayoutDGUV>} />
      <Route path="/dguv/pruefer"      element={<AppLayoutDGUV><DGUVPruefer /></AppLayoutDGUV>} />
      <Route path="/dguv/import"       element={<AppLayoutDGUV><DGUVImport /></AppLayoutDGUV>} />
      <Route path="/dguv/messungen"    element={<AppLayoutDGUV><DGUVMessAuswertung /></AppLayoutDGUV>} />

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
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster position="bottom-right" richColors />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
