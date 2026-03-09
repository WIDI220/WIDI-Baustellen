import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AlertTriangle, Clock, Euro, Users, ShieldAlert, CheckCircle } from 'lucide-react';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

const SCHWERE_COLORS: Record<string,string> = { kritisch:'border-l-red-500 bg-red-50/50', hoch:'border-l-orange-500 bg-orange-50/50', mittel:'border-l-yellow-500 bg-yellow-50/50', niedrig:'border-l-gray-300 bg-gray-50' };
const SCHWERE_BADGE: Record<string,string> = { kritisch:'bg-red-100 text-red-700', hoch:'bg-orange-100 text-orange-700', mittel:'bg-yellow-100 text-yellow-700', niedrig:'bg-gray-100 text-gray-600' };
const TYP_ICONS: Record<string,any> = { budget: Euro, zeit: Clock, personal: Users, qualitaet: ShieldAlert };

export default function EskalationenPage() {
  const { data: eskalationen = [], refetch } = useQuery({
    queryKey: ['bs-esk-all'],
    queryFn: async () => { const { data } = await supabase.from('bs_eskalationen').select('*, baustellen(name)').order('created_at', { ascending: false }); return data ?? []; },
  });

  const markGelesen = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bs_eskalationen').update({ gelesen: true }).eq('id', id); if (error) throw error; },
    onSuccess: () => { toast.success('Als gelesen markiert'); refetch(); },
  });

  const esk = eskalationen as any[];
  const offen = esk.filter(e => !e.gelesen).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Eskalationen</h1>
        <p className="text-sm text-gray-500 mt-0.5">{offen} offen · {esk.length} gesamt</p>
      </div>

      {offen === 0 && esk.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <p className="text-sm text-emerald-700">Alle Eskalationen gelesen</p>
        </div>
      )}

      <div className="space-y-3">
        {esk.map((e: any) => {
          const Icon = TYP_ICONS[e.typ] || AlertTriangle;
          return (
            <div key={e.id} className={`bg-white rounded-2xl border-l-4 shadow-sm p-5 ${SCHWERE_COLORS[e.schwere]} ${!e.gelesen ? 'ring-1 ring-[#1e3a5f]/10' : 'opacity-70'}`}>
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${SCHWERE_BADGE[e.schwere]}`}>{e.schwere}</span>
                    <span className="text-[10px] text-gray-400 uppercase tracking-wide">{e.typ}</span>
                    {!e.gelesen && <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />}
                  </div>
                  <p className="text-sm text-gray-700">{e.nachricht}</p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-3 text-xs text-gray-400">
                      <span>{e.baustellen?.name}</span>
                      <span>{fmtDate(e.datum)}</span>
                    </div>
                    {!e.gelesen && (
                      <button onClick={() => markGelesen.mutate(e.id)}
                        className="text-xs text-[#1e3a5f] hover:underline font-medium">
                        Als gelesen markieren
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {esk.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
            <AlertTriangle className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-300">Keine Eskalationen</p>
          </div>
        )}
      </div>
    </div>
  );
}
