import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { legalRpc, type LegalSettings } from '@/hooks/useLegalCases';
import { CHECKLIST_LABEL, CASE_STATUS_META, DEFAULT_INTIMATION_TEMPLATE, INTIMATION_PLACEHOLDERS, type LegalCaseStatus } from '@/utils/legalWorkflow';
import { Save, Gavel, AlertTriangle } from 'lucide-react';

/** Pestaña "Cobranza legal" dentro de Mi Empresa. Requiere legal.config (el dueño siempre). */
export const LegalSettingsTab: React.FC = () => {
  const { companyId } = useAuth();
  const [form, setForm] = useState<Partial<LegalSettings>>({});
  const [template, setTemplate] = useState('');
  const [transitions, setTransitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: s }, { data: cs }, { data: tr }] = await Promise.all([
      supabase.rpc('legal_get_settings' as any, { p_company: companyId } as any),
      supabase.from('company_settings').select('legal_intimation_template').eq('user_id', companyId).maybeSingle(),
      supabase.from('legal_stage_transitions').select('*').order('from_status').order('to_status'),
    ]);
    setForm((s as any) || {});
    setTemplate((cs as any)?.legal_intimation_template || '');
    setTransitions(tr || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (k: keyof LegalSettings) => (
    <Input type="number" min={0} value={(form as any)[k] ?? ''} onChange={e => setForm({ ...form, [k]: Number(e.target.value) })} className="h-9" />
  );

  const save = async () => {
    setSaving(true);
    const r = await legalRpc('legal_save_settings', { p_settings: { ...form, intimation_template: template } }, 'Configuración de cobranza guardada');
    setSaving(false);
    if (r.ok) load();
  };

  const toggleDoc = (key: string) => {
    const cur = new Set(form.required_documents || []);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    setForm({ ...form, required_documents: Array.from(cur) });
  };

  // Transiciones: global + override de la empresa
  const effective = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const t of transitions.filter(t => !t.company_id)) map.set(`${t.from_status}|${t.to_status}`, { ...t, source: 'global' });
    for (const t of transitions.filter(t => t.company_id)) map.set(`${t.from_status}|${t.to_status}`, { ...t, source: 'empresa' });
    return Array.from(map.values()).filter(t => t.required_permission); // las de sistema no se editan
  }, [transitions]);

  const toggleTransition = async (t: any) => {
    const r = await legalRpc('legal_set_transition', { p_from: t.from_status, p_to: t.to_status, p_enabled: !t.enabled }, undefined);
    if (r.ok) { toast.success(`Transición ${!t.enabled ? 'habilitada' : 'deshabilitada'}`); load(); }
  };

  if (loading) return <p className="text-sm text-gray-500 py-6">Cargando configuración…</p>;
  const label = (s: string) => CASE_STATUS_META[s as LegalCaseStatus]?.label || s;

  return (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 text-sm flex gap-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>Los valores iniciales son <b>operativos, no jurídicos</b>. Los plazos, requisitos documentales y el texto de la intimación deben ser revisados y ajustados por el asesor legal de la empresa. El sistema es una herramienta de gestión y seguimiento.</span>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" /> Etapas de cobranza (días de atraso, descontada la gracia)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1"><Label>Cobranza preventiva desde</Label>{num('preventive')}</div>
          <div className="space-y-1"><Label>Cobranza administrativa desde</Label>{num('administrative')}</div>
          <div className="space-y-1"><Label>Cobranza intensiva desde</Label>{num('intensive')}</div>
          <div className="space-y-1"><Label>Pre-legal desde</Label>{num('prelegal')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Elegibilidad para intimación</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1"><Label>Días mínimos de mora</Label>{num('min_days_overdue')}</div>
          <div className="space-y-1"><Label>Monto mínimo (saldo)</Label>{num('min_amount')}</div>
          <div className="space-y-1"><Label>Gestiones mínimas</Label>{num('min_contacts')}</div>
          <div className="space-y-1"><Label>Promesas incumplidas mínimas</Label>{num('min_broken_promises')}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Plazos y seguimiento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1"><Label>Días de plazo de la intimación</Label>{num('deadline_days')}<p className="text-xs text-gray-500">Desde la notificación entregada.</p></div>
            <div className="space-y-1"><Label>Días para próxima gestión</Label>{num('followup_days')}<p className="text-xs text-gray-500">Umbral del semáforo amarillo y de "sin seguimiento".</p></div>
            <div className="space-y-1"><Label>Días para escalar</Label>{num('escalation_days')}<p className="text-xs text-gray-500">Referencia tras vencer el plazo.</p></div>
          </div>
          <div className="flex items-center gap-3"><Switch checked={!!form.require_notification_evidence} onCheckedChange={v => setForm({ ...form, require_notification_evidence: v })} /><Label>Exigir evidencia adjunta para registrar una notificación como "entregada"</Label></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Expediente requerido (checklist pre-legal)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(CHECKLIST_LABEL).filter(([k]) => k !== 'other').map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={(form.required_documents || []).includes(k)} onChange={() => toggleDoc(k)} /> {l}</label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Plantilla de la carta de intimación</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={18} className="font-mono text-xs" value={template} onChange={e => setTemplate(e.target.value)} placeholder={DEFAULT_INTIMATION_TEMPLATE} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setTemplate(DEFAULT_INTIMATION_TEMPLATE)}>Cargar plantilla base</Button>
          </div>
          <details className="text-xs text-gray-600"><summary className="cursor-pointer">Placeholders disponibles</summary>
            <ul className="mt-1 columns-2">{INTIMATION_PLACEHOLDERS.map(p => <li key={p.key}><code>{p.key}</code> — {p.description}</li>)}</ul></details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Workflow: transiciones permitidas</CardTitle><p className="text-xs text-gray-500">Puedes deshabilitar transiciones para tu empresa sin modificar código. Las automáticas (pagos, promesas vencidas, inicio de plazo) no se listan.</p></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">De</th><th className="text-left px-3 py-2">A</th><th className="text-left px-3 py-2">Permiso</th><th className="text-left px-3 py-2">Requisitos</th><th className="text-left px-3 py-2">Origen</th><th className="text-left px-3 py-2">Activa</th></tr></thead>
            <tbody>
              {effective.map(t => (
                <tr key={`${t.from_status}|${t.to_status}`} className="border-t">
                  <td className="px-3 py-2">{label(t.from_status)}</td><td className="px-3 py-2">{label(t.to_status)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{t.required_permission}</td>
                  <td className="px-3 py-2 text-xs">{[t.requires_complete_file && 'expediente completo', t.requires_reason && 'motivo'].filter(Boolean).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-xs">{t.source}</td>
                  <td className="px-3 py-2"><Switch checked={!!t.enabled} onCheckedChange={() => toggleTransition(t)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex justify-end"><Button onClick={save} disabled={saving}><Save className="h-4 w-4 mr-2" /> {saving ? 'Guardando…' : 'Guardar configuración de cobranza'}</Button></div>
    </div>
  );
};
