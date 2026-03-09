import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';

const AuthPage = lazy(() => import('@/pages/AuthPage'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const BaustellenPage = lazy(() => import('@/pages/BaustellenPage'));
const BaustelleDetail = lazy(() => import('@/pages/BaustelleDetail'));
const ZeiterfassungPage = lazy(() => import('@/pages/ZeiterfassungPage'));
const MaterialPage = lazy(() => import('@/pages/MaterialPage'));
const NachtraegePage = lazy(() => import('@/pages/NachtraegePage'));
const FotosPage = lazy(() => import('@/pages/FotosPage'));
const EskalationenPage = lazy(() => import('@/pages/EskalationenPage'));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30000 } } });

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-[#1a3356] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  );
  if (!user) return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="*" element={<AuthPage />} />
      </Routes>
    </Suspense>
  );
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-[#1e3a5f]/20 border-t-[#1e3a5f] rounded-full animate-spin" /></div>}>
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
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
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
