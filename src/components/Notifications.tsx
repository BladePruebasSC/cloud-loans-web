import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
  type: 'payment_due' | 'payment_overdue' | 'follow_up_due' | 'follow_up_overdue';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  loanId?: string;
  clientName: string;
  amount?: number;
}

const Notifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

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

      // 1. Préstamos con pagos vencidos
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
        .lt('next_payment_date', today.toISOString().split('T')[0]);

      if (!overdueError && overdueLoans) {
        overdueLoans.forEach(loan => {
          const daysOverdue = Math.ceil((today.getTime() - new Date(loan.next_payment_date).getTime()) / (1000 * 60 * 60 * 24));
          notificationsList.push({
            id: `overdue-${loan.id}`,
            type: 'payment_overdue',
            title: 'Pago Vencido',
            message: `${loan.clients.full_name} tiene un pago vencido hace ${daysOverdue} día${daysOverdue !== 1 ? 's' : ''}`,
            priority: 'high',
            dueDate: loan.next_payment_date,
            loanId: loan.id,
            clientName: loan.clients.full_name,
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
        .gte('next_payment_date', today.toISOString().split('T')[0])
        .lte('next_payment_date', nextWeek.toISOString().split('T')[0]);

      if (!upcomingError && upcomingLoans) {
        upcomingLoans.forEach(loan => {
          const paymentDate = new Date(loan.next_payment_date);
          const daysUntilDue = Math.ceil((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          
          // Determinar el tipo de notificación y mensaje
          let title, message, priority;
          
          if (daysUntilDue === 0) {
            // Pago vence hoy
            title = 'Pago Vence Hoy';
            message = `${loan.clients.full_name} tiene un pago que vence HOY`;
            priority = 'high';
          } else if (daysUntilDue === 1) {
            // Pago vence mañana
            title = 'Pago Vence Mañana';
            message = `${loan.clients.full_name} tiene un pago que vence mañana`;
            priority = 'high';
          } else {
            // Pago vence en varios días
            title = 'Pago Próximo';
            message = `${loan.clients.full_name} tiene un pago en ${daysUntilDue} días`;
            priority = daysUntilDue <= 3 ? 'medium' : 'low';
          }
          
          notificationsList.push({
            id: `upcoming-${loan.id}`,
            type: 'payment_due',
            title,
            message,
            priority,
            dueDate: loan.next_payment_date,
            loanId: loan.id,
            clientName: loan.clients.full_name,
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
            clients!inner(full_name)
          )
        `)
        .not('next_contact_date', 'is', null)
        .gte('next_contact_date', today.toISOString().split('T')[0])
        .lte('next_contact_date', nextWeek.toISOString().split('T')[0]);

      if (!followUpError && upcomingFollowUps) {
        upcomingFollowUps.forEach(followUp => {
          const daysUntilFollowUp = Math.ceil((new Date(followUp.next_contact_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const contactTypeLabels = {
            phone: 'Llamada',
            email: 'Email',
            sms: 'SMS',
            visit: 'Visita',
            letter: 'Carta',
            other: 'Otro'
          };
          
          notificationsList.push({
            id: `followup-${followUp.id}`,
            type: 'follow_up_due',
            title: 'Seguimiento Próximo',
            message: `Recordatorio: ${contactTypeLabels[followUp.contact_type as keyof typeof contactTypeLabels]} a ${followUp.loans.clients.full_name} en ${daysUntilFollowUp} día${daysUntilFollowUp !== 1 ? 's' : ''}`,
            priority: daysUntilFollowUp <= 1 ? 'high' : 'medium',
            dueDate: followUp.next_contact_date,
            loanId: followUp.loan_id,
            clientName: followUp.loans.clients.full_name
          });
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
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'payment_due':
        // Si el pago vence hoy, usar icono de alerta
        const today = new Date();
        const dueDate = new Date(notification.dueDate);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysUntilDue === 0) {
          return <AlertTriangle className="h-4 w-4 text-red-500" />;
        } else if (daysUntilDue === 1) {
          return <AlertTriangle className="h-4 w-4 text-orange-500" />;
        } else {
          return <DollarSign className="h-4 w-4 text-orange-500" />;
        }
      case 'follow_up_due':
        return <Phone className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
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
                <Card key={notification.id} className={`border-l-4 ${getPriorityColor(notification.priority)}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {getNotificationIcon(notification)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-sm">{notification.title}</h4>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getPriorityColor(notification.priority)}`}
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
                          className="p-1"
                          title="Ver préstamo"
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
