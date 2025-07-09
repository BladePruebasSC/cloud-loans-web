
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLoans } from '@/hooks/useLoans';
import { 
  DollarSign, 
  TrendingUp, 
  Calendar, 
  AlertCircle, 
  Plus,
  CreditCard,
  Clock,
  CheckCircle,
  Loader2
} from 'lucide-react';

interface User {
  name: string;
  email: string;
}

interface DashboardProps {
  user: User;
  onNewLoan: () => void;
  onViewLoan: (loanId: string) => void;
}

const Dashboard = ({ user, onNewLoan, onViewLoan }: DashboardProps) => {
  const { loans, loading } = useLoans();

  const activeLoans = loans.filter(loan => loan.status === 'active');
  const totalBalance = activeLoans.reduce((sum, loan) => sum + loan.remaining_balance, 0);
  const monthlyPayments = activeLoans.reduce((sum, loan) => sum + loan.monthly_payment, 0);
  const overdueLoans = loans.filter(loan => loan.status === 'overdue');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-100 text-blue-800">Activo</Badge>;
      case 'paid':
        return <Badge className="bg-green-100 text-green-800">Pagado</Badge>;
      case 'overdue':
        return <Badge className="bg-red-100 text-red-800">Vencido</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
      default:
        return <Badge>Desconocido</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Cargando préstamos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Bienvenido, {user.name}
          </h2>
          <p className="text-gray-600">Gestiona tus préstamos y pagos</p>
        </div>
        <Button onClick={onNewLoan} className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>Nuevo Préstamo</span>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary-600">
              {formatCurrency(totalBalance)}
            </div>
            <p className="text-xs text-muted-foreground">
              Saldo pendiente de todos los préstamos
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pago Mensual</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(monthlyPayments)}
            </div>
            <p className="text-xs text-muted-foreground">
              Total de pagos mensuales
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {activeLoans.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Préstamos en curso
            </p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Préstamos Vencidos</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {overdueLoans.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Requieren atención inmediata
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Loans */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CreditCard className="h-5 w-5" />
            <span>Mis Préstamos</span>
          </CardTitle>
          <CardDescription>
            Estado actual de todos tus préstamos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No tienes préstamos activos
              </h3>
              <p className="text-gray-600 mb-4">
                Solicita tu primer préstamo para comenzar
              </p>
              <Button onClick={onNewLoan}>
                Solicitar Préstamo
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {loans.map((loan) => (
                <div 
                  key={loan.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  onClick={() => onViewLoan(loan.id)}
                >
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <h3 className="font-medium text-gray-900">
                          Préstamo #{loan.id.slice(-6)}
                        </h3>
                        {getStatusBadge(loan.status)}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Monto Original</p>
                          <p className="font-medium">{formatCurrency(loan.amount)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Saldo Pendiente</p>
                          <p className="font-medium">{formatCurrency(loan.remaining_balance)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Pago Mensual</p>
                          <p className="font-medium">{formatCurrency(loan.monthly_payment)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">Próximo Pago</p>
                          <p className="font-medium">{loan.next_payment_date}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 text-gray-400">
                      {loan.status === 'active' && <Clock className="h-4 w-4" />}
                      {loan.status === 'paid' && <CheckCircle className="h-4 w-4 text-green-500" />}
                      {loan.status === 'overdue' && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
