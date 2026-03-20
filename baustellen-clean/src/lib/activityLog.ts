import { supabase } from '@/integrations/supabase/client';

export async function logActivity(
  userEmail: string | undefined,
  action: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, any>
) {
  if (!userEmail) return;
  try {
    await supabase.from('activity_log').insert({
      user_email: userEmail,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      details: details ?? null,
    });
  } catch { /* nie crashen */ }
}

export async function logPageVisit(userEmail: string | undefined, page: string) {
  if (!userEmail) return;
  try {
    await supabase.from('activity_log').insert({
      user_email: userEmail,
      action: `Seite besucht: ${page}`,
      entity_type: 'page_visit',
      entity_id: null,
      details: {
        page,
        url: window.location.pathname,
        userAgent: navigator.userAgent.slice(0, 100),
        timestamp: new Date().toISOString(),
      },
    });
  } catch { /* nie crashen */ }
}
