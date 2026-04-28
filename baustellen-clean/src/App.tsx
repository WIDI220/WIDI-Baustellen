import { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { MonthProvider } from '@/contexts/MonthContext';
import AuthPage, { getLocalSession, AppUser } from '@/pages/AuthPage';

const StartPage               = lazy(() => import('@/pages/StartPage'));
const TicketsPage             = lazy(() => import('@/pages/TicketsPage'));
const TicketVerwaltungPage    = lazy(() => import('@/pages/TicketVerwaltungPage'));
const ExcelImportPage         = lazy(() => import('@/pages/ExcelImportPage'));
const PdfRuecklauf            = lazy(() => import('@/pages/PdfRuecklauf'));
const WochenplanungPage       = lazy(() => import('@/pages/WochenplanungPage'));
const MitarbeiterAuswertungPage = lazy(() => import('@/pages/MitarbeiterAuswertungPage'));
const DGUVPage                = lazy(() => import('@/pages/DGUVPage'));
const AuftragImportPage       = lazy(() => import('@/pages/AuftragImportPage'));
const AdminPage               = lazy(() => import('@/pages/admin/AdminPage'));
const AdminLogPage            = lazy(() => import('@/pages/AdminLogPage'));

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
        <Route path="/"                element={<StartPage />} />
        <Route path="/admin"           element={user.is_admin ? <AdminPage /> : <Navigate to="/" />} />
        <Route path="/admin/log"       element={<AdminLogPage />} />
        <Route path="/planung"         element={<WochenplanungPage />} />
        <Route path="/tickets"         element={<TicketsPage />} />
        <Route path="/ticket-verwaltung" element={<TicketVerwaltungPage />} />
        <Route path="/import"          element={<ExcelImportPage />} />
        <Route path="/pdf-ruecklauf"   element={<PdfRuecklauf />} />
        <Route path="/auftrag-import"  element={<AuftragImportPage />} />
        <Route path="/auswertung"      element={<MitarbeiterAuswertungPage />} />
        <Route path="/auswertung/:tab" element={<MitarbeiterAuswertungPage />} />
        <Route path="/dguv"            element={<DGUVPage />} />
        <Route path="*"                element={<Navigate to="/" />} />
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
