import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  TrendingDown,
  DollarSign,
  AlertTriangle
} from 'lucide-react';

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

interface LateFeeChartsProps {
  reports: LateFeeReport[];
}

export const LateFeeCharts: React.FC<LateFeeChartsProps> = ({ reports }) => {
  // Calcular estadísticas
  const totalLateFee = reports.reduce((sum, report) => sum + report.current_late_fee, 0);
  const totalOverdueLoans = reports.filter(report => report.days_overdue > 0).length;
  const averageLateFee = reports.length > 0 ? totalLateFee / reports.length : 0;
  const totalPaid = reports.reduce((sum, report) => sum + report.total_late_fee_paid, 0);

  // Agrupar por tipo de cálculo
  const calculationTypeStats = reports.reduce((acc, report) => {
    const type = report.late_fee_calculation_type;
    if (!acc[type]) {
      acc[type] = { count: 0, total: 0 };
    }
    acc[type].count++;
    acc[type].total += report.current_late_fee;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Agrupar por rango de días vencidos
  const overdueRangeStats = reports.reduce((acc, report) => {
    const days = report.days_overdue;
    let range = 'Al Día';
    if (days > 0 && days <= 7) range = '1-7 días';
    else if (days > 7 && days <= 30) range = '8-30 días';
    else if (days > 30) range = 'Más de 30 días';
    
    if (!acc[range]) {
      acc[range] = { count: 0, total: 0 };
    }
    acc[range].count++;
    acc[range].total += report.current_late_fee;
    return acc;
  }, {} as Record<string, { count: number; total: number }>);

  // Top 10 préstamos con mayor mora
  const topLateFeeLoans = [...reports]
    .sort((a, b) => b.current_late_fee - a.current_late_fee)
    .slice(0, 10);

  return (
    <div className="space-y-6">
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
              {reports.length} préstamos
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
              {reports.length > 0 ? Math.round((totalOverdueLoans / reports.length) * 100) : 0}% del total
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
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              RD${totalPaid.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              En mora cobrada
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico de Barras - Mora por Tipo de Cálculo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Mora por Tipo de Cálculo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(calculationTypeStats).map(([type, stats]) => (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium capitalize">{type}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{stats.count} préstamos</span>
                      <Badge variant="outline">RD${stats.total.toLocaleString()}</Badge>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${reports.length > 0 ? (stats.count / reports.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico de Barras - Mora por Rango de Días */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Mora por Días Vencidos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(overdueRangeStats).map(([range, stats]) => {
                const color = range === 'Al Día' ? 'green' : 
                             range === '1-7 días' ? 'yellow' : 
                             range === '8-30 días' ? 'orange' : 'red';
                const colorClass = color === 'green' ? 'bg-green-600' : 
                                  color === 'yellow' ? 'bg-yellow-600' : 
                                  color === 'orange' ? 'bg-orange-600' : 'bg-red-600';
                
                return (
                  <div key={range} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{range}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{stats.count} préstamos</span>
                        <Badge variant="outline">RD${stats.total.toLocaleString()}</Badge>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`${colorClass} h-2 rounded-full transition-all duration-300`}
                        style={{ width: `${reports.length > 0 ? (stats.count / reports.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 Préstamos con Mayor Mora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            Top 10 Préstamos con Mayor Mora
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {topLateFeeLoans.map((report, index) => (
              <div key={report.loan_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center text-sm font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{report.client_name}</div>
                    <div className="text-sm text-gray-600">{report.client_dni}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-red-600">RD${report.current_late_fee.toLocaleString()}</div>
                  <div className="text-sm text-gray-600">{report.days_overdue} días vencidos</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Resumen de Eficiencia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-green-600" />
            Resumen de Eficiencia
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {reports.length > 0 ? Math.round((totalOverdueLoans / reports.length) * 100) : 0}%
              </div>
              <div className="text-sm text-blue-600">Tasa de Mora</div>
              <div className="text-xs text-gray-600">Préstamos en mora vs total</div>
            </div>
            
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {totalLateFee > 0 ? Math.round((totalPaid / (totalLateFee + totalPaid)) * 100) : 0}%
              </div>
              <div className="text-sm text-green-600">Eficiencia de Cobro</div>
              <div className="text-xs text-gray-600">Mora cobrada vs total</div>
            </div>
            
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">
                {reports.length > 0 ? Math.round(reports.reduce((sum, report) => sum + report.days_overdue, 0) / reports.length) : 0}
              </div>
              <div className="text-sm text-orange-600">Días Promedio</div>
              <div className="text-xs text-gray-600">Días vencidos promedio</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
