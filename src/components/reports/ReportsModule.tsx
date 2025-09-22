import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { StatisticsModule } from './StatisticsModule';
import { PaymentActions } from '../loans/PaymentActions';
import { 
  BarChart3, 
  Download, 
  Calendar, 
  Users,
  CreditCard,
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Filter,
  Search,
  Eye,
  Printer,
  Mail,
  Receipt,
  X,
  PieChart,
  LineChart,
  Activity
} from 'lucide-react';

interface ReportData {
  clients: any[];
  loans: any[];
  payments: any[];
  expenses: any[];
}

export const ReportsModule = () => {
  const [activeTab, setActiveTab] = useState('estadisticas');
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportData>({
    clients: [],
    loans: [],
    payments: [],
    expenses: []
  });
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const { user, companyId } = useAuth();

  useEffect(() => {
    if (user && companyId) {
      fetchReportData();
    }
  }, [user, companyId, dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      
      // Fetch clients (filtrados por empresa)
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (clientsError) throw clientsError;

      // Fetch loans (filtrados por empresa a través de clients)
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          clients!inner (
            full_name,
            dni,
            phone,
            company_id
          )
        `)
        .eq('clients.company_id', companyId)
        .gte('created_at', dateRange.startDate)
        .lte('created_at', dateRange.endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      // Fetch payments
      console.log('🔄 FETCH PAYMENTS: Iniciando consulta...');
      console.log('🔄 FETCH PAYMENTS: companyId:', companyId);
      console.log('🔄 FETCH PAYMENTS: dateRange:', dateRange);
      
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          loans!inner (
            amount,
            clients!inner (
              full_name,
              dni,
              company_id
            )
          )
        `)
        .eq('loans.clients.company_id', companyId)
        .gte('payment_date', dateRange.startDate)
        .lte('payment_date', dateRange.endDate)
        .order('payment_date', { ascending: false });

      if (paymentsError) {
        console.error('🔄 FETCH PAYMENTS: Error:', paymentsError);
        throw paymentsError;
      }

      console.log('🔄 FETCH PAYMENTS: Pagos encontrados:', paymentsData?.length);
      console.log('🔄 FETCH PAYMENTS: IDs de pagos:', paymentsData?.map(p => p.id));

      // Fetch expenses (filtrados por empresa)
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', companyId)
        .gte('expense_date', dateRange.startDate)
        .lte('expense_date', dateRange.endDate)
        .order('expense_date', { ascending: false });

      if (expensesError) throw expensesError;

      setReportData({
        clients: clientsData || [],
        loans: loansData || [],
        payments: paymentsData || [],
        expenses: expensesData || []
      });

    } catch (error) {
      console.error('Error fetching report data:', error);
      toast.error('Error al cargar datos de reportes');
    } finally {
      setLoading(false);
    }
  };

  // Función específica para refrescar pagos después de eliminar
  const refreshPayments = async () => {
    try {
      console.log('🔄 REFRESH PAYMENTS: Iniciando...');
      console.log('🔄 REFRESH PAYMENTS: companyId:', companyId);
      console.log('🔄 REFRESH PAYMENTS: dateRange:', dateRange);
      
      // Fetch payments con el mismo filtro de fecha
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          *,
          loans (
            amount,
            clients (
              full_name,
              dni
            )
          )
        `)
        .eq('created_by', companyId)
        .gte('payment_date', dateRange.startDate)
        .lte('payment_date', dateRange.endDate)
        .order('payment_date', { ascending: false });

      if (paymentsError) {
        console.error('🔄 REFRESH PAYMENTS: Error:', paymentsError);
        throw paymentsError;
      }

      console.log('🔄 REFRESH PAYMENTS: Pagos obtenidos:', paymentsData?.length || 0);
      console.log('🔄 REFRESH PAYMENTS: Datos de pagos:', paymentsData);
      
      // Actualizar solo los pagos en el estado
      setReportData(prev => {
        console.log('🔄 REFRESH PAYMENTS: Estado anterior:', prev.payments?.length || 0);
        const newState = {
          ...prev,
          payments: paymentsData || []
        };
        console.log('🔄 REFRESH PAYMENTS: Nuevo estado:', newState.payments?.length || 0);
        return newState;
      });
      
      console.log('🔄 REFRESH PAYMENTS: Completado exitosamente');
      
    } catch (error) {
      console.error('🔄 REFRESH PAYMENTS: Error completo:', error);
      console.log('🔄 REFRESH PAYMENTS: Ejecutando fetchReportData como fallback...');
      // Si falla el refresh específico, hacer un refresh completo
      fetchReportData();
    }
  };

  // Función simple para forzar refresh completo
  const forceRefresh = () => {
    console.log('🔄 FORCE REFRESH: Ejecutando refresh completo...');
    fetchReportData();
  };

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    const headers = Object.keys(data[0]).join(',');
    const csvContent = [
      headers,
      ...data.map(row => Object.values(row).map(value => 
        typeof value === 'string' && value.includes(',') ? `"${value}"` : value
      ).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast.success('Reporte exportado exitosamente');
  };

  // Cálculos para estadísticas
  const totalLoans = reportData.loans.length;
  const totalLoanAmount = reportData.loans.reduce((sum, loan) => sum + (loan.amount || 0), 0);
  const totalPayments = reportData.payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
  const totalInterest = reportData.payments.reduce((sum, payment) => sum + (payment.interest_amount || 0), 0);
  const totalExpenses = reportData.expenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const netProfit = totalInterest - totalExpenses;

  const activeLoans = reportData.loans.filter(loan => loan.status === 'active').length;
  const overdueLoans = reportData.loans.filter(loan => loan.status === 'overdue').length;
  const paidLoans = reportData.loans.filter(loan => loan.status === 'paid').length;
  const pendingLoans = reportData.loans.filter(loan => loan.status === 'pending').length;

  // Cálculos adicionales
  const totalClients = reportData.clients.length;
  const averageLoanAmount = totalLoans > 0 ? totalLoanAmount / totalLoans : 0;
  const averagePaymentAmount = reportData.payments.length > 0 ? totalPayments / reportData.payments.length : 0;
  const approvalRate = totalLoans > 0 ? (activeLoans / totalLoans) * 100 : 0;
  const defaultRate = totalLoans > 0 ? (overdueLoans / totalLoans) * 100 : 0;

  // Filtros para pagos
  const filteredPayments = reportData.payments.filter(payment => {
    const matchesSearch = payment.loans?.clients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         payment.amount.toString().includes(searchTerm) ||
                         payment.payment_date.includes(searchTerm);
    
    const matchesFilter = paymentFilter === 'all' ||
                         (paymentFilter === 'with_fees' && payment.late_fee && payment.late_fee > 0) ||
                         (paymentFilter === 'without_fees' && (!payment.late_fee || payment.late_fee === 0)) ||
                         (paymentFilter === 'high_amount' && payment.amount > 5000);
    
    return matchesSearch && matchesFilter;
  });

  // Filtros para clientes
  const filteredClients = reportData.clients.filter(client => {
    return client.full_name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
           client.dni.includes(clientSearchTerm) ||
           (client.phone && client.phone.includes(clientSearchTerm));
  });

  // Función para mostrar detalle de factura
  const showInvoiceDetails = (payment: any) => {
    setSelectedPayment(payment);
    setShowInvoiceModal(true);
  };

  // Función para imprimir factura
  const printInvoice = (payment: any) => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Factura de Pago</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .info { display: flex; justify-content: space-between; margin-bottom: 20px; }
              .details { width: 100%; border-collapse: collapse; }
              .details th, .details td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              .details th { background-color: #f2f2f2; }
              .total { font-weight: bold; font-size: 18px; margin-top: 20px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Factura de Pago</h1>
              <p>Fecha: ${new Date(payment.payment_date).toLocaleDateString()}</p>
            </div>
            <div class="info">
              <div>
                <strong>Cliente:</strong> ${payment.loans?.clients?.full_name || 'N/A'}<br>
                <strong>Cédula:</strong> ${payment.loans?.clients?.dni || 'N/A'}
              </div>
              <div>
                <strong>Recibo #:</strong> ${payment.id}<br>
                <strong>Método:</strong> ${payment.payment_method || 'Efectivo'}
              </div>
            </div>
            <table class="details">
              <tr><th>Concepto</th><th>Monto</th></tr>
              <tr><td>Pago Principal</td><td>$${payment.principal_amount.toLocaleString()}</td></tr>
              <tr><td>Intereses</td><td>$${payment.interest_amount.toLocaleString()}</td></tr>
              ${payment.late_fee > 0 ? `<tr><td>Mora</td><td>$${payment.late_fee.toLocaleString()}</td></tr>` : ''}
            </table>
            <div class="total">
              Total Pagado: $${payment.amount.toLocaleString()}
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reportes y Análisis</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline" className="w-full sm:w-auto">
            <Mail className="h-4 w-4 mr-2" />
            Enviar por Email
          </Button>
        </div>
      </div>

      {/* Filtros de Fecha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Filtros de Fecha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="startDate" className="text-sm">Fecha Inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="endDate" className="text-sm">Fecha Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                className="text-sm"
              />
            </div>
            <Button onClick={fetchReportData} className="w-full sm:w-auto text-sm">
              <Search className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
              <span className="sm:hidden">Actualizar</span>
              <span className="hidden sm:inline">Actualizar</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen Ejecutivo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Totales</CardTitle>
            <CreditCard className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-blue-600">{totalLoans}</div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              ${totalLoanAmount.toLocaleString()} prestados
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Promedio: ${Math.round(averageLoanAmount).toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Recibidos</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-green-600">${totalPayments.toLocaleString()}</div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              ${totalInterest.toLocaleString()} en intereses
            </p>
            <div className="mt-2 text-xs text-gray-500">
              {reportData.payments.length} pagos registrados
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-bold text-red-600">${totalExpenses.toLocaleString()}</div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Gastos operativos
            </p>
            <div className="mt-2 text-xs text-gray-500">
              {reportData.expenses.length} gastos registrados
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia Neta</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl sm:text-3xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProfit.toLocaleString()}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Intereses - Gastos
            </p>
            <div className="mt-2 text-xs text-gray-500">
              Margen: {totalInterest > 0 ? Math.round((netProfit / totalInterest) * 100) : 0}%
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1 h-auto">
          <TabsTrigger 
            value="estadisticas" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden xs:inline">Estadísticas</span>
            <span className="xs:hidden">Stats</span>
          </TabsTrigger>
          <TabsTrigger 
            value="prestamos" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <CreditCard className="h-4 w-4" />
            <span className="hidden xs:inline">Préstamos</span>
            <span className="xs:hidden">Loans</span>
          </TabsTrigger>
          <TabsTrigger 
            value="pagos" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <DollarSign className="h-4 w-4" />
            <span className="hidden xs:inline">Pagos</span>
            <span className="xs:hidden">Pagos</span>
          </TabsTrigger>
          <TabsTrigger 
            value="clientes" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Users className="h-4 w-4" />
            <span className="hidden xs:inline">Clientes</span>
            <span className="xs:hidden">Clientes</span>
          </TabsTrigger>
          <TabsTrigger 
            value="financiero" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <TrendingUp className="h-4 w-4" />
            <span className="hidden xs:inline">Financiero</span>
            <span className="xs:hidden">Fin</span>
          </TabsTrigger>
          <TabsTrigger 
            value="operativo" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden xs:inline">Operativo</span>
            <span className="xs:hidden">Ops</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estadisticas" className="space-y-6">
          <StatisticsModule />
        </TabsContent>

        <TabsContent value="prestamos" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Préstamos</CardTitle>
                <Button onClick={() => exportToCSV(reportData.loans, 'reporte_prestamos')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Estadísticas de Préstamos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
                <div className="text-center p-3 sm:p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="text-xl sm:text-2xl font-bold text-green-600">{activeLoans}</div>
                  <div className="text-xs sm:text-sm text-gray-600">Activos</div>
                  <div className="text-xs text-green-500 mt-1">
                    {approvalRate.toFixed(1)}% del total
                  </div>
                </div>
                <div className="text-center p-3 sm:p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="text-xl sm:text-2xl font-bold text-red-600">{overdueLoans}</div>
                  <div className="text-xs sm:text-sm text-gray-600">Vencidos</div>
                  <div className="text-xs text-red-500 mt-1">
                    {defaultRate.toFixed(1)}% del total
                  </div>
                </div>
                <div className="text-center p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xl sm:text-2xl font-bold text-blue-600">{paidLoans}</div>
                  <div className="text-xs sm:text-sm text-gray-600">Pagados</div>
                  <div className="text-xs text-blue-500 mt-1">
                    {totalLoans > 0 ? Math.round((paidLoans / totalLoans) * 100) : 0}% del total
                  </div>
                </div>
                <div className="text-center p-3 sm:p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="text-xl sm:text-2xl font-bold text-yellow-600">{pendingLoans}</div>
                  <div className="text-xs sm:text-sm text-gray-600">Pendientes</div>
                  <div className="text-xs text-yellow-500 mt-1">
                    {totalLoans > 0 ? Math.round((pendingLoans / totalLoans) * 100) : 0}% del total
                  </div>
                </div>
              </div>

              {/* Lista de Préstamos */}
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">Cargando datos...</div>
                ) : reportData.loans.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay préstamos en el período seleccionado</p>
                  </div>
                ) : (
                  reportData.loans.map((loan) => (
                    <div key={loan.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{loan.clients?.full_name}</h3>
                            <Badge variant={
                              loan.status === 'active' ? 'default' :
                              loan.status === 'overdue' ? 'destructive' :
                              loan.status === 'paid' ? 'secondary' : 'outline'
                            }>
                              {loan.status === 'active' ? 'Activo' :
                               loan.status === 'overdue' ? 'Vencido' :
                               loan.status === 'paid' ? 'Pagado' : loan.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600">
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Monto:</span> 
                              <span className="text-xs sm:text-sm">${loan.amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Balance:</span> 
                              <span className="text-xs sm:text-sm">${loan.remaining_balance.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cuota:</span> 
                              <span className="text-xs sm:text-sm">${loan.monthly_payment.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Tasa:</span> 
                              <span className="text-xs sm:text-sm">{loan.interest_rate}%</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pagos" className="space-y-6">
          {/* Filtros de búsqueda para pagos */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por cliente, monto o fecha..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="text-sm"
                  />
                </div>
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-full sm:w-48 text-sm">
                    <SelectValue placeholder="Filtrar por tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los pagos</SelectItem>
                    <SelectItem value="with_fees">Con mora</SelectItem>
                    <SelectItem value="without_fees">Sin mora</SelectItem>
                    <SelectItem value="high_amount">Monto alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Pagos ({filteredPayments.length})</CardTitle>
                <div className="flex gap-2">
                  <Button onClick={forceRefresh} variant="outline" size="sm">
                    🔄 Refresh
                  </Button>
                  <Button onClick={() => exportToCSV(reportData.payments, 'reporte_pagos')}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">Cargando datos...</div>
                ) : filteredPayments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay pagos que coincidan con los filtros</p>
                  </div>
                ) : (
                  filteredPayments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-medium">{payment.loans?.clients?.full_name}</h3>
                            <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                              {payment.status === 'completed' ? 'Completado' : 'Pendiente'}
                            </Badge>
                            {payment.late_fee > 0 && (
                              <Badge variant="destructive">Con Mora</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600">
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Monto:</span> 
                              <span className="text-xs sm:text-sm">${payment.amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Principal:</span> 
                              <span className="text-xs sm:text-sm">${payment.principal_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Interés:</span> 
                              <span className="text-xs sm:text-sm">${payment.interest_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Fecha:</span> 
                              <span className="text-xs sm:text-sm">{new Date(payment.payment_date).toLocaleDateString()}</span>
                            </div>
                          </div>
                          {payment.late_fee > 0 && (
                            <div className="text-sm text-red-600">
                              <strong>Mora:</strong> ${payment.late_fee.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-2 sm:mt-0 sm:ml-4">
                          <PaymentActions 
                            payment={payment} 
                            onPaymentUpdated={forceRefresh}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          {/* Filtros de búsqueda para clientes */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar por nombre, cédula o teléfono..."
                    value={clientSearchTerm}
                    onChange={(e) => setClientSearchTerm(e.target.value)}
                    className="text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Clientes ({filteredClients.length})</CardTitle>
                <Button onClick={() => exportToCSV(filteredClients, 'reporte_clientes')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Estadísticas de Clientes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{filteredClients.length}</div>
                  <div className="text-sm text-gray-600">Total Clientes</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {filteredClients.filter(c => c.status === 'active').length}
                  </div>
                  <div className="text-sm text-gray-600">Clientes Activos</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    ${filteredClients.reduce((sum, c) => sum + (c.monthly_income || 0), 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Ingresos Totales</div>
                </div>
              </div>

              <div className="space-y-4">
                {filteredClients.map((client) => (
                  <div key={client.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium">{client.full_name}</h3>
                          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                            {client.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600">
                          <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-xs sm:text-sm">Cédula:</span> 
                            <span className="text-xs sm:text-sm">{client.dni}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-xs sm:text-sm">Teléfono:</span> 
                            <span className="text-xs sm:text-sm">{client.phone}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-xs sm:text-sm">Ciudad:</span> 
                            <span className="text-xs sm:text-sm">{client.city || 'N/A'}</span>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center">
                            <span className="font-medium text-xs sm:text-sm">Ingresos:</span> 
                            <span className="text-xs sm:text-sm">${(client.monthly_income || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto text-xs">
                        <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                        <span className="sm:hidden">Ver</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financiero" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Reporte Financiero</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-green-600 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Ingresos
                  </h3>
                  <div className="space-y-3 bg-green-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Intereses cobrados:</span>
                      <span className="font-semibold text-green-600 text-sm sm:text-base">
                        ${totalInterest.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Pagos recibidos:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        ${totalPayments.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Moras cobradas:</span>
                      <span className="font-semibold text-orange-600 text-sm sm:text-base">
                        ${reportData.payments.reduce((sum, p) => sum + (p.late_fee || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm sm:text-base font-semibold">Total Ingresos:</span>
                        <span className="font-bold text-green-600 text-sm sm:text-base">
                          ${(totalInterest + reportData.payments.reduce((sum, p) => sum + (p.late_fee || 0), 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-red-600 flex items-center gap-2">
                    <TrendingDown className="h-5 w-5" />
                    Egresos
                  </h3>
                  <div className="space-y-3 bg-red-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Gastos operativos:</span>
                      <span className="font-semibold text-red-600 text-sm sm:text-base">
                        ${totalExpenses.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Capital prestado:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        ${totalLoanAmount.toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm sm:text-base font-semibold">Total Egresos:</span>
                        <span className="font-bold text-red-600 text-sm sm:text-base">
                          ${(totalExpenses + totalLoanAmount).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t">
                <div className="flex justify-between text-lg font-bold">
                  <span>Ganancia Neta:</span>
                  <span className={netProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                    ${netProfit.toLocaleString()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operativo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Reporte Operativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-blue-600 flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Métricas de Préstamos
                  </h3>
                  <div className="space-y-3 bg-blue-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Tasa de aprobación:</span>
                      <span className="font-semibold text-green-600 text-sm sm:text-base">
                        {approvalRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Tasa de morosidad:</span>
                      <span className="font-semibold text-red-600 text-sm sm:text-base">
                        {defaultRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Préstamo promedio:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        ${Math.round(averageLoanAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Total clientes:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        {totalClients}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base sm:text-lg font-semibold text-purple-600 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Métricas de Cobranza
                  </h3>
                  <div className="space-y-3 bg-purple-50 p-4 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Pagos puntuales:</span>
                      <span className="font-semibold text-green-600 text-sm sm:text-base">
                        {reportData.payments.filter(p => !p.late_fee || p.late_fee === 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Pagos con mora:</span>
                      <span className="font-semibold text-red-600 text-sm sm:text-base">
                        {reportData.payments.filter(p => p.late_fee && p.late_fee > 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Pago promedio:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        ${Math.round(averagePaymentAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm sm:text-base">Eficiencia cobranza:</span>
                      <span className="font-semibold text-sm sm:text-base">
                        {reportData.payments.length > 0 ? 
                          Math.round((reportData.payments.filter(p => !p.late_fee || p.late_fee === 0).length / reportData.payments.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal de detalle de factura */}
      <Dialog open={showInvoiceModal} onOpenChange={setShowInvoiceModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Detalle de Factura
            </DialogTitle>
          </DialogHeader>
          {selectedPayment && (
            <div className="space-y-6">
              {/* Información del cliente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold mb-2">Información del Cliente</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Nombre:</strong> {selectedPayment.loans?.clients?.full_name}</p>
                    <p><strong>Cédula:</strong> {selectedPayment.loans?.clients?.dni}</p>
                    <p><strong>Fecha:</strong> {new Date(selectedPayment.payment_date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Información del Pago</h4>
                  <div className="space-y-1 text-sm">
                    <p><strong>Recibo #:</strong> {selectedPayment.id}</p>
                    <p><strong>Método:</strong> {selectedPayment.payment_method || 'Efectivo'}</p>
                    <p><strong>Estado:</strong> <Badge variant="default">Pagado</Badge></p>
                  </div>
                </div>
              </div>

              {/* Desglose del pago */}
              <div>
                <h4 className="font-semibold mb-3">Desglose del Pago</h4>
                <div className="border rounded-lg">
                  <div className="grid grid-cols-2 gap-4 p-3 border-b">
                    <span>Pago Principal:</span>
                    <span className="font-medium">${selectedPayment.principal_amount.toLocaleString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 p-3 border-b">
                    <span>Intereses:</span>
                    <span className="font-medium">${selectedPayment.interest_amount.toLocaleString()}</span>
                  </div>
                  {selectedPayment.late_fee > 0 && (
                    <div className="grid grid-cols-2 gap-4 p-3 border-b">
                      <span>Mora:</span>
                      <span className="font-medium text-red-600">${selectedPayment.late_fee.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 font-bold">
                    <span>Total:</span>
                    <span>${selectedPayment.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowInvoiceModal(false)}>
                  Cerrar
                </Button>
                <Button onClick={() => printInvoice(selectedPayment)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Factura
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
