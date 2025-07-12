import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  BarChart3, 
  DollarSign, 
  Users, 
  TrendingUp, 
  Calendar,
  FileText,
  Download,
  Filter,
  Eye,
  Receipt,
  CreditCard,
  Clock,
  CheckCircle,
  AlertCircle,
  Search,
  Printer
} from 'lucide-react';

interface Payment {
  id: string;
  loan_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  reference_number: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  loans?: {
    id: string;
    amount: number;
    interest_rate: number;
    clients?: {
      full_name: string;
      dni: string;
      phone: string;
      email: string | null;
      address: string | null;
    };
  };
}

interface ReportStats {
  totalPayments: number;
  totalAmount: number;
  totalInterest: number;
  averagePayment: number;
  onTimePayments: number;
  latePayments: number;
}

export const ReportsModule = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [activeTab, setActiveTab] = useState('pagos');
  const [dateRange, setDateRange] = useState('30');
  const [paymentMethod, setPaymentMethod] = useState('all');
  const [status, setStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState<ReportStats>({
    totalPayments: 0,
    totalAmount: 0,
    totalInterest: 0,
    averagePayment: 0,
    onTimePayments: 0,
    latePayments: 0
  });
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user, dateRange]);

  useEffect(() => {
    applyFilters();
  }, [payments, paymentMethod, status, searchTerm]);

  const fetchPayments = async () => {
    try {
      setLoading(true);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          loans (
            id,
            amount,
            interest_rate,
            clients (
              full_name,
              dni,
              phone,
              email,
              address
            )
          )
        `)
        .gte('payment_date', startDate.toISOString().split('T')[0])
        .lte('payment_date', endDate.toISOString().split('T')[0])
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Error al cargar pagos');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...payments];

    if (paymentMethod !== 'all') {
      filtered = filtered.filter(p => p.payment_method === paymentMethod);
    }

    if (status !== 'all') {
      filtered = filtered.filter(p => p.status === status);
    }

    if (searchTerm) {
      filtered = filtered.filter(p => 
        p.loans?.clients?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.loans?.clients?.dni?.includes(searchTerm) ||
        p.reference_number?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredPayments(filtered);
    calculateStats(filtered);
  };

  const calculateStats = (paymentsData: Payment[]) => {
    const totalPayments = paymentsData.length;
    const totalAmount = paymentsData.reduce((sum, p) => sum + p.amount, 0);
    const totalInterest = paymentsData.reduce((sum, p) => sum + p.interest_amount, 0);
    const averagePayment = totalPayments > 0 ? totalAmount / totalPayments : 0;
    
    const onTimePayments = paymentsData.filter(p => 
      new Date(p.payment_date) <= new Date(p.due_date)
    ).length;
    const latePayments = totalPayments - onTimePayments;

    setStats({
      totalPayments,
      totalAmount,
      totalInterest,
      averagePayment,
      onTimePayments,
      latePayments
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Completado</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
      case 'failed':
        return <Badge variant="destructive">Fallido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
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

  const exportToCSV = () => {
    const headers = ['Fecha', 'Cliente', 'Monto', 'Principal', 'Interés', 'Método', 'Estado'];
    const csvData = filteredPayments.map(payment => [
      payment.payment_date,
      payment.loans?.clients?.full_name || 'N/A',
      payment.amount,
      payment.principal_amount,
      payment.interest_amount,
      getPaymentMethodLabel(payment.payment_method),
      payment.status
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-pagos-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const printPaymentReceipt = (payment: Payment) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const receiptHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Recibo de Pago - ${payment.reference_number || payment.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
            .details { margin-bottom: 20px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .total { border-top: 2px solid #333; padding-top: 10px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>RECIBO DE PAGO</h1>
            <p>Número: ${payment.reference_number || payment.id}</p>
            <p>Fecha: ${new Date(payment.payment_date).toLocaleDateString()}</p>
          </div>
          
          <div class="details">
            <h3>Información del Cliente</h3>
            <div class="row">
              <span>Nombre:</span>
              <span>${payment.loans?.clients?.full_name || 'N/A'}</span>
            </div>
            <div class="row">
              <span>Cédula:</span>
              <span>${payment.loans?.clients?.dni || 'N/A'}</span>
            </div>
            <div class="row">
              <span>Teléfono:</span>
              <span>${payment.loans?.clients?.phone || 'N/A'}</span>
            </div>
          </div>

          <div class="details">
            <h3>Detalles del Pago</h3>
            <div class="row">
              <span>Método de Pago:</span>
              <span>${getPaymentMethodLabel(payment.payment_method)}</span>
            </div>
            <div class="row">
              <span>Principal:</span>
              <span>${formatCurrency(payment.principal_amount)}</span>
            </div>
            <div class="row">
              <span>Interés:</span>
              <span>${formatCurrency(payment.interest_amount)}</span>
            </div>
            ${payment.late_fee > 0 ? `
            <div class="row">
              <span>Mora:</span>
              <span>${formatCurrency(payment.late_fee)}</span>
            </div>
            ` : ''}
            <div class="row total">
              <span>Total Pagado:</span>
              <span>${formatCurrency(payment.amount)}</span>
            </div>
          </div>

          ${payment.notes ? `
          <div class="details">
            <h3>Notas</h3>
            <p>${payment.notes}</p>
          </div>
          ` : ''}

          <div style="margin-top: 40px; text-align: center; font-size: 12px; color: #666;">
            <p>Generado el ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Reportes</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Generar Reporte
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pagos">Reporte de Pagos</TabsTrigger>
          <TabsTrigger value="prestamos">Reporte de Préstamos</TabsTrigger>
          <TabsTrigger value="clientes">Reporte de Clientes</TabsTrigger>
          <TabsTrigger value="financiero">Reporte Financiero</TabsTrigger>
        </TabsList>

        <TabsContent value="pagos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Pagos</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalPayments}</div>
                <p className="text-xs text-muted-foreground">En el período seleccionado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalAmount)}</div>
                <p className="text-xs text-muted-foreground">Promedio: {formatCurrency(stats.averagePayment)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Intereses Cobrados</CardTitle>
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{formatCurrency(stats.totalInterest)}</div>
                <p className="text-xs text-muted-foreground">Ganancias por intereses</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Puntualidad</CardTitle>
                <Clock className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{stats.onTimePayments}</div>
                <p className="text-xs text-muted-foreground">{stats.latePayments} tardíos</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="search">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="Cliente, cédula, referencia..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="dateRange">Período</Label>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Últimos 7 días</SelectItem>
                      <SelectItem value="30">Últimos 30 días</SelectItem>
                      <SelectItem value="90">Últimos 90 días</SelectItem>
                      <SelectItem value="365">Último año</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="paymentMethod">Método de Pago</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="cash">Efectivo</SelectItem>
                      <SelectItem value="bank_transfer">Transferencia</SelectItem>
                      <SelectItem value="check">Cheque</SelectItem>
                      <SelectItem value="card">Tarjeta</SelectItem>
                      <SelectItem value="online">En línea</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Estado</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="completed">Completado</SelectItem>
                      <SelectItem value="pending">Pendiente</SelectItem>
                      <SelectItem value="failed">Fallido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button variant="outline" onClick={() => {
                    setSearchTerm('');
                    setPaymentMethod('all');
                    setStatus('all');
                  }}>
                    <Filter className="h-4 w-4 mr-2" />
                    Limpiar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payments Table */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Pagos ({filteredPayments.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando pagos...</div>
              ) : filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No se encontraron pagos con los filtros aplicados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPayments.map((payment) => (
                    <div key={payment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Receipt className="h-5 w-5 text-blue-500" />
                            <h3 className="font-semibold text-lg">
                              {payment.loans?.clients?.full_name || 'Cliente no especificado'}
                            </h3>
                            {getStatusBadge(payment.status)}
                            {new Date(payment.payment_date) > new Date(payment.due_date) && (
                              <Badge variant="destructive" className="text-xs">Tardío</Badge>
                            )}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Fecha:</span> {new Date(payment.payment_date).toLocaleDateString()}
                            </div>
                            <div>
                              <span className="font-medium">Monto:</span> {formatCurrency(payment.amount)}
                            </div>
                            <div>
                              <span className="font-medium">Método:</span> {getPaymentMethodLabel(payment.payment_method)}
                            </div>
                            <div>
                              <span className="font-medium">Referencia:</span> {payment.reference_number || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Principal:</span> {formatCurrency(payment.principal_amount)}
                            </div>
                            <div>
                              <span className="font-medium">Interés:</span> {formatCurrency(payment.interest_amount)}
                            </div>
                            {payment.late_fee > 0 && (
                              <div>
                                <span className="font-medium">Mora:</span> {formatCurrency(payment.late_fee)}
                              </div>
                            )}
                            <div>
                              <span className="font-medium">Cédula:</span> {payment.loans?.clients?.dni || 'N/A'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedPayment(payment)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Detalle
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => printPaymentReceipt(payment)}>
                            <Printer className="h-4 w-4 mr-1" />
                            Imprimir
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prestamos">
          <Card>
            <CardContent className="text-center py-8">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Reporte de Préstamos</h3>
              <p className="text-gray-600">Análisis detallado de la cartera de préstamos</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="clientes">
          <Card>
            <CardContent className="text-center py-8">
              <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Reporte de Clientes</h3>
              <p className="text-gray-600">Estadísticas y análisis de clientes</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financiero">
          <Card>
            <CardContent className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Reporte Financiero</h3>
              <p className="text-gray-600">Análisis financiero y rentabilidad</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Detail Dialog */}
      {selectedPayment && (
        <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalle del Pago - Factura</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              {/* Header */}
              <div className="border-b pb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold">RECIBO DE PAGO</h2>
                    <p className="text-gray-600">#{selectedPayment.reference_number || selectedPayment.id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Fecha de Pago</p>
                    <p className="font-semibold">{new Date(selectedPayment.payment_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Client Info */}
              <div>
                <h3 className="font-semibold mb-3">Información del Cliente</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Nombre:</span>
                    <p className="font-medium">{selectedPayment.loans?.clients?.full_name || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Cédula:</span>
                    <p className="font-medium">{selectedPayment.loans?.clients?.dni || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Teléfono:</span>
                    <p className="font-medium">{selectedPayment.loans?.clients?.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-gray-600">Email:</span>
                    <p className="font-medium">{selectedPayment.loans?.clients?.email || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div>
                <h3 className="font-semibold mb-3">Detalles del Pago</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Principal:</span>
                    <span className="font-medium">{formatCurrency(selectedPayment.principal_amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Interés:</span>
                    <span className="font-medium">{formatCurrency(selectedPayment.interest_amount)}</span>
                  </div>
                  {selectedPayment.late_fee > 0 && (
                    <div className="flex justify-between">
                      <span>Mora:</span>
                      <span className="font-medium text-red-600">{formatCurrency(selectedPayment.late_fee)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between text-lg font-bold">
                    <span>Total Pagado:</span>
                    <span>{formatCurrency(selectedPayment.amount)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <h3 className="font-semibold mb-3">Método de Pago</h3>
                <p className="text-sm">{getPaymentMethodLabel(selectedPayment.payment_method)}</p>
                {selectedPayment.reference_number && (
                  <p className="text-sm text-gray-600">Referencia: {selectedPayment.reference_number}</p>
                )}
              </div>

              {/* Notes */}
              {selectedPayment.notes && (
                <div>
                  <h3 className="font-semibold mb-3">Notas</h3>
                  <p className="text-sm text-gray-600">{selectedPayment.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => printPaymentReceipt(selectedPayment)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir Recibo
                </Button>
                <Button onClick={() => setSelectedPayment(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};