import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { FileDown, Upload, CheckCircle, Clock, Users } from 'lucide-react';

export default function PdfRuecklauf() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: results = [] } = useQuery({
    queryKey: ['pdf-results'],
    queryFn: async () => {
      const { data } = await supabase
        .from('pdf_page_results')
        .select('*, employees(name, kuerzel)')
        .order('created_at', { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const r = results as any[];
  const bearbeitet = r.filter(x => x.status === 'bearbeitet').length;
  const offen = r.filter(x => x.status !== 'bearbeitet').length;

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') { toast.error('Bitte eine PDF-Datei auswählen'); return; }
    setUploading(true);
    try {
      const fileName = `ruecklauf_${Date.now()}.pdf`;
      const { error } = await supabase.storage.from('pdf-ruecklauf').upload(fileName, file);
      if (error) throw error;
      toast.success('PDF hochgeladen – wird verarbeitet');
      qc.invalidateQueries({ queryKey: ['pdf-results'] });
    } catch (e: any) {
      toast.error('Fehler: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#0f1f3d', margin: '0 0 4px', letterSpacing: '-.02em' }}>PDF-Rücklauf</h1>
        <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Unterschriebene PDFs hochladen und verarbeiten</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px' }}>
        {[
          { label: 'Gesamt', value: r.length, icon: FileDown, farbe: '#1a3356' },
          { label: 'Bearbeitet', value: bearbeitet, icon: CheckCircle, farbe: '#059669' },
          { label: 'Offen', value: offen, icon: Clock, farbe: '#d97706' },
        ].map(k => (
          <div key={k.label} style={{ background: '#fff', borderRadius: '14px', padding: '18px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>{k.label}</div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: k.farbe }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
        <div
          onClick={() => fileRef.current?.click()}
          style={{ border: '2px dashed #e5e9f2', borderRadius: '12px', padding: '40px', textAlign: 'center', cursor: 'pointer', transition: 'border-color .15s' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#107A57'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e5e9f2'}
        >
          {uploading ? (
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Wird hochgeladen...</p>
          ) : (
            <>
              <Upload size={32} style={{ color: '#9ca3af', margin: '0 auto 12px' }} />
              <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', margin: '0 0 4px' }}>PDF hier ablegen oder klicken</p>
              <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Unterschriebene Rückläufer hochladen</p>
            </>
          )}
        </div>
      </div>

      {/* Ergebnisse */}
      {r.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7a99', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>
            Letzte Rückläufer
          </div>
          {r.map((item: any) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
              <div>
                <div style={{ fontSize: '13px', color: '#0f1f3d', fontWeight: '500' }}>
                  {item.employees?.name ?? 'Unbekannt'}
                </div>
                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                  {new Date(item.created_at).toLocaleDateString('de-DE')}
                </div>
              </div>
              <span style={{
                fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: '500',
                background: item.status === 'bearbeitet' ? 'rgba(16,185,129,.1)' : 'rgba(245,158,11,.1)',
                color: item.status === 'bearbeitet' ? '#059669' : '#d97706',
              }}>
                {item.status === 'bearbeitet' ? 'Bearbeitet' : 'Offen'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
