import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLateFee } from '@/hooks/useLateFee';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { toast } from 'sonner';
import { 
  FileText, 
  Download, 
  Calendar, 
  DollarSign, 
  TrendingUp, 
  AlertTriangle,
  BarChart3,
  PieChart,
  Table,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Printer
} from 'lucide-react';
import { LateFeeCharts } from './LateFeeCharts';

interface LateFeeReport {
  loan_id: string;
  client_name: string;
  client_dni: string;
  loan_amount: number;
  remaining_balance: number;
  current_late_fee: number;
  late_fee_rate: number;
  grace_period_days: number;
  days_overdue: number;
  next_payment_date: string;
  last_payment_date: string;
  late_fee_enabled: boolean;
  late_fee_calculation_type: string;
  total_late_fee_paid: number;
  late_fee_history_count: number;
}

interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  status: 'all' | 'active' | 'overdue' | 'paid';
  amountRange: 'all' | 'low' | 'medium' | 'high';
  lateFeeRange: 'all' | 'low' | 'medium' | 'high';
  calculationType: 'all' | 'daily' | 'monthly' | 'compound';
}

export const LateFeeReports: React.FC = () => {
  const [reports, setReports] = useState<LateFeeReport[]>([]);
  const [filteredReports, setFilteredReports] = useState<LateFeeReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReportFilters>({
    dateFrom: '2025-01-01', // Cambiar a fecha anterior para incluir préstamos de mayo
    dateTo: new Date().toISOString().split('T')[0],
    status: 'all',
    amountRange: 'all',
    lateFeeRange: 'all',
    calculationType: 'all'
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReport, setSelectedReport] = useState<LateFeeReport | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const { companyId } = useAuth();
  const { calculateLateFee } = useLateFee();

  // Cargar reportes
  useEffect(() => {
    loadReports();
  }, []);

  // Aplicar filtros
  useEffect(() => {
    applyFilters();
  }, [reports, filters, searchTerm]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          current_late_fee,
          late_fee_rate,
          grace_period_days,
          next_payment_date,
          late_fee_enabled,
          late_fee_calculation_type,
          total_late_fee_paid,
          loan_officer_id,
          term_months,
          payment_frequency,
          monthly_payment,
          interest_rate,
          start_date,
          clients!inner(
            full_name,
            dni,
            company_id
          ),
          late_fee_history(count)
        `)
        .eq('loan_officer_id', companyId) // Cambiar a filtrar por loan_officer_id
        .in('status', ['active', 'overdue']);

      if (error) throw error;

      console.log('🔍 LateFeeReports: Datos cargados:', data?.length || 0, 'préstamos');
      console.log('🔍 LateFeeReports: Todos los préstamos:', data);
      console.log('🔍 LateFeeReports: CompanyId:', companyId);
      console.log('🔍 LateFeeReports: Estados de préstamos:', data?.map(l => ({ id: l.id, next_payment_date: l.next_payment_date })));

      const reportData: LateFeeReport[] = await Promise.all((data || []).map(async (loan) => {
        const today = new Date();
        const nextPayment = new Date(loan.next_payment_date);
        const daysOverdue = Math.max(0, Math.floor((today.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24)) - (loan.grace_period_days || 0));

        // Calcular la mora correctamente usando el mismo método que LateFeeInfo
        let calculatedLateFee = 0;
        if (loan.late_fee_enabled && daysOverdue > 0) {
          try {
            // Usar la misma función que LateFeeInfo.tsx
            const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, {
              id: loan.id,
              amount: loan.amount,
              remaining_balance: loan.remaining_balance,
              next_payment_date: loan.next_payment_date,
              late_fee_enabled: loan.late_fee_enabled,
              late_fee_rate: loan.late_fee_rate,
              grace_period_days: loan.grace_period_days,
              late_fee_calculation_type: loan.late_fee_calculation_type,
              term: loan.term_months || 4,
              payment_frequency: loan.payment_frequency || 'monthly',
              monthly_payment: loan.monthly_payment || 0,
              interest_rate: loan.interest_rate || 0,
              start_date: loan.start_date || new Date().toISOString().split('T')[0]
            });
            calculatedLateFee = breakdown.totalLateFee || 0;
            console.log(`🔍 LateFeeReports: Préstamo ${loan.id} - Mora calculada: ${calculatedLateFee}, Mora BD: ${loan.current_late_fee}`);
          } catch (error) {
            console.error('Error calculando mora para préstamo:', loan.id, error);
            calculatedLateFee = loan.current_late_fee || 0; // Fallback al valor de la base de datos
          }
        } else {
          // Si no hay mora habilitada o no hay días de atraso, usar 0
          calculatedLateFee = 0;
        }

        return {
          loan_id: loan.id,
          client_name: (loan.clients as any).full_name,
          client_dni: (loan.clients as any).dni,
          loan_amount: loan.amount,
          remaining_balance: loan.remaining_balance,
          current_late_fee: calculatedLateFee,
          late_fee_rate: loan.late_fee_rate || 0,
          grace_period_days: loan.grace_period_days || 0,
          days_overdue: daysOverdue,
          next_payment_date: loan.next_payment_date,
          last_payment_date: null, // Se calculará desde la tabla payments si es necesario
          late_fee_enabled: loan.late_fee_enabled,
          late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
          total_late_fee_paid: loan.total_late_fee_paid || 0,
          late_fee_history_count: loan.late_fee_history?.[0]?.count || 0
        };
      }));

      console.log('🔍 LateFeeReports: Datos procesados:', reportData);
      console.log('🔍 LateFeeReports: Total mora calculado:', reportData.reduce((sum, r) => sum + r.current_late_fee, 0));
      setReports(reportData);
    } catch (error) {
      console.error('Error loading late fee reports:', error);
      toast.error('Error al cargar los reportes de mora');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...reports];

    // Filtro por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(report => 
        report.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.client_dni.includes(searchTerm)
      );
    }

    // Filtro por estado
    if (filters.status !== 'all') {
      filtered = filtered.filter(report => {
        switch (filters.status) {
          case 'active':
            return report.days_overdue === 0;
          case 'overdue':
            return report.days_overdue > 0;
          case 'paid':
            return report.current_late_fee === 0;
          default:
            return true;
        }
      });
    }

    // Filtro por rango de monto
    if (filters.amountRange !== 'all') {
      filtered = filtered.filter(report => {
        switch (filters.amountRange) {
          case 'low':
            return report.loan_amount <= 50000;
          case 'medium':
            return report.loan_amount > 50000 && report.loan_amount <= 200000;
          case 'high':
            return report.loan_amount > 200000;
          default:
            return true;
        }
      });
    }

    // Filtro por rango de mora
    if (filters.lateFeeRange !== 'all') {
      filtered = filtered.filter(report => {
        switch (filters.lateFeeRange) {
          case 'low':
            return report.current_late_fee <= 1000;
          case 'medium':
            return report.current_late_fee > 1000 && report.current_late_fee <= 5000;
          case 'high':
            return report.current_late_fee > 5000;
          default:
            return true;
        }
      });
    }

    // Filtro por tipo de cálculo
    if (filters.calculationType !== 'all') {
      filtered = filtered.filter(report => report.late_fee_calculation_type === filters.calculationType);
    }

    setFilteredReports(filtered);
  };

  const getStatusBadge = (report: LateFeeReport) => {
    if (report.current_late_fee === 0) {
      return <Badge className="bg-green-500 text-white">Al Día</Badge>;
    }
    if (report.days_overdue > 7) {
      return <Badge variant="destructive">Mora Crítica</Badge>;
    }
    if (report.days_overdue > 0) {
      return <Badge className="bg-orange-500 text-white">En Mora</Badge>;
    }
    return <Badge className="bg-blue-500 text-white">Activo</Badge>;
  };

  const getPriorityColor = (report: LateFeeReport) => {
    if (report.days_overdue > 7) return 'border-red-300 bg-red-50';
    if (report.days_overdue > 0) return 'border-orange-300 bg-orange-50';
    return 'border-green-300 bg-green-50';
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Cliente', 'DNI', 'Monto Préstamo', 'Balance Restante', 'Mora Actual', 'Días Vencidos', 'Tasa Mora', 'Tipo Cálculo', 'Estado'],
      ...filteredReports.map(report => [
        report.client_name,
        report.client_dni,
        report.loan_amount.toLocaleString(),
        report.remaining_balance.toLocaleString(),
        report.current_late_fee.toLocaleString(),
        report.days_overdue.toString(),
        `${report.late_fee_rate}%`,
        report.late_fee_calculation_type,
        report.days_overdue > 0 ? 'En Mora' : 'Al Día'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-mora-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Reporte exportado exitosamente');
  };

  const printReport = () => {
    window.print();
  };

  const totalLateFee = filteredReports.reduce((sum, report) => sum + report.current_late_fee, 0);
  const totalOverdueLoans = filteredReports.filter(report => report.days_overdue > 0).length;
  const averageLateFee = filteredReports.length > 0 ? totalLateFee / filteredReports.length : 0;
  const criticalOverdueLoans = filteredReports.filter(report => report.days_overdue > 7).length;
  const totalLateFeePaid = filteredReports.reduce((sum, report) => sum + report.total_late_fee_paid, 0);
  const overdueRate = filteredReports.length > 0 ? (totalOverdueLoans / filteredReports.length) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Reportes de Mora</h2>
          <p className="text-gray-600">Análisis y seguimiento de mora en préstamos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={loadReports} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={printReport} variant="outline" size="sm">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir
          </Button>
        </div>
      </div>

      {/* Estadísticas Generales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mora</CardTitle>
            <DollarSign className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              RD${totalLateFee.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredReports.length} préstamos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos en Mora</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {totalOverdueLoans}
            </div>
            <p className="text-xs text-muted-foreground">
              {Math.round(overdueRate)}% del total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mora Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              RD${averageLateFee.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Por préstamo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticos (&gt;7 días)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {criticalOverdueLoans}
            </div>
            <p className="text-xs text-muted-foreground">
              Requieren atención urgente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <FileText className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              RD${totalLateFeePaid.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              En mora cobrada
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros y Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Buscar Cliente</Label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Nombre o DNI..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select value={filters.status} onValueChange={(value: any) => setFilters({...filters, status: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="overdue">En Mora</SelectItem>
                  <SelectItem value="paid">Al Día</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amountRange">Monto Préstamo</Label>
              <Select value={filters.amountRange} onValueChange={(value: any) => setFilters({...filters, amountRange: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="low">Bajo (≤ $50,000)</SelectItem>
                  <SelectItem value="medium">Medio ($50,001 - $200,000)</SelectItem>
                  <SelectItem value="high">Alto (&gt; $200,000)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lateFeeRange">Mora Actual</Label>
              <Select value={filters.lateFeeRange} onValueChange={(value: any) => setFilters({...filters, lateFeeRange: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="low">Baja (≤ $1,000)</SelectItem>
                  <SelectItem value="medium">Media ($1,001 - $5,000)</SelectItem>
                  <SelectItem value="high">Alta (&gt; $5,000)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="calculationType">Tipo Cálculo</Label>
              <Select value={filters.calculationType} onValueChange={(value: any) => setFilters({...filters, calculationType: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="compound">Compuesto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateFrom">Fecha Desde</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Reportes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Table className="h-5 w-5" />
              Reportes de Mora ({filteredReports.length})
            </span>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <Table className="h-4 w-4 mr-2" />
                Tabla
              </Button>
              <Button
                variant={viewMode === 'chart' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('chart')}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Gráfico
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando reportes...</div>
          ) : filteredReports.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No se encontraron reportes con los filtros aplicados</div>
          ) : viewMode === 'chart' ? (
            <LateFeeCharts reports={filteredReports} />
          ) : (
            <div className="space-y-4">
              {filteredReports.map((report) => (
                <Card key={report.loan_id} className={`border-l-4 ${getPriorityColor(report)}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">{report.client_name}</h3>
                          {getStatusBadge(report)}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
                          <div>
                            <span className="text-gray-600 text-xs">DNI:</span>
                            <div className="font-medium text-sm">{report.client_dni}</div>
                          </div>
                          <div>
                            <span className="text-gray-600 text-xs">Monto:</span>
                            <div className="font-medium text-sm">RD${report.loan_amount.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-gray-600 text-xs">Balance:</span>
                            <div className="font-medium text-sm">RD${report.remaining_balance.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-gray-600 text-xs">Días Vencidos:</span>
                            <div className={`font-medium text-sm ${report.days_overdue > 7 ? 'text-red-600' : report.days_overdue > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                              {report.days_overdue}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-red-600 mb-2">
                          RD${report.current_late_fee.toLocaleString()}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedReport(report);
                              setShowDetailModal(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalles
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalles */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Detalles de Mora - {selectedReport?.client_name}
            </DialogTitle>
          </DialogHeader>
          {selectedReport && (
            <div className="space-y-6">
              {/* Información del Cliente */}
              <Card>
                <CardHeader>
                  <CardTitle>Información del Cliente</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-gray-600">Nombre:</span>
                      <div className="font-medium">{selectedReport.client_name}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">DNI:</span>
                      <div className="font-medium">{selectedReport.client_dni}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Monto Préstamo:</span>
                      <div className="font-medium">RD${selectedReport.loan_amount.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Balance Restante:</span>
                      <div className="font-medium">RD${selectedReport.remaining_balance.toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Información de Mora */}
              <Card>
                <CardHeader>
                  <CardTitle>Información de Mora</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <span className="text-gray-600">Mora Actual:</span>
                      <div className="font-medium text-red-600 text-lg">RD${selectedReport.current_late_fee.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Días Vencidos:</span>
                      <div className="font-medium text-red-600 text-lg">{selectedReport.days_overdue}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Tasa de Mora:</span>
                      <div className="font-medium">{selectedReport.late_fee_rate}%</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Días de Gracia:</span>
                      <div className="font-medium">{selectedReport.grace_period_days}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Tipo de Cálculo:</span>
                      <div className="font-medium capitalize">{selectedReport.late_fee_calculation_type}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Mora Pagada:</span>
                      <div className="font-medium text-green-600">RD${selectedReport.total_late_fee_paid.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Próximo Pago:</span>
                      <div className="font-medium">{selectedReport.next_payment_date}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Último Pago:</span>
                      <div className="font-medium">{selectedReport.last_payment_date || 'N/A'}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Historial de Mora */}
              <Card>
                <CardHeader>
                  <CardTitle>Historial de Mora ({selectedReport.late_fee_history_count} registros)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4 text-gray-500">
                    Historial detallado disponible en el módulo de préstamos
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
