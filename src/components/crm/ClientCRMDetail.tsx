import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CollectionTracking } from '@/components/loans/CollectionTracking';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { parseIsoDateLocal } from '@/utils/frequencyUtils';
import {
  CATEGORY_META,
  COMPONENT_LABEL,
  COMPONENT_MAX,
  type ScoreComponents,
} from '@/utils/clientScoring';
import type { CRMClientRecord, CRMProfile } from '@/hooks/useClientCRM';
import { CategoryBadge, BehaviorBadge, RiskLabel, ScoreMeter, scoreBarClass } from './ScoreBadge';
import {
  Phone, Mail, MapPin, AlertTriangle, Info, CheckCircle2, Clock, DollarSign, MessageSquare,
  Plus, Save, ExternalLink, Flame, Snowflake, CloudSun,
} from 'lucide-react';

interface Props {
  record: CRMClientRecord | null;
  isOpen: boolean;
  onClose: () => void;
  canEdit: boolean;
  todayIso: string;
  onUpdateProfile: (
    clientId: string,
    patch: Partial<Pick<CRMProfile, 'manual_category' | 'tags' | 'crm_notes'>>
  ) => Promise<boolean>;
  onTrackingChanged: () => void;
}

const CONTACT_LABEL: Record<string, string> = {
  phone: 'Llamada', email: 'Correo', sms: 'SMS', visit: 'Visita', letter: 'Carta', other: 'Otro',
};

const LOAN_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: 'Activo', cls: 'bg-green-100 text-green-800' },
  overdue: { label: 'En mora', cls: 'bg-red-100 text-red-800' },
  paid: { label: 'Pagado', cls: 'bg-blue-100 text-blue-800' },
  settled: { label: 'Saldado', cls: 'bg-blue-100 text-blue-800' },
  pending: { label: 'Pendiente', cls: 'bg-gray-100 text-gray-700' },
  cancelled: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-600' },
};

const daysBetween = (a: string, b: string) => {
  const da = parseIsoDateLocal(a);
  const db = parseIsoDateLocal(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / 86400000);
};

export const ClientCRMDetail: React.FC<Props> = ({
  record, isOpen, onClose, canEdit, todayIso, onUpdateProfile, onTrackingChanged,
}) => {
  const navigate = useNavigate();
  const [manualCategory, setManualCategory] = useState<string>('auto');
  const [tagsText, setTagsText] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [trackingLoanId, setTrackingLoanId] = useState<string | null>(null);
  const [pickLoanForTracking, setPickLoanForTracking] = useState(false);

  useEffect(() => {
    if (!record) return;
    setManualCategory(record.profile?.manual_category || 'auto');
    setTagsText((record.profile?.tags || []).join(', '));
    setNotes(record.profile?.crm_notes || '');
  }, [record?.client.id, record?.profile]);

  const sortedLoans = useMemo(
    () =>
      record
        ? [...record.loans].sort((a, b) => {
            const act = (s: string | null) => (s === 'active' || s === 'overdue' ? 0 : 1);
            return act(a.status) - act(b.status) || String(b.start_date).localeCompare(String(a.start_date));
          })
        : [],
    [record]
  );
  const activeLoans = sortedLoans.filter(l => l.status === 'active' || l.status === 'overdue');

  const recentPayments = useMemo(
    () =>
      record
        ? [...record.payments]
            .sort((a, b) => String(b.payment_date).localeCompare(String(a.payment_date)))
            .slice(0, 15)
        : [],
    [record]
  );

  const timeline = useMemo(
    () =>
      record
        ? [...record.tracking].sort(
            (a, b) => String(b.contact_date).localeCompare(String(a.contact_date))
          )
        : [],
    [record]
  );

  if (!record) return null;
  const { client, score, profile } = record;
  const m = score.metrics;
  const loanLabel = (loanId: string) => {
    const l = record.loans.find(x => x.id === loanId);
    return l ? `${formatCurrency(l.amount)} · ${String(l.start_date).split('T')[0]}` : loanId.slice(0, 8);
  };

  const openTracking = () => {
    if (activeLoans.length === 1) {
      setTrackingLoanId(activeLoans[0].id);
    } else if (activeLoans.length > 1 || sortedLoans.length > 0) {
      setPickLoanForTracking(true);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);
    const ok = await onUpdateProfile(client.id, {
      manual_category: manualCategory === 'auto' ? null : (manualCategory as any),
      tags,
      crm_notes: notes.trim() || null,
    });
    setSaving(false);
    if (ok) {
      // eslint-disable-next-line no-console
      console.log('CRM: perfil guardado');
    }
  };

  const CategoryIcon = record.effectiveCategory === 'caliente' ? Flame : record.effectiveCategory === 'frio' ? Snowflake : CloudSun;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={o => !o && onClose()}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-y-auto p-0">
          {/* Cabecera */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <CategoryIcon className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold text-white truncate">{client.full_name}</DialogTitle>
                  </DialogHeader>
                  <p className="text-slate-300 text-sm">Cédula {client.dni}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <CategoryBadge category={record.effectiveCategory} manual={!!profile?.manual_category} />
                    <BehaviorBadge behavior={score.behavior} />
                    <span className="text-xs bg-white/10 rounded px-2 py-0.5"><RiskLabel risk={score.risk} /></span>
                    {(profile?.tags || []).map(t => (
                      <Badge key={t} variant="outline" className="border-white/40 text-white text-xs">{t}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-200">
                    <a className="flex items-center gap-1 hover:underline" href={`tel:${client.phone}`}><Phone className="h-4 w-4" />{client.phone}</a>
                    {client.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{client.email}</span>}
                    {(client.address || client.city) && (
                      <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[client.address, client.city].filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="md:w-56 shrink-0">
                <p className="text-xs text-slate-300 mb-1">Score de comportamiento</p>
                <div className="[&_span]:text-white [&_.text-gray-500]:text-slate-300">
                  <ScoreMeter score={score.score} size="lg" />
                </div>
                <p className="text-xs text-slate-300 mt-2">{CATEGORY_META[score.category].description}</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Banderas */}
            {score.flags.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {score.flags.map((f, i) => {
                  const Icon = f.severity === 'danger' ? AlertTriangle : f.severity === 'warning' ? Clock : Info;
                  const cls =
                    f.severity === 'danger' ? 'bg-red-50 border-red-200 text-red-800'
                      : f.severity === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-blue-50 border-blue-200 text-blue-800';
                  return (
                    <div key={i} className={`flex items-start gap-2 border rounded-lg p-3 text-sm ${cls}`}>
                      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                      <span className="flex-1">{f.label}</span>
                      {f.loanId && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTrackingLoanId(f.loanId!)}>
                          Seguimiento
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Desglose del score */}
              <Card className="lg:col-span-1">
                <CardHeader><CardTitle className="text-base">Desglose del score</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(Object.keys(score.components) as (keyof ScoreComponents)[]).map(k => {
                    const v = score.components[k];
                    const max = COMPONENT_MAX[k];
                    const pct = Math.round((v / max) * 100);
                    return (
                      <div key={k}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-700">{COMPONENT_LABEL[k]}</span>
                          <span className="font-semibold">{v} <span className="text-gray-400 font-normal">/ {max}</span></span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div className={`h-2 rounded-full ${scoreBarClass(pct * 10)}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-gray-500 pt-2">
                    Puntualidad mide si paga en fecha; Estado actual, si está atrasado hoy; Historial, préstamos completados y antigüedad; Volumen, el negocio total generado.
                  </p>
                </CardContent>
              </Card>

              {/* Comportamiento de pago */}
              <Card className="lg:col-span-2">
                <CardHeader><CardTitle className="text-base">Comportamiento de pago</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <Stat label="Cuotas analizadas" value={String(m.installmentsAnalyzed)} />
                    <Stat label="Puntualidad" value={`${Math.round(m.onTimeRate * 100)}%`} cls={m.onTimeRate >= 0.9 ? 'text-green-700' : m.onTimeRate >= 0.7 ? 'text-amber-600' : 'text-red-600'} />
                    <Stat label="A tiempo / gracia / tarde" value={`${m.onTimeCount} / ${m.inGraceCount} / ${m.lateCount}`} />
                    <Stat label="Atraso promedio (tarde)" value={`${m.avgDelayDaysWhenLate} días`} />
                    <Stat label="Peor atraso" value={`${m.maxDelayDays} días`} cls={m.maxDelayDays > 30 ? 'text-red-600' : ''} />
                    <Stat label="Atraso HOY" value={m.currentMaxDaysOverdue > 0 ? `${m.currentMaxDaysOverdue} días` : 'Al día'} cls={m.currentMaxDaysOverdue > 0 ? 'text-red-600' : 'text-green-700'} />
                    <Stat label="Mora actual" value={formatCurrency(m.currentLateFee)} cls={m.currentLateFee > 0 ? 'text-red-600' : ''} />
                    <Stat label="Mora pagada (hist.)" value={formatCurrency(m.totalLateFeePaid)} />
                    <Stat label="Último pago" value={m.lastPaymentDate ? `${formatDateStringForSantoDomingo(m.lastPaymentDate)} (hace ${m.daysSinceLastPayment} d)` : '—'} />
                    <Stat label="Cliente desde" value={m.firstLoanDate ? `${formatDateStringForSantoDomingo(m.firstLoanDate)} (${m.monthsAsClient} meses)` : '—'} />
                    <Stat label="Préstamos" value={`${m.totalLoans} (${m.activeLoans} activos, ${m.completedLoans} completados)`} />
                    <Stat label="Negocio total" value={formatCurrency(m.lifetimeValue)} />
                    <Stat label="Total prestado" value={formatCurrency(m.totalBorrowed)} />
                    <Stat label="Total pagado" value={formatCurrency(m.totalPaid)} />
                    <Stat label="Intereses pagados" value={formatCurrency(m.totalInterestPaid)} cls="text-green-700" />
                    <Stat label="Ventas / Empeños" value={`${formatCurrency(m.totalSales)} / ${formatCurrency(m.totalPawned)}`} />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Préstamos */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Préstamos ({sortedLoans.length})</CardTitle>
                {activeLoans.length > 0 && (
                  <Button size="sm" onClick={openTracking}>
                    <Plus className="h-4 w-4 mr-1" /> Nuevo seguimiento
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Inicio</th>
                      <th className="text-left px-4 py-2">Estado</th>
                      <th className="text-right px-4 py-2">Monto</th>
                      <th className="text-right px-4 py-2">Cuota</th>
                      <th className="text-right px-4 py-2">Saldo</th>
                      <th className="text-left px-4 py-2">Próx. pago</th>
                      <th className="text-right px-4 py-2">Atraso</th>
                      <th className="text-right px-4 py-2">Mora</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLoans.map(l => {
                      const st = LOAN_STATUS_LABEL[l.status || ''] || { label: l.status || '—', cls: 'bg-gray-100 text-gray-700' };
                      const isActive = l.status === 'active' || l.status === 'overdue';
                      const raw = isActive ? daysBetween(String(l.next_payment_date).split('T')[0], todayIso) : null;
                      const overdue = raw !== null ? Math.max(0, raw - Number(l.grace_period_days || 0)) : 0;
                      return (
                        <tr key={l.id} className="border-t">
                          <td className="px-4 py-2">{formatDateStringForSantoDomingo(String(l.start_date))}</td>
                          <td className="px-4 py-2"><Badge className={st.cls}>{st.label}</Badge></td>
                          <td className="px-4 py-2 text-right">{formatCurrency(l.amount)}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(l.monthly_payment)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(l.remaining_balance)}</td>
                          <td className="px-4 py-2">{isActive ? formatDateStringForSantoDomingo(String(l.next_payment_date)) : '—'}</td>
                          <td className={`px-4 py-2 text-right ${overdue > 0 ? 'text-red-600 font-semibold' : 'text-green-700'}`}>{isActive ? (overdue > 0 ? `${overdue} d` : 'Al día') : '—'}</td>
                          <td className={`px-4 py-2 text-right ${(l.current_late_fee || 0) > 0 ? 'text-red-600' : ''}`}>{formatCurrency(Number(l.current_late_fee || 0))}</td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1 justify-end">
                              {isActive && (
                                <>
                                  <Button size="sm" variant="outline" className="h-8" title="Seguimiento de cobro" onClick={() => setTrackingLoanId(l.id)}>
                                    <MessageSquare className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8" title="Registrar pago" onClick={() => navigate(`/prestamos?action=payment&loanId=${l.id}`)}>
                                    <DollarSign className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                              <Button size="sm" variant="ghost" className="h-8" title="Ver en Préstamos" onClick={() => navigate('/prestamos')}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {sortedLoans.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">Sin préstamos</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Historial de pagos */}
              <Card>
                <CardHeader><CardTitle className="text-base">Últimos pagos</CardTitle></CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                      <tr>
                        <th className="text-left px-4 py-2">Pagado</th>
                        <th className="text-left px-4 py-2">Vencía</th>
                        <th className="text-right px-4 py-2">Monto</th>
                        <th className="text-right px-4 py-2">Atraso</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPayments.map(p => {
                        const due = String(p.due_date).split('T')[0];
                        const paid = String(p.payment_date).split('T')[0];
                        const d = daysBetween(due, paid);
                        const cls = d === null ? '' : d <= 0 ? 'text-green-700' : d <= 7 ? 'text-amber-600' : 'text-red-600';
                        return (
                          <tr key={p.id} className="border-t">
                            <td className="px-4 py-2">{formatDateStringForSantoDomingo(paid)}</td>
                            <td className="px-4 py-2">{formatDateStringForSantoDomingo(due)}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(p.amount)}</td>
                            <td className={`px-4 py-2 text-right font-medium ${cls}`}>
                              {d === null ? '—' : d <= 0 ? (d < 0 ? `${-d} d antes` : 'En fecha') : `${d} d tarde`}
                            </td>
                          </tr>
                        );
                      })}
                      {recentPayments.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Sin pagos registrados</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {/* Seguimientos */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Seguimiento de cobro ({timeline.length})</CardTitle>
                  {sortedLoans.length > 0 && (
                    <Button size="sm" variant="outline" onClick={openTracking}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
                  )}
                </CardHeader>
                <CardContent className="max-h-80 overflow-y-auto space-y-3">
                  {timeline.length === 0 && <p className="text-sm text-gray-500 text-center py-6">Sin seguimientos registrados</p>}
                  {timeline.map(t => (
                    <div key={t.id} className="border rounded-lg p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <span className="font-medium">{CONTACT_LABEL[t.contact_type] || t.contact_type}</span>
                        <span className="text-xs text-gray-500">{formatDateStringForSantoDomingo(String(t.contact_date))}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1">Préstamo: {loanLabel(t.loan_id)}</p>
                      {t.client_response && <p className="text-gray-700">{t.client_response}</p>}
                      {t.next_contact_date && (
                        <p className={`text-xs mt-1 ${String(t.next_contact_date).split('T')[0] <= todayIso ? 'text-amber-700 font-medium' : 'text-gray-500'}`}>
                          Próximo contacto: {formatDateStringForSantoDomingo(String(t.next_contact_date))}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Gestión CRM */}
            <Card>
              <CardHeader><CardTitle className="text-base">Gestión CRM</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Categoría</Label>
                    <Select value={manualCategory} onValueChange={setManualCategory} disabled={!canEdit}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Automática ({CATEGORY_META[score.category].emoji} {CATEGORY_META[score.category].label}, score {score.score})</SelectItem>
                        <SelectItem value="caliente">🔥 Caliente (manual)</SelectItem>
                        <SelectItem value="tibio">🌤️ Tibio (manual)</SelectItem>
                        <SelectItem value="frio">🧊 Frío (manual)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">La categoría manual se muestra en lugar de la calculada; el score se sigue calculando.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Etiquetas (separadas por coma)</Label>
                    <Input value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="referido, vip, negocio propio" disabled={!canEdit} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notas del cliente</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Preferencias, acuerdos verbales, contexto…" disabled={!canEdit} />
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {profile?.computed_at ? `Score calculado: ${new Date(profile.computed_at).toLocaleString('es-DO')}` : 'Score calculado ahora'}
                  </p>
                  {canEdit && (
                    <Button onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" /> {saving ? 'Guardando…' : 'Guardar'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Selector de préstamo para nuevo seguimiento */}
      <Dialog open={pickLoanForTracking} onOpenChange={setPickLoanForTracking}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>¿Sobre cuál préstamo?</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {(activeLoans.length > 0 ? activeLoans : sortedLoans).map(l => (
              <Button key={l.id} variant="outline" className="w-full justify-between" onClick={() => { setPickLoanForTracking(false); setTrackingLoanId(l.id); }}>
                <span>{formatCurrency(l.amount)} · {formatDateStringForSantoDomingo(String(l.start_date))}</span>
                <span className="text-xs text-gray-500">{LOAN_STATUS_LABEL[l.status || '']?.label || l.status}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Módulo de Seguimiento de Cobro (reutilizado tal cual) */}
      {trackingLoanId && (
        <CollectionTracking
          loanId={trackingLoanId}
          clientName={client.full_name}
          isOpen={!!trackingLoanId}
          onClose={() => { setTrackingLoanId(null); onTrackingChanged(); }}
        />
      )}
    </>
  );
};

const Stat: React.FC<{ label: string; value: string; cls?: string }> = ({ label, value, cls = '' }) => (
  <div>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`font-semibold ${cls}`}>{value}</p>
  </div>
);
