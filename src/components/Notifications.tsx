import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { formatDateStringForSantoDomingo, getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { daysBetweenIso } from '@/utils/frequencyUtils';
import { addDaysIso } from '@/utils/portfolioMetrics';
import { 
  Bell, 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  Phone, 
  Calendar,
  X,
  ChevronRight
} from 'lucide-react';

interface Notification {
  id: string;
  type: 'payment_due' | 'payment_overdue' | 'follow_up_due' | 'follow_up_overdue' | 'late_fee_critical' | 'late_fee_high' | 'late_fee_accumulated'
    | 'legal_approval_pending' | 'legal_deadline_soon' | 'legal_deadline_overdue' | 'legal_task_overdue' | 'legal_promise_broken' | 'legal_prelegal_ready';
  /** Para notificaciones legales: id del caso al que navegar */
  caseId?: string;
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  loanId?: string;
  clientName: string;
  amount?: number;
  lateFeeAmount?: number;
  daysOverdue?: number;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user, companyId } = useAuth();
  const navigate = useNavigate();

  // Función para navegar a la acción específica de la notificación
  const handleNavigateToAction = (loanId: string, notificationType: string, clientName: string, caseId?: string) => {
    // Cerrar el modal de notificaciones
    setIsOpen(false);

    if (notificationType.startsWith('legal_')) {
      // Notificaciones del módulo de Cobranza Legal: abrir el caso (o la bandeja si aún no hay caso)
      navigate(caseId ? `/cobranza/casos/${caseId}` : '/cobranza?tab=bandeja', { replace: false });
      toast.success(`Abriendo cobranza legal de ${clientName}...`);
      return;
    }

    if (notificationType === 'payment_overdue' || notificationType === 'payment_due') {
      // Para pagos vencidos o próximos, navegar al módulo de préstamos con acción de pago
      navigate(`/prestamos?action=payment&loanId=${loanId}`, { replace: false });
      toast.success(`Navegando a registrar pago de ${clientName}...`);
    } else if (notificationType === 'follow_up_due') {
      // Para seguimientos, navegar al módulo de préstamos con acción de seguimiento
      navigate(`/prestamos?action=tracking&loanId=${loanId}`, { replace: false });
      toast.success(`Navegando a seguimiento de ${clientName}...`);
    } else if (notificationType === 'late_fee_critical' || notificationType === 'late_fee_high' || notificationType === 'late_fee_accumulated') {
      // Para notificaciones de mora, navegar al módulo de préstamos con acción de pago
      navigate(`/prestamos?action=payment&loanId=${loanId}`, { replace: false });
      toast.success(`Navegando a gestionar mora de ${clientName}...`);
    } else {
      // Fallback: navegar al módulo de préstamos
      navigate('/prestamos');
      toast.success('Navegando a préstamos...');
    }
  };

  // Cargar notificaciones
  const fetchNotifications = async () => {
    if (!user) return;
    
    try {
        setLoading(true);
        const notificationsList: Notification[] = [];

      // ====================================================================
      // FECHAS: una sola definición de "hoy", en la zona horaria del negocio
      // ====================================================================
      // Aquí estaba el fallo de las notificaciones. Se hacía:
      //
      //     Math.floor((new Date('2026-09-05') - new Date()) / 86400000)
      //
      // y eso mezcla dos cosas incomparables: `new Date('2026-09-05')` se parsea como
      // MEDIANOCHE UTC, mientras que `new Date()` es el instante actual con su hora. En
      // Santo Domingo (UTC−4) la medianoche UTC del día 5 son las 20:00 del día 4 local, así
      // que la resta no da un número entero de días y `Math.floor` se lo come: un pago del 5
      // de septiembre, mirado el día 3 por la tarde, daba 1 y se anunciaba como "vence
      // mañana". El desfase además cambiaba según la hora del día.
      //
      // `daysBetweenIso` compara dos fechas ISO parseadas como LOCALES a medianoche, así que
      // devuelve días de calendario exactos. Es la misma utilidad que ya usan la mora, el
      // CRM y las métricas de cartera.
      const todayIsoDate = getCurrentDateStringForSantoDomingo();
      const nextWeekIsoDate = addDaysIso(todayIsoDate, 7);

      /** Días de calendario desde hoy hasta `iso`. Negativo si ya pasó. */
      const daysFromToday = (iso?: string | null): number =>
        daysBetweenIso(todayIsoDate, String(iso || '').split('T')[0]) ?? 0;

      // 1. Préstamos con pagos vencidos (fecha ya pasó)
      const { data: overdueLoans, error: overdueError } = await supabase
        .from('loans')
        .select(`
          id,
          client_id,
          next_payment_date,
          monthly_payment,
          remaining_balance,
          clients!inner(full_name)
        `)
        .eq('status', 'active')
        .neq('status', 'deleted')
        .neq('status', 'paid')
        // `today.toISOString()` daba la fecha en UTC: pasadas las 20:00 en Santo Domingo ya
        // era el día siguiente y el filtro se corría un día.
        .lt('next_payment_date', todayIsoDate);

      if (!overdueError && overdueLoans) {
        overdueLoans.forEach(loan => {
          // Excluir préstamos completados (remaining_balance === 0)
          if (loan.remaining_balance === 0 || loan.remaining_balance === null) {
            return;
          }
          
          const daysOverdue = -daysFromToday(loan.next_payment_date);
          
          // Mensaje más específico según los días vencidos
          const clientName = (loan.clients as any)?.full_name || 'Cliente desconocido';
          let title, message;
          if (daysOverdue === 1) {
            title = '⚠️ Pago Vencido Ayer';
            message = `${clientName} tenía un pago que debía realizarse AYER`;
          } else if (daysOverdue <= 7) {
            title = '🚨 Pago Vencido';
            message = `${clientName} tiene un pago vencido hace ${daysOverdue} días`;
          } else {
            title = '🔴 Pago Muy Vencido';
            message = `${clientName} tiene un pago vencido hace ${daysOverdue} días - URGENTE`;
          }
          
          notificationsList.push({
            id: `overdue-${loan.id}`,
            type: 'payment_overdue',
            title,
            message,
            priority: daysOverdue <= 3 ? 'high' : 'high', // Todos los vencidos son alta prioridad
            dueDate: loan.next_payment_date,
            loanId: loan.id,
            clientName: clientName || 'Cliente desconocido',
            amount: loan.monthly_payment
          });
        });
      }

      // 2. Cambios de tasa de interés programados para empeños
      // IMPORTANTE: Solo mostrar notificaciones si la tasa aún NO se ha aplicado
      // IMPORTANTE: Solo mostrar el ÚLTIMO cambio programado por transacción y fecha
      const { data: scheduledRateChanges, error: rateChangesError } = await supabase
        .from('pawn_rate_changes')
        .select(`
          id,
          pawn_transaction_id,
          new_rate,
          effective_date,
          changed_at,
          pawn_transactions!inner(
            id,
            product_name,
            status,
            interest_rate,
            clients!inner(full_name)
          )
        `)
        .eq('user_id', user.id)
        .gte('effective_date', todayIsoDate)
        .lte('effective_date', nextWeekIsoDate)
        .order('effective_date', { ascending: true })
        .order('changed_at', { ascending: false }); // Más reciente primero

      if (!rateChangesError && scheduledRateChanges) {
        // Agrupar por transacción y fecha efectiva, manteniendo solo el más reciente para cada combinación
        // Esto asegura que solo se muestre el último cambio programado para cada fecha
        const changesByTransactionAndDate = new Map<string, any>();
        
        for (const change of scheduledRateChanges) {
          // Crear una clave única: transactionId + effectiveDate
          const key = `${change.pawn_transaction_id}_${change.effective_date}`;
          
          // Si ya existe un cambio para esta combinación, mantener el primero (que es el más reciente por el orden)
          if (!changesByTransactionAndDate.has(key)) {
            changesByTransactionAndDate.set(key, change);
          }
        }
        
        // Convertir el Map a array para procesar solo los cambios únicos
        const uniqueChanges = Array.from(changesByTransactionAndDate.values());
        console.log(`🔍 Cambios de tasa programados: ${scheduledRateChanges.length} totales, ${uniqueChanges.length} únicos (último por transacción y fecha)`);
        
        uniqueChanges.forEach((change: any) => {
          const transaction = change.pawn_transactions;
          if (transaction && transaction.status === 'active') {
            // Verificar si la tasa ya se aplicó
            // Si la tasa actual es igual a la nueva tasa programada, significa que ya se aplicó
            const currentRate = Number(transaction.interest_rate);
            const newRate = Number(change.new_rate);
            
            // Solo mostrar notificación si la tasa actual es diferente a la nueva tasa programada
            // Esto significa que el cambio aún no se ha aplicado
            if (currentRate === newRate) {
              console.log(`⏭️ Omitiendo notificación de cambio de tasa ${change.id}: La tasa ya se aplicó (${currentRate}% = ${newRate}%)`);
              return; // Saltar esta notificación, la tasa ya se aplicó
            }
            
            const clientName = (transaction.clients as any)?.full_name || 'Cliente desconocido';
            const productName = transaction.product_name || 'Artículo';
            
            // Usar la fecha actual en zona horaria de Santo Domingo para comparar correctamente
            const todayString = getCurrentDateStringForSantoDomingo(); // Formato YYYY-MM-DD
            
            // Este cálculo ya era correcto (comparaba dos fechas locales a medianoche); se
            // pasa a `daysFromToday` para que TODAS las notificaciones usen el mismo camino.
            const daysUntilEffective = daysFromToday(change.effective_date);

            let title, message;
            if (daysUntilEffective === 0) {
              title = '📅 Cambio de Tasa HOY';
              message = `La tasa de interés de ${productName} (${clientName}) cambiará a ${change.new_rate}% HOY`;
            } else if (daysUntilEffective === 1) {
              title = '📅 Cambio de Tasa Mañana';
              message = `La tasa de interés de ${productName} (${clientName}) cambiará a ${change.new_rate}% mañana`;
            } else {
              title = '📅 Cambio de Tasa Programado';
              message = `La tasa de interés de ${productName} (${clientName}) cambiará a ${change.new_rate}% en ${daysUntilEffective} días`;
            }
            
            notificationsList.push({
              id: `rate-change-${change.id}`,
              type: 'payment_due', // Usar tipo existente
              title,
              message,
              priority: daysUntilEffective <= 1 ? 'high' : 'medium',
              dueDate: change.effective_date,
              clientName: clientName || 'Cliente desconocido'
            });
          }
        });
      }

      // 3. Préstamos con pagos próximos (hoy y próximos 7 días)
      const { data: upcomingLoans, error: upcomingError } = await supabase
        .from('loans')
        .select(`
          id,
          client_id,
          next_payment_date,
          monthly_payment,
          remaining_balance,
          clients!inner(full_name)
        `)
        .eq('status', 'active')
        .neq('status', 'deleted')
        .neq('status', 'paid')
        .gte('next_payment_date', todayIsoDate)
        .lte('next_payment_date', nextWeekIsoDate);

      if (!upcomingError && upcomingLoans) {
        upcomingLoans.forEach(loan => {
          // Excluir préstamos completados (remaining_balance === 0)
          if (loan.remaining_balance === 0 || loan.remaining_balance === null) {
            return;
          }
          
          const daysUntilDue = daysFromToday(loan.next_payment_date);
          
          // Determinar el tipo de notificación y mensaje
          const clientName = (loan.clients as any)?.full_name || 'Cliente desconocido';
          let title, message, priority;
          
          if (daysUntilDue === 0) {
            // Pago vence hoy
            title = '⏰ Pago Vence HOY';
            message = `${clientName} tiene un pago que vence HOY - ¡No olvides cobrar!`;
            priority = 'high';
          } else if (daysUntilDue === 1) {
            // Pago vence mañana
            title = '📅 Pago Vence Mañana';
            message = `${clientName} tiene un pago que vence mañana`;
            priority = 'high';
          } else if (daysUntilDue <= 3) {
            // Pago vence en pocos días
            title = '⏳ Pago Próximo';
            message = `${clientName} tiene un pago en ${daysUntilDue} días`;
            priority = 'medium';
          } else {
            // Pago vence en varios días
            title = '📋 Pago Programado';
            message = `${clientName} tiene un pago en ${daysUntilDue} días`;
            priority = 'low';
          }
          
          notificationsList.push({
            id: `upcoming-${loan.id}`,
            type: 'payment_due',
            title,
            message,
            priority,
            dueDate: loan.next_payment_date,
            loanId: loan.id,
            clientName: clientName || 'Cliente desconocido',
            amount: loan.monthly_payment
          });
        });
      }

      // 3. Seguimientos de cobro próximos
      const { data: upcomingFollowUps, error: followUpError } = await supabase
        .from('collection_tracking')
        .select(`
          id,
          loan_id,
          next_contact_date,
          contact_type,
          loans!inner(
            id,
            status,
            clients!inner(full_name)
          )
        `)
        .not('next_contact_date', 'is', null)
        .gte('next_contact_date', todayIsoDate)
        .lte('next_contact_date', nextWeekIsoDate);

      if (!followUpError && upcomingFollowUps) {
        upcomingFollowUps.forEach(followUp => {
          // Excluir seguimientos de préstamos eliminados o completados
          const loan = followUp.loans as any;
          if (loan?.status === 'deleted' || loan?.status === 'paid') {
            return;
          }
          
          const daysUntilFollowUp = daysFromToday(followUp.next_contact_date);
          const contactTypeLabels = {
            phone: 'Llamada',
            email: 'Email',
            sms: 'SMS',
            visit: 'Visita',
            letter: 'Carta',
            other: 'Otro'
          };
          
          // Acceder correctamente al nombre del cliente
          const clientName = loan?.clients?.full_name || 'Cliente desconocido';
          
          notificationsList.push({
            id: `followup-${followUp.id}`,
            type: 'follow_up_due',
            title: 'Seguimiento Próximo',
            message: `Recordatorio: ${contactTypeLabels[followUp.contact_type as keyof typeof contactTypeLabels]} a ${clientName} en ${daysUntilFollowUp} día${daysUntilFollowUp !== 1 ? 's' : ''}`,
            priority: daysUntilFollowUp <= 1 ? 'high' : 'medium',
            dueDate: followUp.next_contact_date,
            loanId: followUp.loan_id,
            clientName: clientName || 'Cliente desconocido'
          });
        });
      }

      // 4. Notificaciones de Mora
      const { data: lateFeeLoans, error: lateFeeError } = await supabase
        .from('loans')
        .select(`
          id,
          client_id,
          current_late_fee,
          late_fee_rate,
          grace_period_days,
          next_payment_date,
          late_fee_enabled,
          clients!inner(
            full_name,
            company_id
          )
        `)
        .eq('loan_officer_id', companyId as string)
        .neq('status', 'deleted')
        .neq('status', 'paid')
        .eq('late_fee_enabled', true)
        .gt('current_late_fee', 0);

      if (!lateFeeError && lateFeeLoans) {
        lateFeeLoans.forEach(loan => {
          // Excluir préstamos completados - el filtro de status 'paid' ya los excluye, pero agregamos validación adicional
          
          // Días REALES de atraso. La gracia perdona la mora, no el atraso: descontarla aquí
          // hacía que un préstamo vencido apareciera con menos días de los que lleva.
          const daysOverdue = Math.max(0, -daysFromToday(loan.next_payment_date));
          const lateFeeAmount = loan.current_late_fee || 0;
          const clientName = (loan.clients as any).full_name || 'Cliente desconocido';

          // Notificación crítica: Mora muy alta o muchos días vencidos
          if (lateFeeAmount > 10000 || daysOverdue > 30) {
            notificationsList.push({
              id: `late_fee_critical_${loan.id}`,
              type: 'late_fee_critical',
              title: 'Mora Crítica',
              message: `${clientName} tiene una mora de RD$${lateFeeAmount.toLocaleString()} (${daysOverdue} días vencidos)`,
              priority: 'high',
              dueDate: loan.next_payment_date,
              loanId: loan.id,
              clientName,
              lateFeeAmount,
              daysOverdue
            });
          }
          // Notificación alta: Mora significativa
          else if (lateFeeAmount > 5000 || daysOverdue > 14) {
            notificationsList.push({
              id: `late_fee_high_${loan.id}`,
              type: 'late_fee_high',
              title: 'Mora Alta',
              message: `${clientName} tiene una mora de RD$${lateFeeAmount.toLocaleString()} (${daysOverdue} días vencidos)`,
              priority: 'high',
              dueDate: loan.next_payment_date,
              loanId: loan.id,
              clientName,
              lateFeeAmount,
              daysOverdue
            });
          }
          // Notificación media: Mora acumulada
          else if (lateFeeAmount > 1000 || daysOverdue > 7) {
            notificationsList.push({
              id: `late_fee_accumulated_${loan.id}`,
              type: 'late_fee_accumulated',
              title: 'Mora Acumulada',
              message: `${clientName} tiene una mora de RD$${lateFeeAmount.toLocaleString()} (${daysOverdue} días vencidos)`,
              priority: 'medium',
              dueDate: loan.next_payment_date,
              loanId: loan.id,
              clientName,
              lateFeeAmount,
              daysOverdue
            });
          }
        });
      }

      // 5. Cobranza Legal (calculadas igual que el resto; si las tablas no existen se omiten)
      try {
        const todayIso = getCurrentDateStringForSantoDomingo();
        const [{ data: openCases }, { data: cfg }] = await Promise.all([
          supabase.from('legal_cases')
            .select('id, case_number, status, next_action_at, next_action_note, last_action_at, assigned_to, client:client_id(full_name)')
            .eq('company_id', companyId as string)
            .not('status', 'in', '("resolved","closed")'),
          supabase.rpc('legal_get_settings' as any, { p_company: companyId } as any),
        ]);
        const followupDays = Number((cfg as any)?.followup_days ?? 3);
        const caseIds = (openCases || []).map((c: any) => c.id);
        if (caseIds.length > 0) {
          const nameOf = (id: string) => ((openCases || []).find((c: any) => c.id === id) as any)?.client?.full_name || 'Cliente';
          const numberOf = (id: string) => ((openCases || []).find((c: any) => c.id === id) as any)?.case_number || '';
          const dayDiff = (iso: string) => Math.round((new Date(iso + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86400000);

          const [{ data: approvalsPending }, { data: intims }, { data: tasksDue }, { data: brokenPromises }] = await Promise.all([
            supabase.from('legal_approvals').select('id, case_id, status, requested_at').in('case_id', caseIds).in('status', ['requested', 'reviewed']),
            supabase.from('legal_intimations').select('id, case_id, intimation_number, status, deadline_date').in('case_id', caseIds).in('status', ['notified', 'expired']),
            supabase.from('legal_case_tasks').select('id, case_id, title, due_date, status').in('case_id', caseIds).in('status', ['pending', 'in_progress', 'overdue']).lte('due_date', todayIso),
            supabase.from('collection_promises').select('id, case_id, amount, promised_date, resolved_at').in('case_id', caseIds).eq('status', 'broken').gte('resolved_at', new Date(Date.now() - 7 * 86400000).toISOString()),
          ]);

          (approvalsPending || []).forEach((a: any) => notificationsList.push({
            id: `legal-approval-${a.id}`, type: 'legal_approval_pending', title: '⚖️ Intimación pendiente de aprobación',
            message: `${nameOf(a.case_id)} · ${numberOf(a.case_id)} ${a.status === 'reviewed' ? '(revisada, falta aprobar)' : '(sin revisar)'}`,
            priority: 'high', dueDate: String(a.requested_at).split('T')[0], caseId: a.case_id, clientName: nameOf(a.case_id),
          }));
          (intims || []).forEach((i: any) => {
            if (!i.deadline_date) return;
            const d = dayDiff(i.deadline_date);
            if (i.status === 'expired' || d < 0) {
              notificationsList.push({ id: `legal-deadline-over-${i.id}`, type: 'legal_deadline_overdue', title: '🔴 Plazo de intimación vencido', message: `${nameOf(i.case_id)} · ${i.intimation_number || numberOf(i.case_id)} venció hace ${-d} día${-d === 1 ? '' : 's'}`, priority: 'high', dueDate: i.deadline_date, caseId: i.case_id, clientName: nameOf(i.case_id) });
            } else if (d <= followupDays) {
              notificationsList.push({ id: `legal-deadline-soon-${i.id}`, type: 'legal_deadline_soon', title: '⏳ Plazo de intimación por vencer', message: `${nameOf(i.case_id)} · ${i.intimation_number || numberOf(i.case_id)} vence ${d === 0 ? 'HOY' : `en ${d} día${d === 1 ? '' : 's'}`}`, priority: d <= 1 ? 'high' : 'medium', dueDate: i.deadline_date, caseId: i.case_id, clientName: nameOf(i.case_id) });
            }
          });
          (tasksDue || []).forEach((t: any) => notificationsList.push({
            id: `legal-task-${t.id}`, type: 'legal_task_overdue', title: dayDiff(t.due_date) < 0 ? '📋 Tarea legal vencida' : '📋 Tarea legal para hoy',
            message: `${t.title} · ${nameOf(t.case_id)} · ${numberOf(t.case_id)}`, priority: dayDiff(t.due_date) < 0 ? 'high' : 'medium', dueDate: t.due_date, caseId: t.case_id, clientName: nameOf(t.case_id),
          }));
          (brokenPromises || []).forEach((p: any) => notificationsList.push({
            id: `legal-promise-${p.id}`, type: 'legal_promise_broken', title: '💔 Promesa de pago incumplida',
            message: `${nameOf(p.case_id)} prometió RD$${Number(p.amount).toLocaleString()} para el ${p.promised_date}`, priority: 'high', dueDate: p.promised_date, caseId: p.case_id, clientName: nameOf(p.case_id), amount: Number(p.amount),
          }));
          (openCases || []).forEach((c: any) => {
            if (c.next_action_at && dayDiff(c.next_action_at) <= 0 && !['paid', 'suspended'].includes(c.status)) {
              notificationsList.push({ id: `legal-next-${c.id}`, type: 'legal_prelegal_ready', title: dayDiff(c.next_action_at) < 0 ? '⚖️ Acción legal atrasada' : '⚖️ Acción legal para hoy', message: `${c.client?.full_name} · ${c.case_number}: ${c.next_action_note || 'próxima acción programada'}`, priority: dayDiff(c.next_action_at) < 0 ? 'high' : 'medium', dueDate: c.next_action_at, caseId: c.id, clientName: c.client?.full_name || 'Cliente' });
            }
          });
        }
      } catch (legalErr) {
        // Módulo legal no instalado o sin permiso: no bloquear el resto de notificaciones
        console.warn('Notificaciones legales no disponibles:', legalErr);
      }

      // Ordenar notificaciones por prioridad y fecha
      notificationsList.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });

      setNotifications(notificationsList);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar notificaciones al montar el componente
  useEffect(() => {
    fetchNotifications();
    
    // Recargar notificaciones cada 5 minutos
    const interval = setInterval(fetchNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  const getNotificationIcon = (notification: Notification) => {
    switch (notification.type) {
      case 'payment_overdue':
        // Para pagos vencidos, siempre usar icono de alerta roja
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'payment_due':
        // Para pagos próximos, usar diferentes iconos según la urgencia.
        // Mismo criterio de fechas que el texto, o el icono contradiría al mensaje.
        const daysUntilDue = daysBetweenIso(
          getCurrentDateStringForSantoDomingo(),
          String(notification.dueDate || '').split('T')[0],
        ) ?? 0;
        
        if (daysUntilDue === 0) {
          // Pago vence hoy - alerta roja
          return <AlertTriangle className="h-4 w-4 text-red-500" />;
        } else if (daysUntilDue === 1) {
          // Pago vence mañana - alerta naranja
          return <AlertTriangle className="h-4 w-4 text-orange-500" />;
        } else if (daysUntilDue <= 3) {
          // Pago en pocos días - dólar naranja
          return <DollarSign className="h-4 w-4 text-orange-500" />;
        } else {
          // Pago en varios días - dólar azul
          return <DollarSign className="h-4 w-4 text-blue-500" />;
        }
      case 'follow_up_due':
        return <Phone className="h-4 w-4 text-blue-500" />;
      case 'late_fee_critical':
        return <AlertTriangle className="h-4 w-4 text-red-600" />;
      case 'late_fee_high':
        return <AlertTriangle className="h-4 w-4 text-orange-600" />;
      case 'late_fee_accumulated':
        return <DollarSign className="h-4 w-4 text-yellow-600" />;
      case 'legal_deadline_overdue':
      case 'legal_promise_broken':
        return <AlertTriangle className="h-4 w-4 text-purple-700" />;
      case 'legal_approval_pending':
      case 'legal_deadline_soon':
      case 'legal_task_overdue':
      case 'legal_prelegal_ready':
        return <Calendar className="h-4 w-4 text-purple-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string, type?: string) => {
    // Para pagos vencidos, usar un color más intenso
    if (type === 'payment_overdue') {
      return 'bg-red-200 text-red-900 border-red-300 border-l-red-500';
    }
    
    // Para notificaciones de mora crítica, usar color rojo intenso
    if (type === 'late_fee_critical') {
      return 'bg-red-200 text-red-900 border-red-300 border-l-red-500';
    }
    
    // Para notificaciones de mora alta, usar color naranja intenso
    if (type === 'late_fee_high') {
      return 'bg-orange-200 text-orange-900 border-orange-300 border-l-orange-500';
    }
    
    // Para notificaciones de mora acumulada, usar color amarillo
    if (type === 'late_fee_accumulated') {
      return 'bg-yellow-200 text-yellow-900 border-yellow-300 border-l-yellow-500';
    }
    
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200 border-l-red-400';
      case 'medium':
        return 'bg-orange-100 text-orange-800 border-orange-200 border-l-orange-400';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200 border-l-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 border-l-gray-400';
    }
  };

  const unreadCount = notifications.length;

  return (
    <>
      {/* Botón de notificaciones */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="relative p-2 text-gray-700 hover:bg-gray-100"
        title="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500 text-white border-0"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Modal de notificaciones */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notificaciones
              {unreadCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {unreadCount}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Cargando notificaciones...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Bell className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Sin notificaciones</h3>
                <p className="text-gray-600">No hay recordatorios pendientes</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <Card 
                  key={notification.id} 
                  className={`border-l-4 ${getPriorityColor(notification.priority, notification.type)} ${
                    (notification.loanId || notification.caseId) ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                  }`}
                  onClick={() => {
                    if (notification.loanId || notification.caseId) {
                      handleNavigateToAction(notification.loanId || '', notification.type, notification.clientName, notification.caseId);
                    }
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getNotificationIcon(notification)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">{notification.title}</h4>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getPriorityColor(notification.priority, notification.type)}`}
                            >
                              {notification.priority === 'high' ? 'Alta' : 
                               notification.priority === 'medium' ? 'Media' : 'Baja'}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{notification.message}</p>
                          <div className="flex items-center gap-4 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDateStringForSantoDomingo(notification.dueDate)}
                            </div>
                            {notification.amount && (
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                ${notification.amount.toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(notification.loanId || notification.caseId) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-1 hover:bg-gray-100 transition-colors flex-shrink-0"
                          title={
                            notification.type === 'payment_overdue' || notification.type === 'payment_due' 
                              ? "Registrar pago" 
                              : notification.type === 'follow_up_due' 
                                ? "Crear seguimiento" 
                                : notification.type === 'late_fee_critical' || notification.type === 'late_fee_high' || notification.type === 'late_fee_accumulated'
                                  ? "Gestionar mora"
                                  : "Ver préstamo"
                          }
                          onClick={(e) => {
                            e.stopPropagation(); // Evitar doble click
                            handleNavigateToAction(notification.loanId || '', notification.type, notification.clientName, notification.caseId);
                          }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="flex justify-end pt-4 border-t">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
              >
                Cerrar
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Notifications;
