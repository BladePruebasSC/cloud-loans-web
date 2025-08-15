
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LoanForm } from './LoanForm';
import { PaymentForm } from './PaymentForm';
import { LoanUpdateForm } from './LoanUpdateForm';
import { LoanHistoryView } from './LoanHistoryView';
import { useLoans } from '@/hooks/useLoans';
import { useAuth } from '@/hooks/useAuth';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Clock, 
  Calendar,
  DollarSign,
  Users,
  AlertCircle,
  CheckCircle,
  Filter,
  Receipt,
  Edit,
  History
} from 'lucide-react';

export const LoansModule = () => {
  const [activeTab, setActiveTab] = useState('mis-prestamos');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const { loans, loading } = useLoans();
  const { profile, companyId } = useAuth();

  console.log('LoansModule - Profile:', profile);
  console.log('LoansModule - CompanyId:', companyId);

  // Calcular estadísticas
  const activeLoans = loans.filter(loan => loan.status === 'active');
  const overdueLoans = loans.filter(loan => loan.status === 'overdue');
  const totalAmount = loans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalBalance = loans.reduce((sum, loan) => sum + loan.remaining_balance, 0);

  if (showLoanForm) {
    return <LoanForm onBack={() => setShowLoanForm(false)} />;
  }

  if (showPaymentForm) {
    return <PaymentForm onBack={() => setShowPaymentForm(false)} />;
  }

  if (showUpdateForm && selectedLoan) {
    return (
      <LoanUpdateForm
        loan={selectedLoan}
        isOpen={showUpdateForm}
        onClose={() => {
          setShowUpdateForm(false);
          setSelectedLoan(null);
        }}
        onUpdate={() => {
          setShowUpdateForm(false);
          setSelectedLoan(null);
          // Refresh loans data
          window.location.reload();
        }}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Préstamos</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button onClick={() => setShowPaymentForm(true)} className="w-full sm:w-auto">
            <Receipt className="h-4 w-4 mr-2" />
            Registrar Pago
          </Button>
          <Button onClick={() => setShowLoanForm(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Préstamo
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-2">
          <TabsTrigger value="mis-prestamos" className="text-xs sm:text-sm">Mis Préstamos</TabsTrigger>
          <TabsTrigger value="nuevo-prestamo" className="text-xs sm:text-sm">Nuevo Préstamo</TabsTrigger>
          <TabsTrigger value="buscar" className="text-xs sm:text-sm">Buscar</TabsTrigger>
          <TabsTrigger value="pendientes" className="text-xs sm:text-sm">Pendientes</TabsTrigger>
          <TabsTrigger value="agenda" className="text-xs sm:text-sm">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="mis-prestamos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Préstamos</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{loans.length}</div>
                <p className="text-xs text-muted-foreground">+{activeLoans.length} activos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeLoans.length}</div>
                <p className="text-xs text-muted-foreground">Al día con pagos</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Préstamos Vencidos</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{overdueLoans.length}</div>
                <p className="text-xs text-muted-foreground">Requieren atención</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Capital Prestado</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${totalBalance.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Balance pendiente</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros y búsqueda */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Todos los Estados
                </Button>
                <Button variant="outline">Por Cliente</Button>
                <Button variant="outline">Por Fecha</Button>
                <Button variant="outline">Por Monto</Button>
                <Button variant="outline">Por Mora</Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de préstamos */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Préstamos</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Cargando préstamos...</div>
              ) : loans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay préstamos registrados</p>
                  <Button className="mt-4" onClick={() => setShowLoanForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Préstamo
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {loans.map((loan) => (
                    <div key={loan.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">
                              {loan.client?.full_name} - {loan.client?.dni}
                            </h3>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              loan.status === 'active' ? 'bg-green-100 text-green-800' :
                              loan.status === 'overdue' ? 'bg-red-100 text-red-800' :
                              loan.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {loan.status === 'active' ? 'Activo' :
                               loan.status === 'overdue' ? 'Vencido' :
                               loan.status === 'paid' ? 'Pagado' :
                               loan.status}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Monto:</span> ${loan.amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Balance:</span> ${loan.remaining_balance.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Cuota:</span> ${loan.monthly_payment.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Próximo Pago:</span> {new Date(loan.next_payment_date).toLocaleDateString()}
                            </div>
                            <div>
                              <span className="font-medium">Plazo:</span> {loan.term_months} meses
                            </div>
                            <div>
                              <span className="font-medium">Tasa:</span> {loan.interest_rate}%
                            </div>
                            <div>
                              <span className="font-medium">Tipo:</span> {loan.loan_type}
                            </div>
                            <div>
                              <span className="font-medium">Inicio:</span> {new Date(loan.start_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPaymentForm(true)}
                            disabled={loan.status === 'paid'}
                          >
                            <Receipt className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowUpdateForm(true);
                            }}
                            disabled={loan.status === 'paid'}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowHistoryView(true);
                            }}
                          >
                            <History className="h-4 w-4" />
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

        <TabsContent value="nuevo-prestamo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Crear Nuevo Préstamo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Plus className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Formulario de Nuevo Préstamo</h3>
                <p className="text-gray-600 mb-4">Completa la información para crear un nuevo préstamo</p>
                <Button onClick={() => setShowLoanForm(true)}>Comenzar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="buscar" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="h-5 w-5 mr-2" />
                Buscar Préstamos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Búsqueda Avanzada</h3>
                <p className="text-gray-600">Encuentra préstamos por cliente, fecha, monto o estado</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Préstamos Pendientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Clock className="h-12 w-12 mx-auto mb-4 text-orange-400" />
                <h3 className="text-lg font-medium mb-2">Préstamos Pendientes de Pago</h3>
                <p className="text-gray-600">Lista de préstamos con pagos próximos o vencidos</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                Agenda de Cobros
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-blue-400" />
                <h3 className="text-lg font-medium mb-2">Calendario de Cobros</h3>
                <p className="text-gray-600">Programa y gestiona las fechas de cobro</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Loan History View */}
      {selectedLoan && (
        <LoanHistoryView
          loanId={selectedLoan.id}
          isOpen={showHistoryView}
          onClose={() => {
            setShowHistoryView(false);
            setSelectedLoan(null);
          }}
        />
      )}
    </div>
  );
};
