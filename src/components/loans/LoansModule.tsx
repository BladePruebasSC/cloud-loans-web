
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LoanForm } from './LoanForm';
import { PaymentForm } from './PaymentForm';
import { LoanUpdateForm } from './LoanUpdateForm';
import { LoanHistoryView } from './LoanHistoryView';
import { LoanStatistics } from './LoanStatistics';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { useLoans } from '@/hooks/useLoans';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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
  FileText,
  Receipt,
  Edit,
  History,
  X,
  ChevronLeft,
  ArrowRight,
  ChevronRight,
  Trash2,
  RotateCcw,
  BarChart3
} from 'lucide-react';

export const LoansModule = () => {
  const [activeTab, setActiveTab] = useState('mis-prestamos');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState(null);
  const [initialLoanData, setInitialLoanData] = useState(null);
  const [showRequestSelector, setShowRequestSelector] = useState(false);
  const [requests, setRequests] = useState([]);
  const [currentViewMonth, setCurrentViewMonth] = useState(new Date());
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [loanToCancel, setLoanToCancel] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  
     // Estados para filtros y búsqueda
   const [searchTerm, setSearchTerm] = useState('');
   const [statusFilter, setStatusFilter] = useState('active'); // Por defecto mostrar solo activos
   const [dateFilter, setDateFilter] = useState('all');
   const [amountFilter, setAmountFilter] = useState('all');
   const [overdueFilter, setOverdueFilter] = useState(false);
   const [showDeleted, setShowDeleted] = useState(false);
  
  const { loans, loading, refetch } = useLoans();
  const { profile, companyId } = useAuth();

  // Funciones para navegación del calendario
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentViewMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentViewMonth(newMonth);
  };

  const resetToCurrentMonth = () => {
    setCurrentViewMonth(new Date());
  };

  // Detectar parámetros de URL para crear préstamo desde solicitud
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const createParam = urlParams.get('create');
    
    if (createParam === 'true') {
      const initialData = {
        client_id: urlParams.get('client_id') || undefined,
        amount: urlParams.get('amount') ? Number(urlParams.get('amount')) : undefined,
        purpose: urlParams.get('purpose') || undefined,
        monthly_income: urlParams.get('monthly_income') ? Number(urlParams.get('monthly_income')) : undefined,
        existing_debts: urlParams.get('existing_debts') ? Number(urlParams.get('existing_debts')) : undefined,
        employment_status: urlParams.get('employment_status') || undefined,
        // Campos de préstamo
        interest_rate: urlParams.get('interest_rate') ? Number(urlParams.get('interest_rate')) : undefined,
        term_months: urlParams.get('term_months') ? Number(urlParams.get('term_months')) : undefined,
        loan_type: urlParams.get('loan_type') || undefined,
        amortization_type: urlParams.get('amortization_type') || undefined,
        payment_frequency: urlParams.get('payment_frequency') || undefined,
        first_payment_date: urlParams.get('first_payment_date') || undefined,
        closing_costs: urlParams.get('closing_costs') ? Number(urlParams.get('closing_costs')) : undefined,
        late_fee: urlParams.get('late_fee') === 'true',
        minimum_payment_type: urlParams.get('minimum_payment_type') || undefined,
        minimum_payment_percentage: urlParams.get('minimum_payment_percentage') ? Number(urlParams.get('minimum_payment_percentage')) : undefined,
        guarantor_required: urlParams.get('guarantor_required') === 'true',
        guarantor_name: urlParams.get('guarantor_name') || undefined,
        guarantor_phone: urlParams.get('guarantor_phone') || undefined,
        guarantor_dni: urlParams.get('guarantor_dni') || undefined,
        notes: urlParams.get('notes') || undefined,
      };
      
      // Solo configurar si hay al menos un parámetro válido
      if (initialData.client_id || initialData.amount) {
        setInitialLoanData(initialData);
        setShowLoanForm(true);
        
        // Limpiar URL para evitar re-aplicación
        window.history.replaceState({}, '', '/prestamos');
      }
    }
  }, []);

  // Cargar solicitudes para el selector
  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_requests')
        .select(`
          *,
          clients (
            id,
            full_name,
            dni,
            phone,
            email
          )
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  // Función para seleccionar una solicitud y crear préstamo
  const handleSelectRequestForLoan = (request) => {
    const initialData = {
      client_id: request.client_id,
      amount: request.requested_amount,
      purpose: request.purpose,
      monthly_income: request.monthly_income,
      existing_debts: request.existing_debts,
      employment_status: request.employment_status,
      // Campos de préstamo
      interest_rate: request.interest_rate,
      term_months: request.term_months,
      loan_type: request.loan_type,
      amortization_type: request.amortization_type,
      payment_frequency: request.payment_frequency,
      first_payment_date: request.first_payment_date,
      closing_costs: request.closing_costs,
      late_fee: request.late_fee,
      minimum_payment_type: request.minimum_payment_type,
      minimum_payment_percentage: request.minimum_payment_percentage,
      guarantor_required: request.guarantor_required,
      guarantor_name: request.guarantor_name,
      guarantor_phone: request.guarantor_phone,
      guarantor_dni: request.guarantor_dni,
      notes: request.notes,
    };
    
    setInitialLoanData(initialData);
    setShowRequestSelector(false);
    setShowLoanForm(true);
  };

  // Función para aprobar préstamos pendientes
  const handleApproveLoan = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .update({ status: 'active' })
        .eq('id', loanId);

      if (error) {
        console.error('Error al aprobar préstamo:', error);
        toast.error('Error al aprobar el préstamo');
        return;
      }

      toast.success('Préstamo aprobado exitosamente');
      refetch(); // Actualizar los datos de préstamos
    } catch (error) {
      console.error('Error al aprobar préstamo:', error);
      toast.error('Error al aprobar el préstamo');
    }
  };

  // Función para mostrar diálogo de confirmación de cancelación
  const handleCancelLoanClick = (loan: any) => {
    setLoanToCancel(loan);
    setShowCancelDialog(true);
  };

  // Función para cancelar préstamos pendientes
  const handleCancelLoan = async () => {
    console.log('handleCancelLoan ejecutándose...', loanToCancel);
    if (!loanToCancel || isCancelling) {
      console.log('No hay préstamo para cancelar o ya se está cancelando');
      return;
    }
    
    setIsCancelling(true);
    
    try {
      console.log('Intentando cancelar préstamo:', loanToCancel.id);
      const { data, error } = await supabase
        .from('loans')
        .update({ 
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Cancelado por administrador'
        })
        .eq('id', loanToCancel.id);

      if (error) {
        console.error('Error al cancelar préstamo:', error);
        toast.error('Error al cancelar el préstamo');
        return;
      }

      console.log('Préstamo cancelado exitosamente');
      toast.success('Préstamo cancelado exitosamente');
      refetch(); // Actualizar los datos de préstamos
      setShowCancelDialog(false);
      setLoanToCancel(null);
    } catch (error) {
      console.error('Error al cancelar préstamo:', error);
      toast.error('Error al cancelar el préstamo');
    } finally {
      setIsCancelling(false);
    }
  };

  // Función para recuperar préstamos eliminados
  const handleRecoverLoan = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .update({ 
          status: 'active',
          deleted_at: null,
          deleted_reason: null
        })
        .eq('id', loanId);

      if (error) {
        console.error('Error al recuperar préstamo:', error);
        toast.error('Error al recuperar el préstamo');
        return;
      }

      toast.success('Préstamo recuperado exitosamente');
      refetch(); // Actualizar los datos de préstamos
    } catch (error) {
      console.error('Error al recuperar préstamo:', error);
      toast.error('Error al recuperar el préstamo');
    }
  };

  console.log('LoansModule - Profile:', profile);
  console.log('LoansModule - CompanyId:', companyId);

     // Función para filtrar préstamos
   const filteredLoans = loans.filter(loan => {
     // Si se está mostrando solo eliminados, filtrar solo por eliminados
     if (showDeleted) {
       return loan.status === 'deleted';
     }
     
     // Por defecto, excluir préstamos eliminados
     if (loan.status === 'deleted') {
       return false;
     }

     // Filtro por término de búsqueda
     const matchesSearch = searchTerm === '' || 
       loan.client?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       loan.client?.dni?.includes(searchTerm) ||
       loan.id.toLowerCase().includes(searchTerm.toLowerCase());

     // Filtro por estado
     let matchesStatus = false;
     if (statusFilter === 'all') {
       // Mostrar todos excepto completados por defecto
       matchesStatus = loan.status !== 'paid';
     } else if (statusFilter === 'active') {
       // Mostrar activos, pendientes y en mora (pendientes con prioridad)
       matchesStatus = loan.status === 'active' || loan.status === 'overdue' || loan.status === 'pending';
     } else {
       // Mostrar el estado específico seleccionado
       matchesStatus = loan.status === statusFilter;
     }

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
  }).sort((a, b) => {
    // Ordenar por prioridad: pendientes primero, luego por fecha de próximo pago
    const statusPriority = {
      'pending': 0,    // Pendientes primero (requieren aprobación)
      'overdue': 1,    // Vencidos segundo (requieren atención urgente)
      'active': 2,     // Activos tercero
      'paid': 3,       // Completados cuarto
      'deleted': 4     // Eliminados último
    };

    const aPriority = statusPriority[a.status] || 5;
    const bPriority = statusPriority[b.status] || 5;

    // Si tienen la misma prioridad, ordenar por fecha de próximo pago (más cercana primero)
    if (aPriority === bPriority) {
      return new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime();
    }

    return aPriority - bPriority;
  });

  // Calcular estadísticas basadas en préstamos filtrados (excluyendo eliminados)
  const activeLoans = filteredLoans.filter(loan => loan.status === 'active');
  const overdueLoans = filteredLoans.filter(loan => loan.status === 'overdue');
  const pendingLoans = filteredLoans.filter(loan => loan.status === 'pending');
  const totalAmount = filteredLoans.filter(loan => loan.status !== 'deleted').reduce((sum, loan) => sum + loan.amount, 0);
  const totalBalance = filteredLoans.filter(loan => loan.status !== 'deleted').reduce((sum, loan) => sum + loan.remaining_balance, 0);

  if (showLoanForm) {
    return (
      <LoanForm 
        onBack={() => {
          setShowLoanForm(false);
          setInitialLoanData(null); // Limpiar datos iniciales
        }}
        onLoanCreated={() => {
          setShowLoanForm(false);
          setInitialLoanData(null); // Limpiar datos iniciales
          refetch(); // Actualizar los datos de préstamos
        }}
        initialData={initialLoanData}
      />
    );
  }

  if (showPaymentForm) {
    return (
      <PaymentForm 
        onBack={() => {
          setShowPaymentForm(false);
          setSelectedLoanForPayment(null);
        }} 
        preselectedLoan={selectedLoanForPayment}
        onPaymentSuccess={() => {
          refetch(); // Actualizar los datos de préstamos
        }}
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
          refetch();
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
          <Button 
            onClick={() => {
              fetchRequests();
              setShowRequestSelector(true);
            }} 
            className="w-full sm:w-auto"
            variant="outline"
          >
            <FileText className="h-4 w-4 mr-2" />
            Desde Solicitud
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
                <p className="text-xs text-muted-foreground">
                  {activeLoans.length} activos
                  {pendingLoans.length > 0 && ` • ${pendingLoans.length} pendientes`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Préstamos Activos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeLoans.length + pendingLoans.length}</div>
                <p className="text-xs text-muted-foreground">
                  {activeLoans.length} activos
                  {pendingLoans.length > 0 && ` • ${pendingLoans.length} por aprobar`}
                </p>
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
               {/* Filtros */}
              <div className="flex flex-wrap gap-2 sm:gap-4">
                {/* Filtro por Estado */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos (excepto completados)</SelectItem>
                    <SelectItem value="active">Activos</SelectItem>
                    <SelectItem value="overdue">Vencidos</SelectItem>
                    <SelectItem value="paid">Completados</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="deleted">Eliminados</SelectItem>
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

                {/* Filtro para Préstamos Eliminados */}
                <Button
                  variant={showDeleted ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowDeleted(!showDeleted)}
                  className="text-xs sm:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{showDeleted ? 'Ocultar Eliminados' : 'Solo Eliminados'}</span>
                  <span className="sm:hidden">Eliminados</span>
                </Button>

                                 {/* Limpiar Filtros */}
                 {(statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => {
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
               {(statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                 <div className="text-sm text-gray-600">
                   Mostrando {filteredLoans.length} de {loans.length} préstamos
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
                              loan.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                              loan.status === 'deleted' ? 'bg-gray-100 text-gray-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {loan.status === 'active' ? 'Activo' :
                               loan.status === 'overdue' ? 'Vencido' :
                               loan.status === 'paid' ? 'Pagado' :
                               loan.status === 'pending' ? 'Pendiente' :
                               loan.status === 'deleted' ? 'Eliminado' :
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
                          {loan.status === 'pending' ? (
                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleApproveLoan(loan.id)}
                                className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Aprobar</span>
                                <span className="hidden sm:inline">Aprobar</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowUpdateForm(true);
                                }}
                                className="w-full sm:w-auto text-xs"
                              >
                                <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Editar</span>
                                <span className="hidden sm:inline">Editar</span>
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => handleCancelLoanClick(loan)}
                                className="w-full sm:w-auto text-xs"
                              >
                                <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Cancelar</span>
                                <span className="hidden sm:inline">Cancelar</span>
                              </Button>
                            </div>
                          ) : loan.status === 'deleted' ? (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => handleRecoverLoan(loan.id)}
                              className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700"
                            >
                              <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                              <span className="sm:hidden">Recuperar</span>
                              <span className="hidden sm:inline">Recuperar Préstamo</span>
                            </Button>
                          ) : (
                            <>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowStatistics(true);
                                }}
                                className="w-full sm:w-auto text-xs"
                              >
                                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Stats</span>
                              </Button>
                            </>
                          )}
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
           {/* Campo de búsqueda principal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="h-5 w-5 mr-2" />
                 Búsqueda de Préstamos
              </CardTitle>
            </CardHeader>
             <CardContent className="space-y-4">
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                 <Input
                   placeholder="Buscar por nombre del cliente, DNI, ID de préstamo..."
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
               
               {/* Filtros avanzados */}
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                   <SelectTrigger>
                     <SelectValue placeholder="Estado del préstamo" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos (excepto completados)</SelectItem>
                     <SelectItem value="active">Activos</SelectItem>
                     <SelectItem value="overdue">Vencidos</SelectItem>
                     <SelectItem value="paid">Completados</SelectItem>
                     <SelectItem value="pending">Pendientes</SelectItem>
                     <SelectItem value="deleted">Eliminados</SelectItem>
                   </SelectContent>
                 </Select>

                 <Select value={dateFilter} onValueChange={setDateFilter}>
                   <SelectTrigger>
                     <SelectValue placeholder="Fecha de inicio" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todas las Fechas</SelectItem>
                     <SelectItem value="today">Hoy</SelectItem>
                     <SelectItem value="week">Última Semana</SelectItem>
                     <SelectItem value="month">Último Mes</SelectItem>
                     <SelectItem value="quarter">Último Trimestre</SelectItem>
                   </SelectContent>
                 </Select>

                 <Select value={amountFilter} onValueChange={setAmountFilter}>
                   <SelectTrigger>
                     <SelectValue placeholder="Rango de monto" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos los Montos</SelectItem>
                     <SelectItem value="low">Bajo (≤ $50,000)</SelectItem>
                     <SelectItem value="medium">Medio ($50,001 - $200,000)</SelectItem>
                     <SelectItem value="high">Alto (&gt; $200,000)</SelectItem>
                   </SelectContent>
                 </Select>

                 <Button
                   variant={overdueFilter ? "default" : "outline"}
                   onClick={() => setOverdueFilter(!overdueFilter)}
                   className="w-full"
                 >
                   <AlertCircle className="h-4 w-4 mr-2" />
                   Solo Vencidos
                 </Button>

                 <Button
                   variant={showDeleted ? "default" : "outline"}
                   onClick={() => setShowDeleted(!showDeleted)}
                   className="w-full"
                 >
                   <Trash2 className="h-4 w-4 mr-2" />
                   {showDeleted ? 'Ocultar Eliminados' : 'Solo Eliminados'}
                 </Button>
               </div>

               {/* Botón limpiar filtros */}
               {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter || showDeleted) && (
                 <div className="flex justify-center">
                   <Button
                     variant="outline"
                     onClick={() => {
                       setSearchTerm('');
                       setStatusFilter('all');
                       setDateFilter('all');
                       setAmountFilter('all');
                       setOverdueFilter(false);
                       setShowDeleted(false);
                     }}
                   >
                     <X className="h-4 w-4 mr-2" />
                     Limpiar Filtros
                   </Button>
                 </div>
               )}
             </CardContent>
           </Card>

           {/* Resultados de búsqueda */}
           <Card>
             <CardHeader>
               <CardTitle>Resultados de Búsqueda</CardTitle>
               {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter || showDeleted) && (
                 <div className="text-sm text-gray-600">
                   Mostrando {filteredLoans.length} de {loans.length} préstamos
                   {searchTerm && ` • Búsqueda: "${searchTerm}"`}
                   {statusFilter !== 'all' && ` • Estado: ${statusFilter}`}
                   {dateFilter !== 'all' && ` • Fecha: ${dateFilter}`}
                   {amountFilter !== 'all' && ` • Monto: ${amountFilter}`}
                   {overdueFilter && ` • Solo vencidos`}
                   {showDeleted && ` • Mostrando eliminados`}
                 </div>
               )}
            </CardHeader>
            <CardContent>
               {loading ? (
                 <div className="text-center py-8 text-gray-500">Cargando préstamos...</div>
               ) : filteredLoans.length === 0 ? (
                 <div className="text-center py-8 text-gray-500">
                   <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                   <p>{loans.length === 0 ? 'No hay préstamos registrados' : 'No se encontraron préstamos con los criterios de búsqueda'}</p>
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
                       setShowDeleted(false);
                     }}>
                       <X className="h-4 w-4 mr-2" />
                       Limpiar Búsqueda
                     </Button>
                   )}
              </div>
               ) : (
                 <div className="space-y-4">
                   {filteredLoans.map((loan) => (
                     <div key={loan.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
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
                               loan.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                               loan.status === 'deleted' ? 'bg-gray-100 text-gray-800' :
                               'bg-gray-100 text-gray-800'
                             }`}>
                               {loan.status === 'active' ? 'Activo' :
                                loan.status === 'overdue' ? 'Vencido' :
                                loan.status === 'paid' ? 'Pagado' :
                                loan.status === 'pending' ? 'Pendiente' :
                                loan.status === 'deleted' ? 'Eliminado' :
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
                           {loan.status === 'pending' ? (
                             <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                               <Button
                                 variant="default"
                                 size="sm"
                                 onClick={() => handleApproveLoan(loan.id)}
                                 className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                               >
                                 <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Aprobar</span>
                                 <span className="hidden sm:inline">Aprobar</span>
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setSelectedLoan(loan);
                                   setShowUpdateForm(true);
                                 }}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Editar</span>
                                 <span className="hidden sm:inline">Editar</span>
                               </Button>
                               <Button
                                 variant="destructive"
                                 size="sm"
                                 onClick={() => handleCancelLoanClick(loan)}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Cancelar</span>
                                 <span className="hidden sm:inline">Cancelar</span>
                               </Button>
                             </div>
                           ) : loan.status === 'deleted' ? (
                             <Button
                               variant="default"
                               size="sm"
                               onClick={() => handleRecoverLoan(loan.id)}
                               className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700"
                             >
                               <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                               <span className="sm:hidden">Recuperar</span>
                               <span className="hidden sm:inline">Recuperar Préstamo</span>
                             </Button>
                           ) : (
                             <>
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowStatistics(true);
                                }}
                                className="w-full sm:w-auto text-xs"
                              >
                                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Stats</span>
                              </Button>
                            </>
                          )}
                         </div>
                       </div>
                     </div>
                   ))}
              </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-6">
           {/* Stats Cards para Pendientes */}
           <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Total Pendientes</CardTitle>
                 <Clock className="h-4 w-4 text-orange-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-orange-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Requieren atención</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
                 <AlertCircle className="h-4 w-4 text-red-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-red-600">{loans.filter(loan => loan.status === 'overdue').length}</div>
                 <p className="text-xs text-muted-foreground">Pagos atrasados</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Próximos a Vencer</CardTitle>
                 <Calendar className="h-4 w-4 text-yellow-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-yellow-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'active' && diffDays <= 7 && diffDays > 0;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">En los próximos 7 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Monto Pendiente</CardTitle>
                 <DollarSign className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">${loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 }).reduce((sum, loan) => sum + loan.remaining_balance, 0).toLocaleString()}</div>
                 <p className="text-xs text-muted-foreground">Capital por cobrar</p>
               </CardContent>
             </Card>
           </div>

           {/* Lista de Préstamos Pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                 Préstamos Pendientes de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
               {loading ? (
                 <div className="text-center py-8 text-gray-500">Cargando préstamos pendientes...</div>
               ) : (() => {
                 const pendingLoans = loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   
                   // Incluir préstamos que:
                   // 1. Tienen estado 'pending' (pendientes)
                   // 2. Tienen estado 'overdue' (vencidos)
                   // 3. La fecha de pago ya pasó
                   // 4. Están activos y vencen en los próximos 7 días
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 });

                 if (pendingLoans.length === 0) {
                   return (
                     <div className="text-center py-8 text-gray-500">
                       <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                       <h3 className="text-lg font-medium mb-2">¡Excelente!</h3>
                       <p className="text-gray-600">No hay préstamos pendientes de pago</p>
              </div>
                   );
                 }

                 return (
                   <div className="space-y-4">
                     {pendingLoans.map((loan) => {
                                               const nextPayment = new Date(loan.next_payment_date);
                        const today = new Date();
                        const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        const isPending = loan.status === 'pending';
                        const isOverdue = loan.status === 'overdue' || nextPayment < today;
                        const isDueToday = diffDays === 0;
                        const isDueSoon = diffDays > 0 && diffDays <= 7;

                       return (
                                                   <div key={loan.id} className={`border rounded-lg p-4 ${isPending ? 'border-blue-200 bg-blue-50' : isOverdue ? 'border-red-200 bg-red-50' : isDueToday ? 'border-yellow-200 bg-yellow-50' : 'border-orange-200 bg-orange-50'}`}>
                           <div className="flex items-center justify-between">
                             <div className="flex-1">
                               <div className="flex items-center gap-3 mb-2">
                                 <h3 className="font-semibold text-lg">
                                   {loan.client?.full_name} - {loan.client?.dni}
                                 </h3>
                                                                   <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    isPending ? 'bg-blue-100 text-blue-800' :
                                    isOverdue ? 'bg-red-100 text-red-800' :
                                    isDueToday ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    {isPending ? 'Pendiente' : isOverdue ? 'Vencido' : isDueToday ? 'Vence Hoy' : 'Próximo a Vencer'}
                                  </span>
                                 {isOverdue && (
                                   <span className="text-xs text-red-600 font-medium">
                                     {Math.abs(diffDays)} día{diffDays !== 1 ? 's' : ''} de retraso
                                   </span>
                                 )}
                                                                   {isPending && (
                                    <span className="text-xs text-blue-600 font-medium">
                                      Préstamo pendiente de aprobación
                                    </span>
                                  )}
                                  {isDueSoon && !isDueToday && (
                                    <span className="text-xs text-orange-600 font-medium">
                                      Vence en {diffDays} día{diffDays !== 1 ? 's' : ''}
                                    </span>
                                  )}
                               </div>
                               
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4 text-sm text-gray-600">
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Balance Total:</span> 
                                   <span className="text-xs sm:text-sm font-semibold text-red-600">${loan.remaining_balance.toLocaleString()}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Cuota Mensual:</span> 
                                   <span className="text-xs sm:text-sm">${loan.monthly_payment.toLocaleString()}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Estado Cuota:</span> 
                                   <PaymentStatusBadge 
                                     loanId={loan.id}
                                     monthlyPayment={loan.monthly_payment}
                                     nextPaymentDate={loan.next_payment_date}
                                     remainingBalance={loan.remaining_balance}
                                   />
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Vence:</span> 
                                   <span className="text-xs sm:text-sm font-semibold">{new Date(loan.next_payment_date).toLocaleDateString()}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Tasa:</span> 
                                   <span className="text-xs sm:text-sm">{loan.interest_rate}%</span>
                                 </div>
                               </div>
                             </div>

                             <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
                               {loan.status === 'pending' ? (
                                 <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                                   <Button
                                     variant="default"
                                     size="sm"
                                     onClick={() => handleApproveLoan(loan.id)}
                                     className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                                   >
                                     <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Aprobar</span>
                                     <span className="hidden sm:inline">Aprobar</span>
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setShowUpdateForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Editar</span>
                                     <span className="hidden sm:inline">Editar</span>
                                   </Button>
                                   <Button
                                     variant="destructive"
                                     size="sm"
                                     onClick={() => handleCancelLoanClick(loan)}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Cancelar</span>
                                     <span className="hidden sm:inline">Cancelar</span>
                                   </Button>
                                 </div>
                               ) : loan.status === 'deleted' ? (
                                 <Button
                                   variant="default"
                                   size="sm"
                                   onClick={() => handleRecoverLoan(loan.id)}
                                   className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700"
                                 >
                                   <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                   <span className="sm:hidden">Recuperar</span>
                                   <span className="hidden sm:inline">Recuperar Préstamo</span>
                                 </Button>
                               ) : (
                                 <>
                                   <Button
                                     variant="default"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoanForPayment(loan);
                                       setShowPaymentForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                                   >
                                     <Receipt className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Pagar</span>
                                     <span className="hidden sm:inline">Registrar Pago</span>
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setShowUpdateForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Editar</span>
                                   </Button>
                                 </>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                     })}
              </div>
                 );
               })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
           {(() => {
             // Función para generar todos los pagos futuros de un préstamo
             const generateAllPayments = (loan: any) => {
               const payments = [];
               const startDate = new Date(loan.start_date);
               const today = new Date();
               
               // Determinar la frecuencia de pago
               const frequency = loan.payment_frequency || 'monthly';
               let intervalDays = 30; // mensual por defecto
               
               switch (frequency) {
                 case 'daily':
                   intervalDays = 1;
                   break;
                 case 'weekly':
                   intervalDays = 7;
                   break;
                 case 'biweekly':
                   intervalDays = 14;
                   break;
                 case 'monthly':
                   intervalDays = 30;
                   break;
               }
               
               // Generar pagos hasta completar el plazo del préstamo
               let currentPaymentDate = new Date(loan.next_payment_date || startDate);
               let paymentNumber = 1;
               const maxPayments = loan.term_months || 12;
               
               // Calcular cuántos pagos ya se han hecho
               const totalAmount = loan.total_amount || 0;
               const remainingBalance = loan.remaining_balance || totalAmount;
               const monthlyPayment = loan.monthly_payment || 0;
               const paidPayments = monthlyPayment > 0 ? Math.floor((totalAmount - remainingBalance) / monthlyPayment) : 0;
               
               // Ajustar el número de pago inicial
               paymentNumber = paidPayments + 1;
               
               while (paymentNumber <= maxPayments) {
                 // Solo incluir pagos futuros o del día actual
                 if (currentPaymentDate >= today || currentPaymentDate.toDateString() === today.toDateString()) {
                   payments.push({
                     ...loan,
                     payment_date: new Date(currentPaymentDate),
                     payment_number: paymentNumber,
                     is_last_payment: paymentNumber === maxPayments,
                     remaining_payments: maxPayments - paymentNumber + 1
                   });
                 }
                 
                 // Calcular siguiente fecha de pago
                 if (frequency === 'monthly') {
                   // Para pagos mensuales, mantener el día del mes
                   const nextMonth = new Date(currentPaymentDate);
                   nextMonth.setMonth(nextMonth.getMonth() + 1);
                   currentPaymentDate = nextMonth;
                 } else {
                   // Para otras frecuencias, agregar días
                   currentPaymentDate = new Date(currentPaymentDate);
                   currentPaymentDate.setDate(currentPaymentDate.getDate() + intervalDays);
                 }
                 paymentNumber++;
               }
               
               return payments;
             };

             // Generar todos los pagos futuros de todos los préstamos (excluyendo préstamos pagados)
             const allPayments = loans
               .filter(loan => loan.status !== 'paid' && loan.remaining_balance > 0)
               .flatMap(loan => generateAllPayments(loan));

             return (
               <>
                 {/* Stats Cards para Agenda */}
                 <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Cobros Hoy</CardTitle>
                 <Calendar className="h-4 w-4 text-blue-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-blue-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   return loan.status !== 'paid' && 
                          loan.remaining_balance > 0 &&
                          nextPayment.toDateString() === today.toDateString();
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Pagos programados</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
                 <Clock className="h-4 w-4 text-orange-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-orange-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfWeek = new Date(today);
                   endOfWeek.setDate(today.getDate() + 7);
                   return loan.status !== 'paid' && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfWeek;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Próximos 7 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Este Mes</CardTitle>
                 <Calendar className="h-4 w-4 text-green-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-green-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                   return loan.status !== 'paid' && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfMonth;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Próximos 30 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Monto a Cobrar</CardTitle>
                 <DollarSign className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">${loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                   return loan.status !== 'paid' && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfMonth;
                 }).reduce((sum, loan) => sum + loan.monthly_payment, 0).toLocaleString()}</div>
                 <p className="text-xs text-muted-foreground">Este mes</p>
               </CardContent>
             </Card>
           </div>

           {/* Calendario de Cobros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                 Calendario de Cobros
              </CardTitle>
            </CardHeader>
            <CardContent>
                                {loading ? (
                   <div className="text-center py-8 text-gray-500">Cargando agenda...</div>
                                  ) : (() => {
                   // Función para generar todos los pagos futuros de un préstamo
                   const generateAllPayments = (loan: any) => {
                     const payments = [];
                     const startDate = new Date(loan.start_date);
                     const today = new Date();
                     
                     // Determinar la frecuencia de pago
                     const frequency = loan.payment_frequency || 'monthly';
                     let intervalDays = 30; // mensual por defecto
                     
                     switch (frequency) {
                       case 'daily':
                         intervalDays = 1;
                         break;
                       case 'weekly':
                         intervalDays = 7;
                         break;
                       case 'biweekly':
                         intervalDays = 14;
                         break;
                       case 'monthly':
                         intervalDays = 30;
                         break;
                     }
                     
                     // Generar pagos hasta completar el plazo del préstamo
                     let currentPaymentDate = new Date(loan.next_payment_date || startDate);
                     let paymentNumber = 1;
                     const maxPayments = loan.term_months || 12;
                     
                     // Calcular cuántos pagos ya se han hecho
                     const totalAmount = loan.total_amount || 0;
                     const remainingBalance = loan.remaining_balance || totalAmount;
                     const monthlyPayment = loan.monthly_payment || 0;
                     const paidPayments = monthlyPayment > 0 ? Math.floor((totalAmount - remainingBalance) / monthlyPayment) : 0;
                     
                     // Ajustar el número de pago inicial
                     paymentNumber = paidPayments + 1;
                     
                     while (paymentNumber <= maxPayments) {
                       // Solo incluir pagos futuros o del día actual
                       if (currentPaymentDate >= today || currentPaymentDate.toDateString() === today.toDateString()) {
                         payments.push({
                           ...loan,
                           payment_date: new Date(currentPaymentDate),
                           payment_number: paymentNumber,
                           is_last_payment: paymentNumber === maxPayments,
                           remaining_payments: maxPayments - paymentNumber + 1
                         });
                       }
                       
                       // Calcular siguiente fecha de pago
                       if (frequency === 'monthly') {
                         // Para pagos mensuales, mantener el día del mes
                         const nextMonth = new Date(currentPaymentDate);
                         nextMonth.setMonth(nextMonth.getMonth() + 1);
                         currentPaymentDate = nextMonth;
                       } else {
                         // Para otras frecuencias, agregar días
                         currentPaymentDate = new Date(currentPaymentDate);
                         currentPaymentDate.setDate(currentPaymentDate.getDate() + intervalDays);
                       }
                       paymentNumber++;
                     }
                     
                     return payments;
                   };

                   // Generar fechas para el mes seleccionado
                   const today = new Date();
                   const currentMonth = currentViewMonth.getMonth();
                   const currentYear = currentViewMonth.getFullYear();
                   const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                   const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
                   
                   // Generar todos los pagos futuros de todos los préstamos
                   const allPayments = loans.flatMap(loan => generateAllPayments(loan));
                  
                  // Crear array de días del mes
                  const calendarDays = [];
                  
                  // Agregar días vacíos del inicio
                  for (let i = 0; i < firstDayOfMonth; i++) {
                    calendarDays.push(null);
                  }
                  
                  // Agregar días del mes
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, currentMonth, day);
                    const paymentsForDay = allPayments.filter(payment => {
                      return payment.payment_date.toDateString() === date.toDateString();
                    });
                    
                    calendarDays.push({
                      day,
                      date,
                      payments: paymentsForDay,
                      isToday: date.toDateString() === today.toDateString(),
                      isPast: date < today
                    });
                  }

                 return (
                   <div className="space-y-4">
                     {/* Navegación del mes */}
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => navigateMonth('prev')}
                           className="h-8 w-8 p-0"
                         >
                           <ChevronLeft className="h-4 w-4" />
                         </Button>
                         <h3 className="text-lg font-semibold min-w-[200px] text-center">
                           {currentViewMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                         </h3>
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => navigateMonth('next')}
                           className="h-8 w-8 p-0"
                         >
                           <ChevronRight className="h-4 w-4" />
                         </Button>
              </div>
                       <div className="flex items-center gap-2">
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={resetToCurrentMonth}
                           className="text-xs"
                         >
                           Hoy
                         </Button>
                         <div className="text-sm text-gray-600">
                           {allPayments.filter(payment => {
                             const paymentDate = payment.payment_date;
                             const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
                             return paymentDate >= new Date(currentYear, currentMonth, 1) && paymentDate <= endOfMonth;
                           }).length} cobros programados
                         </div>
                       </div>
                     </div>

                     {/* Calendario */}
                     <div className="grid grid-cols-7 gap-1">
                       {/* Días de la semana */}
                       {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                         <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 bg-gray-50">
                           {day}
                         </div>
                       ))}
                       
                       {/* Días del mes */}
                       {calendarDays.map((dayData, index) => (
                         <div
                           key={index}
                           className={`min-h-[80px] p-1 border ${
                             dayData === null ? 'bg-gray-50' :
                             dayData.isToday ? 'bg-blue-50 border-blue-200' :
                             dayData.isPast ? 'bg-gray-50' : 'bg-white'
                           }`}
                         >
                           {dayData && (
                             <>
                               <div className={`text-xs font-medium ${
                                 dayData.isToday ? 'text-blue-600' :
                                 dayData.isPast ? 'text-gray-400' : 'text-gray-900'
                               }`}>
                                 {dayData.day}
                               </div>
                               
                               {/* Cobros del día */}
                               {dayData.payments.length > 0 && (
                                 <div className="mt-1 space-y-1">
                                   {dayData.payments.slice(0, 2).map(payment => (
                                     <div
                                       key={`${payment.id}-${payment.payment_number}`}
                                       className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition-colors ${
                                         payment.is_last_payment 
                                           ? 'bg-purple-100 text-purple-800' 
                                           : 'bg-green-100 text-green-800'
                                       }`}
                                       onClick={() => {
                                         setSelectedLoanForPayment(payment);
                                         setShowPaymentForm(true);
                                       }}
                                       title={`${payment.client?.full_name} - Pago ${payment.payment_number}/${payment.term_months || 12} - $${payment.monthly_payment.toLocaleString()}${payment.is_last_payment ? ' (Último pago)' : ''}`}
                                     >
                                       <div className="font-medium truncate">{payment.client?.full_name?.split(' ')[0]}</div>
                                       <div className="text-xs flex justify-between">
                                         <span>${payment.monthly_payment.toLocaleString()}</span>
                                         <span className="opacity-70">#{payment.payment_number}</span>
                                       </div>
                                       {payment.is_last_payment && (
                                         <div className="text-xs font-bold">ÚLTIMO</div>
                                       )}
                                     </div>
                                   ))}
                                   {dayData.payments.length > 2 && (
                                     <div className="text-xs text-gray-500 text-center">
                                       +{dayData.payments.length - 2} más
                                     </div>
                                   )}
                                 </div>
                               )}
                             </>
                           )}
                         </div>
                       ))}
                     </div>

                     {/* Leyenda */}
                     <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mt-4">
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-blue-50 border border-blue-200 rounded"></div>
                         <span>Hoy</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-green-100 rounded"></div>
                         <span>Cobro programado</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-purple-100 rounded"></div>
                         <span>Último pago</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-gray-50 rounded"></div>
                         <span>Día pasado</span>
                       </div>
                     </div>
                   </div>
                 );
               })()}
             </CardContent>
           </Card>

           {/* Lista de Próximos Cobros */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center">
                 <Clock className="h-5 w-5 mr-2" />
                 Próximos Cobros
              </CardTitle>
            </CardHeader>
            <CardContent>
               {(() => {
                 // Usar los pagos generados para la lista de próximos cobros
                 const upcomingPayments = allPayments
                   .sort((a, b) => a.payment_date.getTime() - b.payment_date.getTime())
                   .slice(0, 10); // Mostrar solo los próximos 10

                 if (upcomingPayments.length === 0) {
                   return (
                     <div className="text-center py-8 text-gray-500">
                       <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                       <h3 className="text-lg font-medium mb-2">No hay cobros programados</h3>
                       <p className="text-gray-600">Todos los préstamos están al día</p>
                     </div>
                   );
                 }

                 return (
                   <div className="space-y-3">
                     {upcomingPayments.map((payment) => {
                       const paymentDate = payment.payment_date;
                       const today = new Date();
                       const diffDays = Math.ceil((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                       const isToday = diffDays === 0;
                       const isTomorrow = diffDays === 1;

                       return (
                         <div key={`${payment.id}-${payment.payment_number}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                           <div className="flex-1">
                             <div className="flex items-center gap-3">
                               <h4 className="font-medium">{payment.client?.full_name}</h4>
                               <span className={`px-2 py-1 rounded text-xs font-medium ${
                                 payment.is_last_payment ? 'bg-purple-100 text-purple-800' :
                                 isToday ? 'bg-blue-100 text-blue-800' :
                                 isTomorrow ? 'bg-orange-100 text-orange-800' :
                                 'bg-gray-100 text-gray-800'
                               }`}>
                                 {payment.is_last_payment ? 'Último pago' :
                                  isToday ? 'Hoy' : 
                                  isTomorrow ? 'Mañana' : 
                                  `En ${diffDays} días`}
                               </span>
                             </div>
                             <div className="text-sm text-gray-600 mt-1">
                               <span className="font-medium">${payment.monthly_payment.toLocaleString()}</span> • 
                               Pago {payment.payment_number}/{payment.term_months || 12} • 
                               {paymentDate.toLocaleDateString('es-ES', { 
                                 weekday: 'long', 
                                 year: 'numeric', 
                                 month: 'long', 
                                 day: 'numeric' 
                               })}
                             </div>
                           </div>
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => {
                               setSelectedLoanForPayment(payment);
                               setShowPaymentForm(true);
                             }}
                             className="ml-4"
                           >
                             <Receipt className="h-4 w-4 mr-2" />
                             Cobrar
                           </Button>
                         </div>
                       );
                     })}
              </div>
                 );
               })()}
            </CardContent>
          </Card>
                 </>
               );
             })()}
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

     {/* Loan Statistics */}
     {selectedLoan && (
       <LoanStatistics
         loanId={selectedLoan.id}
         isOpen={showStatistics}
         onClose={() => {
           setShowStatistics(false);
           setSelectedLoan(null);
         }}
       />
     )}

     {/* Dialog de Confirmación de Cancelación */}
     <Dialog 
       open={showCancelDialog} 
       onOpenChange={(open) => {
         if (!open) {
           setShowCancelDialog(false);
           setLoanToCancel(null);
           setIsCancelling(false);
         }
       }}
     >
       <DialogContent>
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <AlertCircle className="h-5 w-5 text-red-600" />
             Confirmar Cancelación
           </DialogTitle>
         </DialogHeader>
         <div className="space-y-4">
           <p className="text-gray-600">
             ¿Estás seguro de que deseas cancelar el préstamo de{' '}
             <span className="font-semibold">{loanToCancel?.client?.full_name}</span>?
           </p>
           <div className="bg-red-50 border border-red-200 rounded-lg p-3">
             <div className="flex items-center gap-2 text-red-800">
               <AlertCircle className="h-4 w-4" />
               <div>
                 <span className="font-semibold">⚠️ ADVERTENCIA</span>
                 <p className="text-sm mt-1">
                   • El préstamo será marcado como cancelado<br/>
                   • Se puede recuperar durante 2 meses<br/>
                   • Después de 2 meses se eliminará permanentemente
                 </p>
               </div>
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <Button 
               variant="outline" 
               onClick={() => {
                 setShowCancelDialog(false);
                 setLoanToCancel(null);
                 setIsCancelling(false);
               }}
               disabled={isCancelling}
             >
               Cancelar
             </Button>
             <Button 
               variant="destructive" 
               onClick={handleCancelLoan}
               disabled={isCancelling}
             >
               {isCancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
             </Button>
           </div>
         </div>
       </DialogContent>
     </Dialog>

     {/* Modal de Selección de Solicitudes */}
     <Dialog open={showRequestSelector} onOpenChange={setShowRequestSelector}>
       <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>Seleccionar Solicitud para Crear Préstamo</DialogTitle>
         </DialogHeader>
         <div className="space-y-4">
           {requests.length === 0 ? (
             <div className="text-center py-8">
               <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
               <p className="text-gray-500">No hay solicitudes aprobadas disponibles</p>
             </div>
           ) : (
             <div className="grid gap-4">
               {requests.map((request) => (
                 <Card key={request.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                   <CardContent className="p-4">
                     <div className="flex justify-between items-start">
                       <div className="space-y-2 flex-1">
                         <div className="flex items-center space-x-3">
                           <Users className="h-4 w-4 text-gray-500" />
                           <h3 className="font-medium">{request.clients?.full_name}</h3>
                           <Badge variant="outline" className="text-green-600 border-green-600">
                             Aprobada
                           </Badge>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                           <div className="flex items-center">
                             <DollarSign className="h-3 w-3 mr-1" />
                             Solicita: ${request.requested_amount.toLocaleString()}
                           </div>
                           <div className="flex items-center">
                             <Clock className="h-3 w-3 mr-1" />
                             {new Date(request.created_at).toLocaleDateString()}
                           </div>
                           {request.clients?.credit_score && (
                             <div className="flex items-center">
                               <AlertCircle className="h-3 w-3 mr-1" />
                               Score: {request.clients.credit_score}
                             </div>
                           )}
                         </div>
                         {request.purpose && (
                           <p className="text-sm text-gray-600">
                             <strong>Propósito:</strong> {request.purpose}
                           </p>
                         )}
                         {request.monthly_income && (
                           <p className="text-sm text-gray-600">
                             <strong>Ingresos:</strong> ${request.monthly_income.toLocaleString()}/mes
                           </p>
                         )}
                       </div>
                       <Button 
                         onClick={() => handleSelectRequestForLoan(request)}
                         className="ml-4"
                       >
                         <ArrowRight className="h-4 w-4 mr-1" />
                         Usar Solicitud
                       </Button>
                     </div>
                   </CardContent>
                 </Card>
               ))}
             </div>
           )}
         </div>
       </DialogContent>
     </Dialog>
   </div>
 );
};
