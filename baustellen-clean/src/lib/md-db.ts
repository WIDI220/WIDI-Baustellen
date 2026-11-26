// Datenzugriff für die Kachel „Monatsdaten“ (Supabase).
import { supabase } from '@/integrations/supabase/client';

export const isDemo = () => false;

export function db(): any { return supabase; }
