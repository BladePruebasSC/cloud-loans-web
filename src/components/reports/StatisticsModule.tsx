import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Users, 
  Calendar,
  BarChart3,
  PieChart,
  LineChart,
  Activity,
  Target,
  AlertCircle,
  CheckCircle,
  Clock,
  Receipt,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Download,
  RefreshCw
} from 'lucide-react';

interface LoanStats {
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  paidLoans: number;
  totalAmount: number;
  totalBalance: number;
  totalInterest: number;
  averageLoanAmount: number;
  averageInterestRate: number;
}

interface PaymentStats {
  totalPayments: number;
  totalAmount: number;
  averagePayment: number;
  monthlyPayments: { month: string; amount: number; count: number }[];
  paymentMethods: { method: string; count: number; amount: number }[];
  dailyPayments: { date: string; amount: number; count: number }[];
}

interface PerformanceMetrics {
  collectionRate: number;
  averageDaysToPayment: number;
  overdueRate: number;
  growthRate: number;
  topPerformingMonths: { month: string; amount: number }[];
}

export const StatisticsModule = () => {
  const [loanStats, setLoanStats] = useState<LoanStats | null>(null);
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('30d');
  const [selectedView, setSelectedView] = useState('overview');
  const { user, companyId } = useAuth();

  useEffect(() => {
    if (user && companyId) {
      fetchStatistics();
    }
  }, [user, companyId, timeRange]);

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchLoanStatistics(),
        fetchPaymentStatistics(),
        fetchPerformanceMetrics()
      ]);
    } catch (error) {
      console.error('Error fetching statistics:', error);
      toast.error('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanStatistics = async () => {
    try {
      const currentDate = new Date();
      const thirtyDaysAgo = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      // Construir la consulta base
      let query = supabase
        .from('loans')
        .select('*')
        .eq('loan_officer_id', companyId)
        .not('status', 'eq', 'deleted');

      // Agregar filtro de fecha si es necesario
      if (timeRange === '30d') {
        query = query.gte('created_at', thirtyDaysAgo.toISOString());
      }

      const { data: loans, error: loansError } = await query;

      if (loansError) throw loansError;

      const loansData = loans || [];

      const stats: LoanStats = {
        totalLoans: loansData.length,
        activeLoans: loansData.filter(loan => loan.status === 'active').length,
        overdueLoans: loansData.filter(loan => loan.status === 'overdue').length,
        paidLoans: loansData.filter(loan => loan.status === 'paid').length,
        totalAmount: loansData.reduce((sum, loan) => sum + (loan.amount || 0), 0),
        totalBalance: loansData.reduce((sum, loan) => sum + (loan.remaining_balance || 0), 0),
        totalInterest: loansData.reduce((sum, loan) => {
          const totalInterest = (loan.amount * loan.interest_rate * loan.term_months) / 100;
          return sum + totalInterest;
        }, 0),
        averageLoanAmount: loansData.length > 0 
          ? loansData.reduce((sum, loan) => sum + (loan.amount || 0), 0) / loansData.length 
          : 0,
        averageInterestRate: loansData.length > 0 
          ? loansData.reduce((sum, loan) => sum + (loan.interest_rate || 0), 0) / loansData.length 
          : 0
      };

      setLoanStats(stats);
    } catch (error) {
      console.error('Error fetching loan statistics:', error);
    }
  };

  const fetchPaymentStatistics = async () => {
    try {
      const currentDate = new Date();
      const thirtyDaysAgo = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      // Construir la consulta base
      let query = supabase
        .from('payments')
        .select('*')
        .eq('created_by', companyId);

      // Agregar filtro de fecha si es necesario
      if (timeRange === '30d') {
        query = query.gte('created_at', thirtyDaysAgo.toISOString());
      }

      const { data: payments, error: paymentsError } = await query;

      if (paymentsError) throw paymentsError;

      const paymentsData = payments || [];

      // Agrupar pagos por mes
      const monthlyPayments = filteredPayments.reduce((acc, payment) => {
        const month = new Date(payment.payment_date).toLocaleDateString('es-ES', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        if (!acc[month]) {
          acc[month] = { amount: 0, count: 0 };
        }
        acc[month].amount += payment.amount;
        acc[month].count += 1;
        return acc;
      }, {} as Record<string, { amount: number; count: number }>);

      // Agrupar por método de pago
      const paymentMethods = paymentsData.reduce((acc, payment) => {
        const method = payment.payment_method;
        if (!acc[method]) {
          acc[method] = { count: 0, amount: 0 };
        }
        acc[method].count += 1;
        acc[method].amount += payment.amount;
        return acc;
      }, {} as Record<string, { count: number; amount: number }>);

      // Agrupar por día (últimos 30 días)
      const dailyPayments = paymentsData.reduce((acc, payment) => {
        const date = new Date(payment.payment_date).toLocaleDateString();
        if (!acc[date]) {
          acc[date] = { amount: 0, count: 0 };
        }
        acc[date].amount += payment.amount;
        acc[date].count += 1;
        return acc;
      }, {} as Record<string, { amount: number; count: number }>);

      const stats: PaymentStats = {
        totalPayments: paymentsData.length,
        totalAmount: paymentsData.reduce((sum, payment) => sum + payment.amount, 0),
        averagePayment: paymentsData.length > 0 
          ? paymentsData.reduce((sum, payment) => sum + payment.amount, 0) / paymentsData.length 
          : 0,
        monthlyPayments: Object.entries(monthlyPayments).map(([month, data]) => ({
          month,
          amount: data.amount,
          count: data.count
        })),
        paymentMethods: Object.entries(paymentMethods).map(([method, data]) => ({
          method,
          count: data.count,
          amount: data.amount
        })),
        dailyPayments: Object.entries(dailyPayments).map(([date, data]) => ({
          date,
          amount: data.amount,
          count: data.count
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      };

      setPaymentStats(stats);
    } catch (error) {
      console.error('Error fetching payment statistics:', error);
    }
  };

  const fetchPerformanceMetrics = async () => {
    try {
      const currentDate = new Date();
      const thirtyDaysAgo = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000));
      
      // Construir consultas base
      let loansQuery = supabase
        .from('loans')
        .select('*')
        .eq('loan_officer_id', companyId)
        .not('status', 'eq', 'deleted');

      let paymentsQuery = supabase
        .from('payments')
        .select('*')
        .eq('created_by', companyId);

      // Agregar filtros de fecha si es necesario
      if (timeRange === '30d') {
        loansQuery = loansQuery.gte('created_at', thirtyDaysAgo.toISOString());
        paymentsQuery = paymentsQuery.gte('created_at', thirtyDaysAgo.toISOString());
      }

      const { data: loans } = await loansQuery;
      const { data: payments } = await paymentsQuery;

      const loansData = loans || [];
      const paymentsData = payments || [];

      // Calcular tasa de cobro
      const totalExpectedPayments = loansData.reduce((sum, loan) => {
        const expectedPayments = loan.term_months * loan.monthly_payment;
        return sum + expectedPayments;
      }, 0);

      const totalActualPayments = paymentsData.reduce((sum, payment) => sum + payment.amount, 0);
      const collectionRate = totalExpectedPayments > 0 ? (totalActualPayments / totalExpectedPayments) * 100 : 0;

      // Calcular tasa de mora
      const overdueLoans = loansData.filter(loan => loan.status === 'overdue').length;
      const overdueRate = loansData.length > 0 ? (overdueLoans / loansData.length) * 100 : 0;

      // Calcular crecimiento (comparar con mes anterior)
      const growthDate = new Date();
      const currentMonth = growthDate.getMonth();
      const currentYear = growthDate.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

      const currentMonthPayments = paymentsData.filter(payment => {
        const paymentDate = new Date(payment.payment_date);
        return paymentDate.getMonth() === currentMonth && paymentDate.getFullYear() === currentYear;
      });

      const lastMonthPayments = paymentsData.filter(payment => {
        const paymentDate = new Date(payment.payment_date);
        return paymentDate.getMonth() === lastMonth && paymentDate.getFullYear() === lastMonthYear;
      });

      const currentMonthAmount = currentMonthPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const lastMonthAmount = lastMonthPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const growthRate = lastMonthAmount > 0 ? ((currentMonthAmount - lastMonthAmount) / lastMonthAmount) * 100 : 0;

      // Top meses con mejor rendimiento
      const monthlyPerformance = paymentsData.reduce((acc, payment) => {
        const month = new Date(payment.payment_date).toLocaleDateString('es-ES', { 
          year: 'numeric', 
          month: 'long' 
        });
        
        if (!acc[month]) {
          acc[month] = 0;
        }
        acc[month] += payment.amount;
        return acc;
      }, {} as Record<string, number>);

      const topPerformingMonths = Object.entries(monthlyPerformance)
        .map(([month, amount]) => ({ month, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      const metrics: PerformanceMetrics = {
        collectionRate,
        averageDaysToPayment: 30, // Placeholder - se puede calcular con más detalle
        overdueRate,
        growthRate,
        topPerformingMonths
      };

      setPerformanceMetrics(metrics);
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
    }
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

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg">Cargando estadísticas...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Estadísticas y Reportes</h1>
          <p className="text-gray-600 mt-1">Análisis detallado de préstamos y pagos</p>
        </div>
        <div className="flex gap-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 días</SelectItem>
              <SelectItem value="30d">30 días</SelectItem>
              <SelectItem value="90d">90 días</SelectItem>
              <SelectItem value="1y">1 año</SelectItem>
              <SelectItem value="all">Todo</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchStatistics} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Métricas Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Préstamos</p>
                <p className="text-2xl font-bold text-gray-900">{loanStats?.totalLoans || 0}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {loanStats?.activeLoans || 0} activos
                </p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Portafolio Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(loanStats?.totalAmount || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Balance: {formatCurrency(loanStats?.totalBalance || 0)}
                </p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pagos del Período</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(paymentStats?.totalAmount || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {paymentStats?.totalPayments || 0} transacciones
                </p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Receipt className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tasa de Cobro</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatPercentage(performanceMetrics?.collectionRate || 0)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {performanceMetrics?.overdueRate ? `${formatPercentage(performanceMetrics.overdueRate)} mora` : ''}
                </p>
              </div>
              <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs de Análisis */}
      <Tabs value={selectedView} onValueChange={setSelectedView} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="loans">Préstamos</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="performance">Rendimiento</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estado de Préstamos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Estado de Préstamos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span>Activos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{loanStats?.activeLoans || 0}</span>
                      <span className="text-sm text-gray-500">
                        ({loanStats?.totalLoans ? ((loanStats.activeLoans / loanStats.totalLoans) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span>Vencidos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{loanStats?.overdueLoans || 0}</span>
                      <span className="text-sm text-gray-500">
                        ({loanStats?.totalLoans ? ((loanStats.overdueLoans / loanStats.totalLoans) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span>Pagados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{loanStats?.paidLoans || 0}</span>
                      <span className="text-sm text-gray-500">
                        ({loanStats?.totalLoans ? ((loanStats.paidLoans / loanStats.totalLoans) * 100).toFixed(1) : 0}%)
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Métodos de Pago */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-5 w-5" />
                  Métodos de Pago
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paymentStats?.paymentMethods.map((method) => (
                    <div key={method.method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                        <span>{getPaymentMethodLabel(method.method)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{method.count}</span>
                        <span className="text-sm text-gray-500">
                          ({formatCurrency(method.amount)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="loans" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estadísticas de Préstamos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Estadísticas de Préstamos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monto Promedio:</span>
                    <span className="font-semibold">{formatCurrency(loanStats?.averageLoanAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tasa Promedio:</span>
                    <span className="font-semibold">{formatPercentage(loanStats?.averageInterestRate || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Interés Total:</span>
                    <span className="font-semibold">{formatCurrency(loanStats?.totalInterest || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Balance Pendiente:</span>
                    <span className="font-semibold text-red-600">{formatCurrency(loanStats?.totalBalance || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Distribución por Estado */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Distribución por Estado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span>Activos</span>
                    </div>
                    <Badge variant="default">{loanStats?.activeLoans || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span>Vencidos</span>
                    </div>
                    <Badge variant="destructive">{loanStats?.overdueLoans || 0}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <span>Pagados</span>
                    </div>
                    <Badge variant="secondary">{loanStats?.paidLoans || 0}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Estadísticas de Pagos */}
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
                    <span className="text-gray-600">Total Pagos:</span>
                    <span className="font-semibold">{paymentStats?.totalPayments || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Monto Total:</span>
                    <span className="font-semibold">{formatCurrency(paymentStats?.totalAmount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pago Promedio:</span>
                    <span className="font-semibold">{formatCurrency(paymentStats?.averagePayment || 0)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pagos por Mes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LineChart className="h-5 w-5" />
                  Pagos por Mes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {paymentStats?.monthlyPayments.slice(0, 6).map((month) => (
                    <div key={month.month} className="flex items-center justify-between">
                      <span className="text-sm">{month.month}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatCurrency(month.amount)}</span>
                        <Badge variant="outline">{month.count}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Métricas de Rendimiento */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Métricas de Rendimiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span>Tasa de Cobro</span>
                    </div>
                    <span className="font-semibold text-green-600">
                      {formatPercentage(performanceMetrics?.collectionRate || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span>Días Promedio</span>
                    </div>
                    <span className="font-semibold text-blue-600">
                      {performanceMetrics?.averageDaysToPayment || 0} días
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span>Tasa de Mora</span>
                    </div>
                    <span className="font-semibold text-red-600">
                      {formatPercentage(performanceMetrics?.overdueRate || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      {performanceMetrics?.growthRate && performanceMetrics.growthRate > 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-green-600" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-red-600" />
                      )}
                      <span>Crecimiento</span>
                    </div>
                    <span className={`font-semibold ${
                      performanceMetrics?.growthRate && performanceMetrics.growthRate > 0 
                        ? 'text-green-600' 
                        : 'text-red-600'
                    }`}>
                      {formatPercentage(performanceMetrics?.growthRate || 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Mejores Meses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Mejores Meses
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {performanceMetrics?.topPerformingMonths.map((month, index) => (
                    <div key={month.month} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <span className="text-sm">{month.month}</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(month.amount)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
