import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  BarChart3,
  DollarSign, 
  Calendar, 
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Receipt,
  Target,
  Activity,
  X,
  RefreshCw,
  PieChart
} from 'lucide-react';

interface LoanStatisticsProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface LoanStats {
  // Información básica del préstamo
  loanAmount: number;
  remainingBalance: number;
  monthlyPayment: number;
  interestRate: number;
  termMonths: number;
  startDate: string;
  nextPaymentDate: string;
  status: string;
  
  // Estadísticas de pagos
  totalPayments: number;
  totalPaid: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
  totalLateFees: number;
  averagePaymentAmount: number;
  
  // Métricas de rendimiento
  paymentsMade: number;
  paymentsRemaining: number;
  percentagePaid: number;
  daysOverdue: number;
  onTimePayments: number;
  latePayments: number;
  
  // Proyecciones
  projectedEndDate: string;
  totalInterestProjected: number;
  monthsRemaining: number;
  
  // Historial de pagos recientes
  recentPayments: any[];
}

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  next_payment_date: string;
  status: string;
  client: {
    full_name: string;
    dni: string;
  };
}

export const LoanStatistics: React.FC<LoanStatisticsProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [stats, setStats] = useState<LoanStats | null>(null);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && loanId) {
      fetchLoanStatistics();
    }
  }, [isOpen, loanId]);

  const fetchLoanStatistics = async () => {
    setLoading(true);
    try {
      // Obtener información del préstamo
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select(`
          *,
          client:client_id (
            full_name,
            dni
          )
        `)
        .eq('id', loanId)
        .single();

      if (loanError) throw loanError;
      setLoan(loanData);

      // Obtener todos los pagos del préstamo
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Calcular estadísticas
      const paymentsData = payments || [];
      const totalPaid = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);
      const totalPrincipalPaid = paymentsData.reduce((sum, payment) => sum + payment.principal_amount, 0);
      const totalInterestPaid = paymentsData.reduce((sum, payment) => sum + payment.interest_amount, 0);
      const totalLateFees = paymentsData.reduce((sum, payment) => sum + payment.late_fee, 0);

      // Calcular días de atraso
      const today = new Date();
      const nextPaymentDate = new Date(loanData.next_payment_date);
      const daysOverdue = loanData.status === 'overdue' 
        ? Math.floor((today.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Calcular pagos puntuales vs tardíos
      const onTimePayments = paymentsData.filter(payment => {
        const paymentDate = new Date(payment.payment_date);
        const dueDate = new Date(payment.due_date);
        return paymentDate <= dueDate;
      }).length;

      const latePayments = paymentsData.length - onTimePayments;

      // Calcular proyecciones
      const monthsElapsed = Math.floor(
        (today.getTime() - new Date(loanData.start_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
      const monthsRemaining = Math.max(0, loanData.term_months - monthsElapsed);
      const projectedEndDate = new Date(today.getTime() + (monthsRemaining * 30 * 24 * 60 * 60 * 1000));
      
      const totalInterestProjected = (loanData.amount * loanData.interest_rate * loanData.term_months) / 100;

      const calculatedStats: LoanStats = {
        // Información básica
        loanAmount: loanData.amount,
        remainingBalance: loanData.remaining_balance,
        monthlyPayment: loanData.monthly_payment,
        interestRate: loanData.interest_rate,
        termMonths: loanData.term_months,
        startDate: loanData.start_date,
        nextPaymentDate: loanData.next_payment_date,
        status: loanData.status,
        
        // Estadísticas de pagos
        totalPayments: paymentsData.length,
        totalPaid,
        totalPrincipalPaid,
        totalInterestPaid,
        totalLateFees,
        averagePaymentAmount: paymentsData.length > 0 ? totalPaid / paymentsData.length : 0,
        
        // Métricas de rendimiento
        paymentsMade: paymentsData.length,
        paymentsRemaining: Math.max(0, loanData.term_months - paymentsData.length),
        percentagePaid: loanData.amount > 0 ? (totalPrincipalPaid / loanData.amount) * 100 : 0,
        daysOverdue,
        onTimePayments,
        latePayments,
        
        // Proyecciones
        projectedEndDate: projectedEndDate.toISOString().split('T')[0],
        totalInterestProjected,
        monthsRemaining,
        
        // Historial reciente (últimos 5 pagos)
        recentPayments: paymentsData.slice(0, 5)
      };

      setStats(calculatedStats);
    } catch (error) {
      console.error('Error fetching loan statistics:', error);
      toast.error('Error al cargar estadísticas del préstamo');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: 'DOP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
      overdue: { label: 'Vencido', color: 'bg-red-100 text-red-800' },
      paid: { label: 'Pagado', color: 'bg-blue-100 text-blue-800' },
      pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || 
                  { label: status, color: 'bg-gray-100 text-gray-800' };
    
    return (
      <Badge className={config.color}>
        {config.label}
      </Badge>
    );
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'En línea'
    };
    return methods[method as keyof typeof methods] || method;
  };

  if (loading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cargando estadísticas...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-lg">Cargando...</span>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!stats || !loan) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Estadísticas - {loan.client.full_name}
            </div>
            <Button size="sm" variant="outline" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Información General */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Información General
                </div>
                {getStatusBadge(stats.status)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {formatCurrency(stats.loanAmount)}
                  </div>
                  <div className="text-sm text-gray-600">Monto Original</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(stats.remainingBalance)}
                  </div>
                  <div className="text-sm text-gray-600">Balance Restante</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency(stats.monthlyPayment)}
                  </div>
                  <div className="text-sm text-gray-600">Cuota Mensual</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {formatPercentage(stats.interestRate)}
                  </div>
                  <div className="text-sm text-gray-600">Tasa de Interés</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progreso del Préstamo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Progreso del Préstamo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span>Progreso de Pago</span>
                  <span className="font-semibold">{formatPercentage(stats.percentagePaid)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div 
                    className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, stats.percentagePaid)}%` }}
                  ></div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">
                      {stats.paymentsMade}
                    </div>
                    <div className="text-sm text-gray-600">Pagos Realizados</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-orange-600">
                      {stats.paymentsRemaining}
                    </div>
                    <div className="text-sm text-gray-600">Pagos Restantes</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-blue-600">
                      {stats.monthsRemaining}
                    </div>
                    <div className="text-sm text-gray-600">Meses Restantes</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de Pagos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Estadísticas de Pagos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Pagado:</span>
                    <span className="font-semibold">{formatCurrency(stats.totalPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Principal Pagado:</span>
                    <span className="font-semibold">{formatCurrency(stats.totalPrincipalPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Intereses Pagados:</span>
                    <span className="font-semibold">{formatCurrency(stats.totalInterestPaid)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cargos por Mora:</span>
                    <span className="font-semibold text-red-600">{formatCurrency(stats.totalLateFees)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio por Pago:</span>
                    <span className="font-semibold">{formatCurrency(stats.averagePaymentAmount)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Rendimiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Pagos Puntuales:</span>
                    <span className="font-semibold text-green-600">{stats.onTimePayments}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pagos Tardíos:</span>
                    <span className="font-semibold text-red-600">{stats.latePayments}</span>
                  </div>
                  {stats.daysOverdue > 0 && (
                    <div className="flex justify-between">
                      <span>Días de Atraso:</span>
                      <span className="font-semibold text-red-600">{stats.daysOverdue} días</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Próximo Pago:</span>
                    <span className="font-semibold">
                      {new Date(stats.nextPaymentDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fecha Proyectada de Finalización:</span>
                    <span className="font-semibold">
                      {new Date(stats.projectedEndDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Historial de Pagos Recientes */}
          {stats.recentPayments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Pagos Recientes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.recentPayments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Receipt className="h-4 w-4 text-green-600" />
                        <div>
                          <div className="font-medium">
                            {formatCurrency(payment.amount)}
                          </div>
                          <div className="text-sm text-gray-600">
                            {new Date(payment.payment_date).toLocaleDateString()} - 
                            {' '}{getPaymentMethodLabel(payment.payment_method)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          Principal: {formatCurrency(payment.principal_amount)}
                        </div>
                        <div className="text-sm text-gray-600">
                          Interés: {formatCurrency(payment.interest_amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botones de Acción */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={fetchLoanStatistics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
            <Button onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
