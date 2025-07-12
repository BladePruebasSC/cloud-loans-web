import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
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
  Mail
} from 'lucide-react';

interface ReportData {
  clients: any[];
  loans: any[];
  payments: any[];
  expenses: any[];
}

export const ReportsModule = () => {
  const [activeTab, setActiveTab] = useState('prestamos');
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
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchReportData();
    }
  }, [user, dateRange]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      
      // Fetch clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientsError) throw clientsError;

      // Fetch loans
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select(`
          *,
          clients (
            full_name,
            dni,
            phone
          )
        `)
        .gte('created_at', dateRange.startDate)
        .lte('created_at', dateRange.endDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (loansError) throw loansError;

      // Fetch payments
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
        .gte('payment_date', dateRange.startDate)
        .lte('payment_date', dateRange.endDate)
        .order('payment_date', { ascending: false });

      if (paymentsError) throw paymentsError;

      // Fetch expenses
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('*')
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
  const totalLoanAmount = reportData.loans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalPayments = reportData.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const totalInterest = reportData.payments.reduce((sum, payment) => sum + payment.interest_amount, 0);
  const totalExpenses = reportData.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const netProfit = totalInterest - totalExpenses;

  const activeLoans = reportData.loans.filter(loan => loan.status === 'active').length;
  const overdueLoans = reportData.loans.filter(loan => loan.status === 'overdue').length;
  const paidLoans = reportData.loans.filter(loan => loan.status === 'paid').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reportes y Análisis</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline">
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
          <div className="flex gap-4 items-end">
            <div>
              <Label htmlFor="startDate">Fecha Inicio</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="endDate">Fecha Fin</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <Button onClick={fetchReportData}>
              <Search className="h-4 w-4 mr-2" />
              Actualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumen Ejecutivo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Totales</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLoans}</div>
            <p className="text-xs text-muted-foreground">
              ${totalLoanAmount.toLocaleString()} prestados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagos Recibidos</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalPayments.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              ${totalInterest.toLocaleString()} en intereses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Gastos operativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia Neta</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ${netProfit.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Intereses - Gastos
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="prestamos">Préstamos</TabsTrigger>
          <TabsTrigger value="pagos">Pagos</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="financiero">Financiero</TabsTrigger>
          <TabsTrigger value="operativo">Operativo</TabsTrigger>
        </TabsList>

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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{activeLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Activos</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{overdueLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Vencidos</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{paidLoans}</div>
                  <div className="text-sm text-gray-600">Préstamos Pagados</div>
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
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>Monto: ${loan.amount.toLocaleString()}</div>
                            <div>Balance: ${loan.remaining_balance.toLocaleString()}</div>
                            <div>Cuota: ${loan.monthly_payment.toLocaleString()}</div>
                            <div>Tasa: {loan.interest_rate}%</div>
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Pagos</CardTitle>
                <Button onClick={() => exportToCSV(reportData.payments, 'reporte_pagos')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">Cargando datos...</div>
                ) : reportData.payments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay pagos en el período seleccionado</p>
                  </div>
                ) : (
                  reportData.payments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <h3 className="font-medium">{payment.loans?.clients?.full_name}</h3>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>Monto: ${payment.amount.toLocaleString()}</div>
                            <div>Principal: ${payment.principal_amount.toLocaleString()}</div>
                            <div>Interés: ${payment.interest_amount.toLocaleString()}</div>
                            <div>Fecha: {new Date(payment.payment_date).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <Badge variant="default">Pagado</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Reporte de Clientes</CardTitle>
                <Button onClick={() => exportToCSV(reportData.clients, 'reporte_clientes')}>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Estadísticas de Clientes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{reportData.clients.length}</div>
                  <div className="text-sm text-gray-600">Total Clientes</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {reportData.clients.filter(c => c.status === 'active').length}
                  </div>
                  <div className="text-sm text-gray-600">Clientes Activos</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    ${reportData.clients.reduce((sum, c) => sum + (c.monthly_income || 0), 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Ingresos Totales</div>
                </div>
              </div>

              <div className="space-y-4">
                {reportData.clients.map((client) => (
                  <div key={client.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="font-medium">{client.full_name}</h3>
                          <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                            {client.status === 'active' ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div>Cédula: {client.dni}</div>
                          <div>Teléfono: {client.phone}</div>
                          <div>Ciudad: {client.city || 'N/A'}</div>
                          <div>Ingresos: ${(client.monthly_income || 0).toLocaleString()}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        <Eye className="h-4 w-4" />
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
              <CardTitle>Reporte Financiero</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Ingresos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Intereses cobrados:</span>
                      <span className="font-semibold text-green-600">${totalInterest.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagos recibidos:</span>
                      <span className="font-semibold">${totalPayments.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Moras cobradas:</span>
                      <span className="font-semibold">
                        ${reportData.payments.reduce((sum, p) => sum + (p.late_fee || 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Egresos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Gastos operativos:</span>
                      <span className="font-semibold text-red-600">${totalExpenses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Capital prestado:</span>
                      <span className="font-semibold">${totalLoanAmount.toLocaleString()}</span>
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
              <CardTitle>Reporte Operativo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Métricas de Préstamos</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Tasa de aprobación:</span>
                      <span className="font-semibold">
                        {totalLoans > 0 ? Math.round((activeLoans / totalLoans) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tasa de morosidad:</span>
                      <span className="font-semibold text-red-600">
                        {totalLoans > 0 ? Math.round((overdueLoans / totalLoans) * 100) : 0}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Préstamo promedio:</span>
                      <span className="font-semibold">
                        ${totalLoans > 0 ? Math.round(totalLoanAmount / totalLoans).toLocaleString() : 0}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Métricas de Cobranza</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span>Pagos puntuales:</span>
                      <span className="font-semibold text-green-600">
                        {reportData.payments.filter(p => !p.late_fee || p.late_fee === 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pagos con mora:</span>
                      <span className="font-semibold text-red-600">
                        {reportData.payments.filter(p => p.late_fee && p.late_fee > 0).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pago promedio:</span>
                      <span className="font-semibold">
                        ${reportData.payments.length > 0 ? Math.round(totalPayments / reportData.payments.length).toLocaleString() : 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};