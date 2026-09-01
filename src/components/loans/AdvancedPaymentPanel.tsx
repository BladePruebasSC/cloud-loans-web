// ============================================================================
// PAGO AVANZADO — abonar a varias cuotas en una sola operación
// ============================================================================
// El modo normal de `PaymentForm` cobra SIEMPRE la cuota más antigua pendiente. Cuando un
// cliente llega con dinero para varias cuotas, el empleado tenía que registrar un pago por
// cuota y adivinar el reparto. Aquí elige las cuotas, escribe el monto total y ve exactamente
// a dónde va cada peso antes de guardar.
//
// Se registra UN PAGO POR CUOTA, cada uno con su `due_date`. Es la forma que el resto del
// sistema espera (mora, antigüedad e informes agrupan los pagos por `due_date`) y hace que el
// historial diga a qué cuota o cargo fue cada abono.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo, getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  allocateAmountToInstallments, autoExtendSelection, computeInstallmentDues, type DueRow,
} from '@/utils/installmentDues';
import type { AdvancedReceiptData, ReceiptCompany } from '@/utils/advancedPaymentReceipt';

interface Props {
  loanId: string;
  clientName?: string;
  /**
   * Se llama al terminar de registrar, con el recibo listo para imprimir.
   *
   * El recibo NO se muestra desde aquí: este panel lo desmonta cualquier padre en cuanto el
   * pago termina (`PaymentForm` sale del modo avanzado, `LoanDetailsView` cierra el
   * formulario), y con él se iría el diálogo antes de poder imprimir. Quien recibe esto lo
   * muestra y decide cuándo dar el pago por cerrado.
   */
  onRegistered: (receipt: AdvancedReceiptData) => void;
  onCancel: () => void;
}

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'bank_transfer', label: 'Transferencia' },
  { value: 'check', label: 'Cheque' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'other', label: 'Otro' },
];

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const AdvancedPaymentPanel = ({ loanId, clientName, onRegistered, onCancel }: Props) => {
  const { user, companyId } = useAuth();
  const today = useMemo(() => getCurrentDateStringForSantoDomingo(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<DueRow[]>([]);
  // La selección tiene tres piezas para que escribir un monto pueda arrastrar cuotas SIN pelearse
  // con lo que el empleado marca a mano:
  //   manualIds   — lo que marcó el empleado.
  //   autoIds     — lo que añade el monto escrito al desbordar la selección.
  //   excludedIds — lo que el empleado desmarcó: nunca se vuelve a añadir solo.
  const [manualIds, setManualIds] = useState<string[]>([]);
  const [autoIds, setAutoIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [amount, setAmount] = useState<number>(0);
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  // Datos de cabecera del recibo (empresa y cliente). Se cargan junto con las cuotas para
  // tenerlos listos en el momento de imprimir.
  const [companySettings, setCompanySettings] = useState<ReceiptCompany | null>(null);
  const [loanInfo, setLoanInfo] = useState<{
    amount: number | null; interest_rate: number | null;
    client: { full_name: string | null; dni: string | null; phone: string | null } | null;
  } | null>(null);


  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: installments, error: iErr },
        { data: payments, error: pErr },
        { data: loanRow },
        { data: settings },
      ] = await Promise.all([
        supabase
          .from('installments')
          .select('id, installment_number, due_date, total_amount, principal_amount, interest_amount, paid_amount, is_paid')
          .eq('loan_id', loanId)
          .order('due_date', { ascending: true }),
        // `superseded_at` excluye los pagos anulados por una extensión de plazo: ya no se
        // aplican a ninguna cuota.
        supabase
          .from('payments')
          .select('amount, principal_amount, interest_amount, due_date, superseded_at')
          .eq('loan_id', loanId),
        supabase
          .from('loans')
          .select('amount, interest_rate, client:client_id(full_name, dni, phone)')
          .eq('id', loanId)
          .maybeSingle(),
        companyId
          ? supabase.from('company_settings')
              .select('company_name, address, phone, tax_id')
              .eq('user_id', companyId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (iErr) throw iErr;
      if (pErr) throw pErr;

      if (loanRow) {
        // `client:client_id(...)` devuelve un objeto, pero según la relación puede llegar
        // como arreglo de uno: se normaliza para no depender de ese detalle.
        const rawClient = (loanRow as { client?: unknown }).client;
        const client = Array.isArray(rawClient) ? rawClient[0] : rawClient;
        setLoanInfo({
          amount: Number(loanRow.amount ?? 0) || null,
          interest_rate: Number(loanRow.interest_rate ?? 0) || null,
          client: client
            ? {
                full_name: (client as { full_name?: string }).full_name ?? null,
                dni: (client as { dni?: string }).dni ?? null,
                phone: (client as { phone?: string }).phone ?? null,
              }
            : null,
        });
      }
      setCompanySettings((settings ?? null) as ReceiptCompany | null);

      const dues = computeInstallmentDues(installments || [], payments || [])
        .filter(r => r.pending > 0.005);
      setRows(dues);
      setManualIds([]);
      setAutoIds([]);
      setExcludedIds([]);
    } catch (error) {
      console.error('Error cargando cuotas para pago avanzado:', error);
      toast.error('No se pudieron cargar las cuotas del préstamo');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [loanId, companyId]);

  useEffect(() => { load(); }, [load]);

  const selectedIds = useMemo(() => new Set([...manualIds, ...autoIds]), [manualIds, autoIds]);

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  );
  const selectedPending = useMemo(
    () => round2(selectedRows.reduce((s, r) => s + r.pending, 0)),
    [selectedRows],
  );
  /** Tope real: no se puede cobrar más que esto. */
  const totalPending = useMemo(
    () => round2(rows.reduce((s, r) => s + r.pending, 0)),
    [rows],
  );

  // Mientras el empleado no escriba un monto propio, el campo sigue a la selección.
  useEffect(() => {
    if (!amountTouched) setAmount(selectedPending);
  }, [selectedPending, amountTouched]);

  // Al escribir un monto MAYOR a lo pendiente de lo marcado a mano, se arrastran solas las cuotas
  // siguientes hasta cubrirlo: la última recibe el sobrante como abono parcial. Es el caso de
  // "la cuota es 10,000 y el cliente trae 12,000": se salda la cuota y 2,000 van a la siguiente.
  // Solo actúa cuando el empleado escribió el monto; marcando casillas la selección manda.
  useEffect(() => {
    const next = amountTouched ? autoExtendSelection(rows, manualIds, excludedIds, amount) : [];
    // Se conserva la referencia anterior cuando el resultado no cambia: sin esto, cada render
    // crearía un array nuevo y el efecto se reactivaría en bucle.
    setAutoIds(prev =>
      (prev.length === next.length && prev.every((v, i) => v === next[i])) ? prev : next
    );
  }, [amountTouched, amount, manualIds, excludedIds, rows]);

  const allocation = useMemo(
    () => allocateAmountToInstallments(selectedRows, amount),
    [selectedRows, amount],
  );

  const toggle = (id: string) => {
    if (selectedIds.has(id)) {
      // Desmarcar gana sobre el arrastre automático: si no se registrara la exclusión, el efecto
      // volvería a añadirla en el acto y la casilla no se podría desmarcar.
      setManualIds(prev => prev.filter(x => x !== id));
      setAutoIds(prev => prev.filter(x => x !== id));
      setExcludedIds(prev => prev.includes(id) ? prev : [...prev, id]);
    } else {
      setManualIds(prev => prev.includes(id) ? prev : [...prev, id]);
      setExcludedIds(prev => prev.filter(x => x !== id));
    }
  };

  const clearSelection = () => {
    setManualIds([]);
    setAutoIds([]);
    setExcludedIds([]);
    setAmountTouched(false);
  };

  /** Marca las N cuotas más antiguas. */
  const selectOldest = (n: number) => {
    setManualIds(rows.slice(0, n).map(r => r.id));
    setAutoIds([]);
    setExcludedIds([]);
    setAmountTouched(false);
  };

  const handleSubmit = async () => {
    if (allocation.allocations.length === 0) {
      toast.error('Selecciona al menos una cuota y escribe un monto mayor a 0');
      return;
    }
    if (allocation.leftover > 0.005) {
      toast.error(
        `Sobran ${formatCurrency(allocation.leftover)}: no quedan más cuotas donde aplicarlos. ` +
        'Baja el monto — no se puede cobrar más de lo que se debe.'
      );
      return;
    }
    if (!companyId) {
      toast.error('No se pudo determinar la empresa');
      return;
    }

    setSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const paymentRows = allocation.allocations.map(a => ({
        loan_id: loanId,
        amount: a.applied,
        principal_amount: a.principal,
        interest_amount: a.interest,
        late_fee: 0,
        due_date: a.row.dueDate,
        payment_date: today,
        payment_time_local: nowIso,
        payment_timezone: 'America/Santo_Domingo',
        payment_method: method,
        reference_number: reference || null,
        notes: [
          notes,
          `Pago avanzado: ${a.row.isCharge ? `cargo #${a.row.installmentNumber}` : `cuota #${a.row.installmentNumber}`}` +
          ` (${a.settles ? 'saldada' : 'abono parcial'})`,
        ].filter(Boolean).join(' — '),
        // El sistema solo usa 'completed' / 'pending' en `payments.status` (ver PaymentForm):
        // un abono parcial queda 'pending', igual que en el flujo normal.
        status: a.settles ? 'completed' : 'pending',
        created_by: user?.id || companyId,
        company_id: companyId,
      }));

      const { error: payError } = await supabase.from('payments').insert(paymentRows);
      if (payError) throw payError;

      // Reflejar el estado en `installments`. Los triggers recalculan el balance del préstamo;
      // `is_paid` lo mantiene la aplicación, igual que el flujo normal.
      //
      // `paid_amount` SOLO se escribe en cargos: es el único caso en que el resto del sistema lo
      // mantiene (`PaymentActions` lo recalcula solo para cargos al borrar un pago). Escribirlo en
      // una cuota regular dejaría un valor que nadie actualiza y que luego se leería como pagado.
      for (const a of allocation.allocations) {
        const update: {
          paid_amount?: number; is_paid?: boolean; paid_date?: string; late_fee_paid?: number;
        } = {};
        if (a.row.isCharge) update.paid_amount = round2(a.row.paid + a.applied);
        if (a.settles) {
          update.is_paid = true;
          update.paid_date = today;
          update.late_fee_paid = 0;
        }
        if (Object.keys(update).length === 0) continue;

        const { error: instError } = await supabase.from('installments').update(update).eq('id', a.row.id);
        if (instError) console.error(`Error actualizando cuota ${a.row.installmentNumber}:`, instError);
      }

      // Dar tiempo a los triggers antes de leer el estado final del préstamo.
      await new Promise(r => setTimeout(r, 400));
      const { data: loanAfter } = await supabase
        .from('loans')
        .select('remaining_balance')
        .eq('id', loanId)
        .single();

      if (loanAfter && Number(loanAfter.remaining_balance || 0) <= 0) {
        await supabase.from('loans').update({ status: 'paid' }).eq('id', loanId);
      }

      const settled = allocation.allocations.filter(a => a.settles).length;
      const partial = allocation.allocations.length - settled;
      toast.success(
        `${formatCurrency(allocation.applied)} registrados: ` +
        `${settled} ${settled === 1 ? 'cuota saldada' : 'cuotas saldadas'}` +
        (partial > 0 ? ` y ${partial} con abono parcial` : '')
      );

      // Se arma el recibo ANTES de recargar: `allocation` se recalcula al refrescar las
      // cuotas y se perdería el detalle de lo que se acaba de cobrar.
      const receipt: AdvancedReceiptData = {
        receiptNumber: (crypto.randomUUID?.() ?? String(Date.now())).slice(0, 8).toUpperCase(),
        company: companySettings,
        client: {
          full_name: loanInfo?.client?.full_name ?? clientName ?? null,
          dni: loanInfo?.client?.dni ?? null,
          phone: loanInfo?.client?.phone ?? null,
        },
        loan: { amount: loanInfo?.amount ?? null, interest_rate: loanInfo?.interest_rate ?? null },
        paymentDate: today,
        paymentMethodLabel: PAYMENT_METHODS.find(m => m.value === method)?.label ?? method,
        reference: reference || null,
        notes: notes || null,
        allocations: allocation.allocations.map(a => ({
          installmentNumber: a.row.installmentNumber,
          isCharge: a.row.isCharge,
          dueDate: a.row.dueDate,
          total: a.row.total,
          previouslyPaid: a.row.paid,
          applied: a.applied,
          principal: a.principal,
          interest: a.interest,
          settles: a.settles,
          pendingAfter: round2(Math.max(0, a.row.pending - a.applied)),
        })),
        totalApplied: allocation.applied,
        totalPrincipal: round2(allocation.allocations.reduce((s, a) => s + a.principal, 0)),
        totalInterest: round2(allocation.allocations.reduce((s, a) => s + a.interest, 0)),
        balanceAfter: loanAfter ? Number(loanAfter.remaining_balance ?? 0) : null,
        stillPending: allocation.shortfall,
      };

      window.dispatchEvent(new CustomEvent('installmentsUpdated', {
        detail: { loanId, source: 'AdvancedPaymentPanel' },
      }));

      // El recibo se entrega hacia arriba y allí se muestra: sobrevive a que este panel se
      // desmonte, que es justo lo que pasa al terminar el pago.
      onRegistered(receipt);
    } catch (error) {
      console.error('Error registrando el pago avanzado:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando cuotas pendientes…
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="font-semibold text-green-800">Este préstamo no tiene cuotas ni cargos pendientes.</p>
        <Button variant="outline" className="mt-3" onClick={onCancel}>Volver</Button>
      </div>
    );
  }

  const allocatedFor = (id: string) => allocation.allocations.find(a => a.row.id === id);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
        <div className="flex items-start gap-2">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold">Pago avanzado{clientName ? ` — ${clientName}` : ''}</p>
            <p className="text-xs text-blue-800">
              Escribe el monto total que entrega el cliente y las cuotas se marcan solas, de la más
              antigua en adelante: lo que sobre de una cuota se abona a la siguiente como pago
              parcial. También puedes marcarlas tú a mano. Abajo ves a qué cuota va cada peso antes
              de guardar.
            </p>
          </div>
        </div>
      </div>

      {/* Atajos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">Selección rápida:</span>
        {[1, 2, 3].filter(n => n <= rows.length).map(n => (
          <Button key={n} type="button" variant="outline" size="sm" onClick={() => selectOldest(n)}>
            {n === 1 ? 'La más antigua' : `${n} más antiguas`}
          </Button>
        ))}
        {rows.length > 3 && (
          <Button type="button" variant="outline" size="sm" onClick={() => selectOldest(rows.length)}>
            Todas ({rows.length})
          </Button>
        )}
        {selectedIds.size > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={clearSelection}>
            Limpiar
          </Button>
        )}
      </div>

      {/* Lista de cuotas pendientes */}
      <div className="max-h-72 overflow-y-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="w-10 px-2 py-2"></th>
              <th className="px-2 py-2 text-left">Cuota</th>
              <th className="px-2 py-2 text-left">Vence</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Pagado</th>
              <th className="px-2 py-2 text-right">Pendiente</th>
              <th className="px-2 py-2 text-right">Este pago</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const checked = selectedIds.has(row.id);
              const auto = autoIds.includes(row.id);
              const alloc = allocatedFor(row.id);
              const overdue = row.dueDate < today;
              return (
                <tr
                  key={row.id}
                  className={`border-t cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                  onClick={() => toggle(row.id)}
                >
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={checked} onCheckedChange={() => toggle(row.id)} />
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium">#{row.installmentNumber}</span>
                      {row.isCharge
                        ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">Cargo</Badge>
                        : <span className="text-xs text-gray-500">Cuota</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1.5">
                      <span>{formatDateStringForSantoDomingo(row.dueDate)}</span>
                      {overdue && <Badge variant="destructive" className="text-[10px]">Vencida</Badge>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right text-gray-600">{formatCurrency(row.total)}</td>
                  <td className="px-2 py-2 text-right text-green-700">
                    {row.paid > 0 ? formatCurrency(row.paid) : '—'}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold text-red-600">{formatCurrency(row.pending)}</td>
                  <td className="px-2 py-2 text-right">
                    {alloc ? (
                      <div>
                        <div className="font-semibold text-blue-700">{formatCurrency(alloc.applied)}</div>
                        <div className={`text-[10px] ${alloc.settles ? 'text-green-700' : 'text-amber-700'}`}>
                          {alloc.settles ? 'queda saldada' : 'abono parcial'}
                        </div>
                        {auto && (
                          <div className="text-[10px] text-gray-500">añadida por el monto</div>
                        )}
                      </div>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Monto y desglose */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label htmlFor="adv-amount">Monto total a pagar</Label>
            <NumberInput
              id="adv-amount"
              step="0.01"
              value={amount || ''}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setAmountTouched(true);
                setAmount(parseFloat(e.target.value) || 0);
              }}
              placeholder="0.00"
            />
            <p className="mt-1 text-xs text-gray-500">
              Escribe cualquier monto: las cuotas se marcan solas hasta cubrirlo.
              {' '}Pendiente total del préstamo: <strong>{formatCurrency(totalPending)}</strong>.
              {amountTouched && (
                <button
                  type="button"
                  className="ml-2 text-blue-600 underline"
                  onClick={clearSelection}
                >
                  reiniciar
                </button>
              )}
            </p>
          </div>

          <div>
            <Label>Método de pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="adv-ref">Número de referencia (opcional)</Label>
            <Input id="adv-ref" value={reference} onChange={e => setReference(e.target.value)} placeholder="Comprobante, cheque…" />
          </div>

          <div>
            <Label htmlFor="adv-notes">Notas (opcional)</Label>
            <Textarea id="adv-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border bg-gray-50 p-3">
            <p className="mb-2 text-sm font-semibold text-gray-800">Resumen</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Cuotas seleccionadas</span>
                <span className="font-semibold">{selectedRows.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Se aplicará</span>
                <span className="font-semibold text-blue-700">{formatCurrency(allocation.applied)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quedan saldadas</span>
                <span className="font-semibold text-green-700">
                  {allocation.allocations.filter(a => a.settles).length}
                </span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="text-gray-600">Capital</span>
                <span>{formatCurrency(round2(allocation.allocations.reduce((s, a) => s + a.principal, 0)))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Interés</span>
                <span>{formatCurrency(round2(allocation.allocations.reduce((s, a) => s + a.interest, 0)))}</span>
              </div>
              {allocation.shortfall > 0.005 && (
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-gray-600">Quedará pendiente</span>
                  <span className="font-semibold text-amber-700">{formatCurrency(allocation.shortfall)}</span>
                </div>
              )}
            </div>
          </div>

          {allocation.leftover > 0.005 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                Sobran <strong>{formatCurrency(allocation.leftover)}</strong>: no quedan más cuotas
                donde aplicarlos{excludedIds.length > 0 ? ' entre las que no has desmarcado' : ''}.
                Baja el monto{excludedIds.length > 0 ? ' o vuelve a marcar alguna cuota' : ''} — no
                se puede cobrar más de lo que se debe.
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600">
            Este modo cobra <strong>cuotas y cargos</strong>. La <strong>mora</strong> se cobra desde el
            modo normal, que la calcula y distribuye cuota por cuota.
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancelar</Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving || allocation.allocations.length === 0 || allocation.leftover > 0.005}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Registrar {formatCurrency(allocation.applied)}
        </Button>
      </div>

    </div>
  );
};

export default AdvancedPaymentPanel;
