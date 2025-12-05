import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
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
  type: 'payment_due' | 'payment_overdue' | 'follow_up_due' | 'follow_up_overdue' | 'late_fee_critical' | 'late_fee_high' | 'late_fee_accumulated';
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
  const handleNavigateToAction = (loanId: string, notificationType: string, clientName: string) => {
    // Cerrar el modal de notificaciones
    setIsOpen(false);
    
    if (notificationType === 'payment_overdue' || notificationType === 'payment_due') {
      // Para pagos vencidos o próximos, navegar al módulo de préstamos con acción de pago
      navigate(`/prestamos?action=payment&loanId=${loanId}`);
      toast.success(`Navegando a registrar pago de ${clientName}...`);
    } else if (notificationType === 'follow_up_due') {
      // Para seguimientos, navegar al módulo de préstamos con acción de seguimiento
      navigate(`/prestamos?action=tracking&loanId=${loanId}`);
      toast.success(`Navegando a seguimiento de ${clientName}...`);
    } else if (notificationType === 'late_fee_critical' || notificationType === 'late_fee_high' || notificationType === 'late_fee_accumulated') {
      // Para notificaciones de mora, navegar al módulo de préstamos con acción de pago
      navigate(`/prestamos?action=payment&loanId=${loanId}`);
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
        const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);

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
        .lt('next_payment_date', today.toISOString().split('T')[0]);

      if (!overdueError && overdueLoans) {
        overdueLoans.forEach(loan => {
          const daysOverdue = Math.floor((today.getTime() - new Date(loan.next_payment_date).getTime()) / (1000 * 60 * 60 * 24));
          
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

      // 2. Préstamos con pagos próximos (hoy y próximos 7 días)
      const { data: upcomingLoans, error: upcomingError } = await supabase
        .from('loans')
        .select(`
          id,
          client_id,
          next_payment_date,
          monthly_payment,
          clients!inner(full_name)
        `)
        .eq('status', 'active')
        .neq('status', 'deleted')
        .gte('next_payment_date', today.toISOString().split('T')[0])
        .lte('next_payment_date', nextWeek.toISOString().split('T')[0]);

      if (!upcomingError && upcomingLoans) {
        upcomingLoans.forEach(loan => {
          const paymentDate = new Date(loan.next_payment_date);
          const daysUntilDue = Math.floor((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
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
        .gte('next_contact_date', today.toISOString().split('T')[0])
        .lte('next_contact_date', nextWeek.toISOString().split('T')[0]);

      if (!followUpError && upcomingFollowUps) {
        upcomingFollowUps.forEach(followUp => {
          // Excluir seguimientos de préstamos eliminados
          const loan = followUp.loans as any;
          if (loan?.status === 'deleted') {
            return;
          }
          
          const daysUntilFollowUp = Math.floor((new Date(followUp.next_contact_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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
        .eq('late_fee_enabled', true)
        .gt('current_late_fee', 0);

      if (!lateFeeError && lateFeeLoans) {
        lateFeeLoans.forEach(loan => {
          const today = new Date();
          const nextPayment = new Date(loan.next_payment_date);
          const daysOverdue = Math.max(0, Math.floor((today.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24)) - (loan.grace_period_days || 0));
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
        // Para pagos próximos, usar diferentes iconos según la urgencia
        const today = new Date();
        const dueDate = new Date(notification.dueDate);
        const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
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
                    notification.loanId ? 'cursor-pointer hover:shadow-md transition-shadow' : ''
                  }`}
                  onClick={() => {
                    if (notification.loanId) {
                      handleNavigateToAction(notification.loanId, notification.type, notification.clientName);
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
                              {new Date(notification.dueDate).toLocaleDateString()}
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
                      {notification.loanId && (
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
                            handleNavigateToAction(notification.loanId!, notification.type, notification.clientName);
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
