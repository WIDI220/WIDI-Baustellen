import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getLocalSession } from '@/pages/AuthPage';

// Cached user-id lookup
async function getUserId(email: string): Promise<string | null> {
  const { data } = await supabase
    .from('app_users')
    .select('id, is_admin, is_active')
    .eq('email', email)
    .single();
  return data ? JSON.stringify(data) : null;
}

export function usePermissions() {
  const session = getLocalSession();
  const email = session?.email ?? '';

  // 1) User-Datensatz laden
  const { data: userData } = useQuery({
    queryKey: ['perm-user', email],
    enabled: !!email,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_users')
        .select('id, is_admin, is_active')
        .eq('email', email)
        .single();
      return data ?? null;
    },
  });

  // 2) Berechtigungen laden
  const { data: perms = [] } = useQuery({
    queryKey: ['perm-data', userData?.id],
    enabled: !!userData?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('app_permissions')
        .select('bereich, kann_sehen, kann_bearbeiten')
        .eq('user_id', userData!.id);
      return data ?? [];
    },
  });

  // Admin hat immer alles
  if (userData?.is_admin) {
    return {
      canSee:  (_: string) => true,
      canEdit: (_: string) => true,
      isAdmin: true,
      loaded:  true,
    };
  }

  // Noch nicht geladen → alles erlauben (verhindert Flash)
  if (!userData) {
    return {
      canSee:  (_: string) => true,
      canEdit: (_: string) => true,
      isAdmin: false,
      loaded:  false,
    };
  }

  return {
    canSee: (bereich: string) => {
      const p = (perms as any[]).find(p => p.bereich === bereich);
      return p ? p.kann_sehen : true; // Default: sehen erlaubt
    },
    canEdit: (bereich: string) => {
      const p = (perms as any[]).find(p => p.bereich === bereich);
      return p ? p.kann_bearbeiten : false; // Default: bearbeiten gesperrt
    },
    isAdmin: false,
    loaded:  true,
  };
}
