
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  History,
  X
} from 'lucide-react';

export const LoansModule = () => {
  const [activeTab, setActiveTab] = useState('mis-prestamos');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState(null);
  
  // Estados para filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [amountFilter, setAmountFilter] = useState('all');
  const [overdueFilter, setOverdueFilter] = useState(false);
  
  const { loans, loading } = useLoans();
  const { profile, companyId } = useAuth();

  console.log('LoansModule - Profile:', profile);
  console.log('LoansModule - CompanyId:', companyId);

  // Función para filtrar préstamos
  const filteredLoans = loans.filter(loan => {
    // Filtro por término de búsqueda
    const matchesSearch = searchTerm === '' || 
      loan.client?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.client?.dni?.includes(searchTerm) ||
      loan.id.toLowerCase().includes(searchTerm.toLowerCase());

    // Filtro por estado
    const matchesStatus = statusFilter === 'all' || loan.status === statusFilter;

    // Filtro por fecha
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const loanDate = new Date(loan.start_date);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - loanDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      switch (dateFilter) {
        case 'today':
          matchesDate = diffDays === 0;
          break;
        case 'week':
          matchesDate = diffDays <= 7;
          break;
        case 'month':
          matchesDate = diffDays <= 30;
          break;
        case 'quarter':
          matchesDate = diffDays <= 90;
          break;
      }
    }

    // Filtro por monto
    let matchesAmount = true;
    if (amountFilter !== 'all') {
      switch (amountFilter) {
        case 'low':
          matchesAmount = loan.amount <= 50000;
          break;
        case 'medium':
          matchesAmount = loan.amount > 50000 && loan.amount <= 200000;
          break;
        case 'high':
          matchesAmount = loan.amount > 200000;
          break;
      }
    }

    // Filtro por mora
    const matchesOverdue = !overdueFilter || loan.status === 'overdue';

    return matchesSearch && matchesStatus && matchesDate && matchesAmount && matchesOverdue;
  });

  // Calcular estadísticas basadas en préstamos filtrados
  const activeLoans = filteredLoans.filter(loan => loan.status === 'active');
  const overdueLoans = filteredLoans.filter(loan => loan.status === 'overdue');
  const totalAmount = filteredLoans.reduce((sum, loan) => sum + loan.amount, 0);
  const totalBalance = filteredLoans.reduce((sum, loan) => sum + loan.remaining_balance, 0);

  if (showLoanForm) {
    return <LoanForm onBack={() => setShowLoanForm(false)} />;
  }

  if (showPaymentForm) {
    return (
      <PaymentForm 
        onBack={() => {
          setShowPaymentForm(false);
          setSelectedLoanForPayment(null);
        }} 
        preselectedLoan={selectedLoanForPayment}
      />
    );
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
          <Button onClick={() => {
            setSelectedLoanForPayment(null);
            setShowPaymentForm(true);
          }} className="w-full sm:w-auto">
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
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1 sm:gap-2 overflow-x-auto">
          <TabsTrigger value="mis-prestamos" className="text-xs sm:text-sm whitespace-nowrap">Mis Préstamos</TabsTrigger>
          <TabsTrigger value="nuevo-prestamo" className="text-xs sm:text-sm whitespace-nowrap">Nuevo Préstamo</TabsTrigger>
          <TabsTrigger value="buscar" className="text-xs sm:text-sm whitespace-nowrap">Buscar</TabsTrigger>
          <TabsTrigger value="pendientes" className="text-xs sm:text-sm whitespace-nowrap">Pendientes</TabsTrigger>
          <TabsTrigger value="agenda" className="text-xs sm:text-sm whitespace-nowrap">Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="mis-prestamos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
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
            <CardContent className="space-y-4">
              {/* Campo de búsqueda */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Buscar por cliente, DNI o ID de préstamo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
                {searchTerm && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>

              {/* Filtros */}
              <div className="flex flex-wrap gap-2 sm:gap-4">
                {/* Filtro por Estado */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Estados</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="overdue">Vencidos</SelectItem>
                    <SelectItem value="paid">Pagados</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Fecha */}
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las Fechas</SelectItem>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Última Semana</SelectItem>
                    <SelectItem value="month">Último Mes</SelectItem>
                    <SelectItem value="quarter">Último Trimestre</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Monto */}
                <Select value={amountFilter} onValueChange={setAmountFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Monto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Montos</SelectItem>
                    <SelectItem value="low">Bajo (≤ $50,000)</SelectItem>
                    <SelectItem value="medium">Medio ($50,001 - $200,000)</SelectItem>
                    <SelectItem value="high">Alto (&gt; $200,000)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Mora */}
                <Button
                  variant={overdueFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOverdueFilter(!overdueFilter)}
                  className="text-xs sm:text-sm"
                >
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Solo Vencidos</span>
                  <span className="sm:hidden">Vencidos</span>
                </Button>

                {/* Limpiar Filtros */}
                {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setDateFilter('all');
                      setAmountFilter('all');
                      setOverdueFilter(false);
                    }}
                    className="text-xs sm:text-sm"
                  >
                    <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                    <span className="hidden sm:inline">Limpiar Filtros</span>
                    <span className="sm:hidden">Limpiar</span>
                  </Button>
                )}
              </div>

              {/* Resumen de filtros aplicados */}
              {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                <div className="text-sm text-gray-600">
                  Mostrando {filteredLoans.length} de {loans.length} préstamos
                  {searchTerm && ` • Búsqueda: "${searchTerm}"`}
                  {statusFilter !== 'all' && ` • Estado: ${statusFilter}`}
                  {dateFilter !== 'all' && ` • Fecha: ${dateFilter}`}
                  {amountFilter !== 'all' && ` • Monto: ${amountFilter}`}
                  {overdueFilter && ` • Solo vencidos`}
                </div>
              )}
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
              ) : filteredLoans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{loans.length === 0 ? 'No hay préstamos registrados' : 'No se encontraron préstamos con los filtros aplicados'}</p>
                  {loans.length === 0 ? (
                    <Button className="mt-4" onClick={() => setShowLoanForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Crear Primer Préstamo
                    </Button>
                  ) : (
                    <Button className="mt-4" variant="outline" onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setDateFilter('all');
                      setAmountFilter('all');
                      setOverdueFilter(false);
                    }}>
                      <X className="h-4 w-4 mr-2" />
                      Limpiar Filtros
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLoans.map((loan) => (
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
                              <span className="font-medium text-xs sm:text-sm">Próximo Pago:</span> 
                              <span className="text-xs sm:text-sm">{new Date(loan.next_payment_date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Plazo:</span> 
                              <span className="text-xs sm:text-sm">{loan.term_months} meses</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Tasa:</span> 
                              <span className="text-xs sm:text-sm">{loan.interest_rate}%</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Tipo:</span> 
                              <span className="text-xs sm:text-sm">{loan.loan_type}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Inicio:</span> 
                              <span className="text-xs sm:text-sm">{new Date(loan.start_date).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLoanForPayment(loan);
                              setShowPaymentForm(true);
                            }}
                            disabled={loan.status === 'paid'}
                            className="w-full sm:w-auto text-xs"
                          >
                            <Receipt className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                            <span className="sm:hidden">Pagar</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowUpdateForm(true);
                            }}
                            disabled={loan.status === 'paid'}
                            className="w-full sm:w-auto text-xs"
                          >
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                            <span className="sm:hidden">Editar</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedLoan(loan);
                              setShowHistoryView(true);
                            }}
                            className="w-full sm:w-auto text-xs"
                          >
                            <History className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                            <span className="sm:hidden">Historial</span>
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
