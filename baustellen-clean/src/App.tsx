import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';

// Direkte Imports - kein lazy() - verhindert React Error #310
import AuthPage from '@/pages/AuthPage';
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 10000,
      refetchOnWindowFocus: true,
    },
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
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/baustellen" element={<BaustellenPage />} />
        <Route path="/baustellen/:id" element={<BaustelleDetail />} />
        <Route path="/zeiterfassung" element={<ZeiterfassungPage />} />
        <Route path="/material" element={<MaterialPage />} />
        <Route path="/nachtraege" element={<NachtraegePage />} />
        <Route path="/fotos" element={<FotosPage />} />
        <Route path="/eskalationen" element={<EskalationenPage />} />
        <Route path="/import" element={<AuftragImportPage />} />
        <Route path="/mitarbeiter" element={<MitarbeiterPage />} />
        <Route path="/archiv" element={<ArchivPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppLayout>
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
