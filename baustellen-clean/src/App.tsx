import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MonthProvider } from '@/contexts/MonthContext';
import AuthPage, { getLocalSession, AppUser } from '@/pages/AuthPage';

// Seiten
const StartPage                 = lazy(() => import('@/pages/StartPage'));
const AdminPage                 = lazy(() => import('@/pages/admin/AdminPage'));
const AdminLogPage              = lazy(() => import('@/pages/AdminLogPage'));

// Baustellen
const Dashboard                 = lazy(() => import('@/pages/Dashboard'));
const BaustellenPage            = lazy(() => import('@/pages/BaustellenPage'));
const BaustelleDetail           = lazy(() => import('@/pages/BaustelleDetail'));
const ZeiterfassungPage         = lazy(() => import('@/pages/ZeiterfassungPage'));
const MaterialPage              = lazy(() => import('@/pages/MaterialPage'));
const NachtraegePage            = lazy(() => import('@/pages/NachtraegePage'));
const FotosPage                 = lazy(() => import('@/pages/FotosPage'));
const EskalationenPage          = lazy(() => import('@/pages/EskalationenPage'));
const MitarbeiterPage           = lazy(() => import('@/pages/MitarbeiterPage'));
const AuftragImportPage         = lazy(() => import('@/pages/AuftragImportPage'));
const ArchivPage                = lazy(() => import('@/pages/ArchivPage'));
const WochenplanungPage         = lazy(() => import('@/pages/WochenplanungPage'));

// Tickets
const TicketsDashboard          = lazy(() => import('@/pages/TicketsDashboard'));
const TicketVerwaltungPage      = lazy(() => import('@/pages/TicketVerwaltungPage'));
const TicketsPage               = lazy(() => import('@/pages/TicketsPage'));
const ExcelImportPage           = lazy(() => import('@/pages/ExcelImportPage'));
const PdfRuecklauf              = lazy(() => import('@/pages/PdfRuecklauf'));
const TicketMitarbeiterPage     = lazy(() => import('@/pages/TicketMitarbeiterPage'));
const AnalysePage               = lazy(() => import('@/pages/AnalysePage'));
const AufgabenPage              = lazy(() => import('@/pages/AufgabenPage'));
const InternePage               = lazy(() => import('@/pages/InternePage'));
const TicketZeiterfassungPage   = lazy(() => import('@/pages/TicketZeiterfassungPage'));
const TicketEskalationenPage    = lazy(() => import('@/pages/TicketEskalationenPage'));

// Auswertung
const MitarbeiterAuswertungPage = lazy(() => import('@/pages/MitarbeiterAuswertungPage'));

// DGUV
const DGUVPage                  = lazy(() => import('@/pages/DGUVPage'));
const DGUVRoadmap               = lazy(() => import('@/pages/DGUVRoadmap'));
const DGUVPruefer               = lazy(() => import('@/pages/DGUVPruefer'));
const DGUVImport                = lazy(() => import('@/pages/DGUVImport'));
const DGUVAuswertung            = lazy(() => import('@/pages/DGUVAuswertung'));
const DGUVAbgleich              = lazy(() => import('@/pages/DGUVAbgleich'));
const DGUVMessAuswertung        = lazy(() => import('@/pages/DGUVMessAuswertung'));

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 10000, refetchOnWindowFocus: true } },
});

const Spinner = () => (
  <div className="min-h-screen bg-[#1a3356] flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
  </div>
);

function AppRoutes() {
  const [user, setUser] = useState<AppUser | null>(() => getLocalSession());

  useEffect(() => {
    const check = () => setUser(getLocalSession());
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  if (!user) return (
    <Routes>
      <Route path="*" element={<AuthPage onLogin={(u) => setUser(u)} />} />
    </Routes>
  );

  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        {/* Start */}
        <Route path="/"                        element={<StartPage />} />

        {/* Admin */}
        <Route path="/admin"                   element={user.is_admin ? <AdminPage /> : <Navigate to="/" />} />
        <Route path="/admin/log"               element={<AdminLogPage />} />

        {/* Baustellen */}
        <Route path="/baustellen/dashboard"    element={<Dashboard />} />
        <Route path="/baustellen"              element={<BaustellenPage />} />
        <Route path="/baustellen/:id"          element={<BaustelleDetail />} />
        <Route path="/baustellen/zeiterfassung" element={<ZeiterfassungPage />} />
        <Route path="/baustellen/material"     element={<MaterialPage />} />
        <Route path="/baustellen/nachtraege"   element={<NachtraegePage />} />
        <Route path="/baustellen/fotos"        element={<FotosPage />} />
        <Route path="/baustellen/eskalationen" element={<EskalationenPage />} />
        <Route path="/baustellen/mitarbeiter"  element={<MitarbeiterPage />} />
        <Route path="/baustellen/import"       element={<AuftragImportPage />} />
        <Route path="/baustellen/archiv"       element={<ArchivPage />} />
        <Route path="/planung"                 element={<WochenplanungPage />} />

        {/* Tickets */}
        <Route path="/tickets/dashboard"       element={<TicketsDashboard />} />
        <Route path="/tickets/verwaltung"      element={<TicketVerwaltungPage />} />
        <Route path="/tickets/liste"           element={<TicketsPage />} />
        <Route path="/tickets/import"          element={<ExcelImportPage />} />
        <Route path="/tickets/pdf-ruecklauf"   element={<PdfRuecklauf />} />
        <Route path="/tickets/mitarbeiter"     element={<TicketMitarbeiterPage />} />
        <Route path="/tickets/analyse"         element={<AnalysePage />} />
        <Route path="/tickets/aufgaben"        element={<AufgabenPage />} />
        <Route path="/tickets/intern"          element={<InternePage />} />
        <Route path="/tickets/zeiterfassung"   element={<TicketZeiterfassungPage />} />
        <Route path="/tickets/eskalationen"    element={<TicketEskalationenPage />} />

        {/* Auswertung */}
        <Route path="/auswertung"              element={<MitarbeiterAuswertungPage />} />
        <Route path="/auswertung/:tab"         element={<MitarbeiterAuswertungPage />} />

        {/* DGUV */}
        <Route path="/dguv"                    element={<DGUVPage />} />
        <Route path="/dguv/roadmap"            element={<DGUVRoadmap />} />
        <Route path="/dguv/pruefer"            element={<DGUVPruefer />} />
        <Route path="/dguv/import"             element={<DGUVImport />} />
        <Route path="/dguv/auswertung"         element={<DGUVAuswertung />} />
        <Route path="/dguv/abgleich"           element={<DGUVAbgleich />} />
        <Route path="/dguv/mess-auswertung"    element={<DGUVMessAuswertung />} />

        <Route path="*"                        element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <MonthProvider>
        <BrowserRouter>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </MonthProvider>
    </QueryClientProvider>
  );
}
