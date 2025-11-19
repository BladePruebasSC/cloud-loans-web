
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Users,
  CreditCard,
  DollarSign,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  PiggyBank,
  BarChart3,
  ShieldCheck
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval, isSameMonth } from 'date-fns';

type DashboardStat = {
  title: string;
  value: string;
  description: string;
  icon: typeof Users;
  color: string;
  bgColor: string;
};

type GeneralStatCard = {
  title: string;
  value: string;
  detail: string;
  badge: string;
  icon: typeof Users;
  badgeColor: string;
  accent: string;
};

type LoanRecord = {
  id: string;
  amount: number;
  remaining_balance: number;
  status: string;
  total_amount: number;
  next_payment_date: string | null;
  clients?:
    | {
        full_name?: string | null;
      }
    | {
        full_name?: string | null;
      }[]
    | null;
};

type PaymentRecord = {
  amount: number | null;
  interest_amount: number | null;
  created_at?: string | null;
};

type SaleRecord = {
  total_amount?: number | null;
  total_price?: number | null;
  amount?: number | null;
  total?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  status?: string | null;
  created_at?: string | null;
  sale_date?: string | null;
};

type PortfolioInsights = {
  totalCollected: number;
  totalPosSales: number;
  totalIncome: number;
  collectionRate: number;
  averageTicket: number;
  delinquentLoans: number;
  dueThisWeek: number;
  upcomingPayments: {
    id: string;
    clientName: string;
    amount: number;
    nextPaymentDate: string;
  }[];
  monthlyCollected: number;
  monthlyPosSales: number;
  monthlyIncome: number;
  monthlyInterest: number;
  totalLent: number;
  totalBalance: number;
  totalInterest: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    maximumFractionDigits: 0
  }).format(value || 0);

const getSaleAmount = (sale: SaleRecord) => {
  if (typeof sale.total_amount === 'number') return sale.total_amount;
  if (typeof sale.total_price === 'number') return sale.total_price;
  if (typeof sale.total === 'number') return sale.total;
  if (typeof sale.amount === 'number') return sale.amount;
  if (typeof sale.quantity === 'number' && typeof sale.unit_price === 'number') {
    return sale.quantity * sale.unit_price;
  }
  return 0;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, companyId } = useAuth();
  const [stats, setStats] = useState<DashboardStat[]>([
    {
      title: 'Total Clientes',
      value: '0',
      description: 'Clientes registrados',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      title: 'Préstamos Activos',
      value: '0',
      description: 'Préstamos en curso',
      icon: CreditCard,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
    {
      title: 'Total Prestado',
      value: '$0',
      description: 'Capital total prestado',
      icon: DollarSign,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100'
    },
    {
      title: 'Ganancias',
      value: '$0',
      description: 'Intereses cobrados',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    }
  ]);
  const [loading, setLoading] = useState(true);
  const [companyName, setCompanyName] = useState('');
  const [onboardingStatus, setOnboardingStatus] = useState({
    companyConfigured: false,
    hasClients: false,
    hasLoans: false
  });
  const [portfolioInsights, setPortfolioInsights] = useState<PortfolioInsights>({
    totalCollected: 0,
    totalPosSales: 0,
    totalIncome: 0,
    collectionRate: 0,
    averageTicket: 0,
    delinquentLoans: 0,
    dueThisWeek: 0,
    upcomingPayments: [],
    monthlyCollected: 0,
    monthlyPosSales: 0,
    monthlyIncome: 0,
    monthlyInterest: 0,
    totalLent: 0,
    totalBalance: 0,
    totalInterest: 0
  });

  useEffect(() => {
    if (user && companyId) {
      fetchDashboardData(companyId);
    }
  }, [user, companyId]);

  const getClientDisplayName = (loan: LoanRecord) => {
    if (!loan.clients) return 'Cliente sin nombre';
    if (Array.isArray(loan.clients)) {
      return loan.clients[0]?.full_name || 'Cliente sin nombre';
    }
    return loan.clients.full_name || 'Cliente sin nombre';
  };

  const fetchDashboardData = async (ownerCompanyId: string) => {
    try {
      setLoading(true);

      const [
        { data: companySettings, error: companySettingsError },
        { data: clientsData, error: clientsError },
        { data: loansData, error: loansError },
        { data: paymentsData, error: paymentsError },
        { data: salesData, error: salesError }
      ] = await Promise.all([
        supabase
          .from('company_settings')
          .select('company_name, phone')
          .eq('user_id', ownerCompanyId)
          .maybeSingle(),
        supabase.from('clients').select('id, status').eq('user_id', ownerCompanyId),
        supabase
          .from('loans')
          .select('id, amount, remaining_balance, status, total_amount, next_payment_date, clients(full_name)')
          .eq('loan_officer_id', ownerCompanyId),
        supabase
          .from('payments')
          .select('amount, interest_amount, created_at')
          .eq('created_by', ownerCompanyId)
          .eq('status', 'paid'),
        supabase
          .from('sales')
          .select('*')
          .eq('user_id', ownerCompanyId)
      ]);

      if (companySettingsError) throw companySettingsError;
      if (clientsError) throw clientsError;
      if (loansError) throw loansError;
      if (paymentsError) throw paymentsError;
      if (salesError) throw salesError;

      if (companySettings?.company_name) {
        setCompanyName(companySettings.company_name);
      }

      const totalClients = clientsData?.length || 0;
      const activeClients = clientsData?.filter((client) => client.status === 'active').length || 0;

      const totalLoans = loansData?.length || 0;
      const activeLoans = loansData?.filter((loan) => loan.status === 'active').length || 0;
      // Contar préstamos en mora (estados que indican mora pero que aún no están cancelados)
      const delinquentLoans =
        loansData?.filter((loan) => ['late', 'delinquent', 'past_due'].includes(loan.status)).length || 0;

      // Filtrar solo préstamos activos para cálculos de cartera activa
      const activeLoansForBalance = loansData?.filter((loan) => loan.status === 'active') || [];
      
      const totalLent = loansData?.reduce((sum, loan) => sum + (loan.amount || 0), 0) || 0;
      const totalBalance = activeLoansForBalance.reduce((sum, loan) => sum + (loan.remaining_balance || 0), 0) || 0;

      const totalCollected =
        paymentsData?.reduce((sum, payment) => sum + (payment.amount ?? 0), 0) || 0;
      const totalInterest =
        paymentsData?.reduce((sum, payment) => sum + (payment.interest_amount ?? 0), 0) || 0;

      const currentWeek = {
        start: startOfWeek(new Date(), { weekStartsOn: 1 }),
        end: endOfWeek(new Date(), { weekStartsOn: 1 })
      };

      // Filtrar solo préstamos activos para cálculos de pagos
      const activeLoansData = loansData?.filter((loan) => loan.status === 'active') || [];

      const dueThisWeek =
        activeLoansData.filter(
          (loan) =>
            loan.next_payment_date &&
            isWithinInterval(parseISO(loan.next_payment_date), currentWeek)
        ).length || 0;

      const upcomingPayments =
        activeLoansData
          .filter((loan) => Boolean(loan.next_payment_date))
          .sort(
            (a, b) =>
              new Date(a.next_payment_date as string).getTime() -
              new Date(b.next_payment_date as string).getTime()
          )
          .slice(0, 4)
          .map((loan) => {
            const normalizedLoan = loan as LoanRecord & { next_payment_date: string };
            return {
              id: normalizedLoan.id,
              clientName: getClientDisplayName(normalizedLoan),
              amount: normalizedLoan.remaining_balance || normalizedLoan.amount || 0,
              nextPaymentDate: normalizedLoan.next_payment_date
            };
          }) || [];

      const monthlyCollected =
        paymentsData
          ?.filter((payment) => payment.created_at && isSameMonth(parseISO(payment.created_at), new Date()))
          .reduce((sum, payment) => sum + (payment.amount ?? 0), 0) || 0;

      const monthlyInterest =
        paymentsData
          ?.filter((payment) => payment.created_at && isSameMonth(parseISO(payment.created_at), new Date()))
          .reduce((sum, payment) => sum + (payment.interest_amount ?? 0), 0) || 0;

      const relevantSales = (salesData || []).filter(
        (sale) => !sale.status || sale.status === 'completed'
      );

      const totalPosSales = relevantSales.reduce((sum, sale) => sum + getSaleAmount(sale), 0);

      const monthlyPosSales =
        relevantSales
          ?.filter((sale) => {
            const referenceDate = sale.sale_date || sale.created_at;
            return referenceDate ? isSameMonth(parseISO(referenceDate), new Date()) : false;
          })
          .reduce((sum, sale) => sum + getSaleAmount(sale), 0) || 0;

      const totalIncome = totalCollected + totalPosSales;
      const monthlyIncome = monthlyCollected + monthlyPosSales;

      const collectionRate = totalLent > 0 ? Math.min(100, (totalCollected / totalLent) * 100) : 0;
      const averageTicket = activeLoans > 0 ? totalLent / activeLoans : 0;

      setStats([
        {
          title: 'Total Clientes',
          value: totalClients.toString(),
          description: `${activeClients} activos`,
          icon: Users,
          color: 'text-blue-600',
          bgColor: 'bg-blue-100'
        },
        {
          title: 'Préstamos Activos',
          value: activeLoans.toString(),
          description: `${totalLoans} totales`,
          icon: CreditCard,
          color: 'text-green-600',
          bgColor: 'bg-green-100'
        },
        {
          title: 'Total Prestado',
          value: formatCurrency(totalLent),
          description: `Balance: ${formatCurrency(totalBalance)}`,
          icon: DollarSign,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100'
        },
        {
          title: 'Ganancias',
          value: formatCurrency(totalInterest),
          description: 'Intereses cobrados',
          icon: TrendingUp,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100'
        }
      ]);

      setOnboardingStatus({
        companyConfigured: Boolean(companySettings?.company_name && companySettings?.phone),
        hasClients: totalClients > 0,
        hasLoans: totalLoans > 0
      });

      setPortfolioInsights({
        totalCollected,
        totalPosSales,
        totalIncome,
        collectionRate,
        averageTicket,
        delinquentLoans,
        dueThisWeek,
        upcomingPayments,
        monthlyCollected,
        monthlyPosSales,
        monthlyIncome,
        monthlyInterest,
        totalLent,
        totalBalance,
        totalInterest
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast.error('Error al cargar estadísticas');
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    {
      title: 'Crear Cliente',
      description: 'Registra un nuevo cliente',
      action: () => navigate('/clientes/nuevo'),
      icon: Users,
      color: 'bg-blue-600 hover:bg-blue-700'
    },
    {
      title: 'Nuevo Préstamo',
      description: 'Crear un préstamo',
      action: () => navigate('/prestamos/nuevo'),
      icon: CreditCard,
      color: 'bg-green-600 hover:bg-green-700'
    },
    {
      title: 'Registrar Pago',
      description: 'Registrar un pago',
      action: () => navigate('/prestamos'),
      icon: DollarSign,
      color: 'bg-yellow-600 hover:bg-yellow-700'
    }
  ];

  const showOnboarding =
    !onboardingStatus.companyConfigured || !onboardingStatus.hasClients || !onboardingStatus.hasLoans;

  const generalStats: GeneralStatCard[] = [
    {
      title: 'Cartera activa',
      value: formatCurrency(portfolioInsights.totalBalance),
      detail: `${portfolioInsights.delinquentLoans} préstamos en mora`,
      badge: 'Préstamos',
      icon: CreditCard,
      badgeColor: 'bg-emerald-50 text-emerald-700',
      accent: 'text-emerald-600'
    },
    {
      title: 'Ingresos del mes',
      value: formatCurrency(portfolioInsights.monthlyIncome),
      detail: `POS: ${formatCurrency(portfolioInsights.monthlyPosSales)} • Préstamos: ${formatCurrency(
        portfolioInsights.monthlyCollected
      )}`,
      badge: 'Cobros',
      icon: PiggyBank,
      badgeColor: 'bg-amber-50 text-amber-700',
      accent: 'text-amber-600'
    },
    {
      title: 'Salud general',
      value: `${portfolioInsights.collectionRate.toFixed(1)}%`,
      detail: `${portfolioInsights.dueThisWeek} pagos esta semana`,
      badge: 'Seguimiento',
      icon: ShieldCheck,
      badgeColor: 'bg-sky-50 text-sky-700',
      accent: 'text-sky-600'
    }
  ];

  const onboardingSteps = [
    {
      title: 'Configura tu empresa',
      description: 'Datos generales, logo y canales de contacto',
      action: () => navigate('/mi-empresa'),
      completed: onboardingStatus.companyConfigured
    },
    {
      title: 'Crea tu primer cliente',
      description: 'Agrega información básica y referencias',
      action: () => navigate('/clientes/nuevo'),
      completed: onboardingStatus.hasClients
    },
    {
      title: 'Otorga un préstamo',
      description: 'Define monto, tasa y calendario de pagos',
      action: () => navigate('/prestamos/nuevo'),
      completed: onboardingStatus.hasLoans
    }
  ];

  if (loading) {
    return (
      <div className="pt-4 pb-4 px-4 sm:pt-8 sm:pb-6 sm:px-6">
        <Card className="animate-pulse">
          <CardHeader>
            <CardTitle>Cargando dashboard...</CardTitle>
            <CardDescription>Estamos obteniendo tus métricas en tiempo real.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-32 bg-gray-100 rounded-lg" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pt-4 pb-4 px-4 sm:pt-8 sm:pb-6 sm:px-6 lg:px-8 space-y-5 sm:space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 uppercase tracking-wide">Panel general</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">
            Bienvenido a ProPréstamos
          </h1>
          {companyName && (
            <p className="text-sm text-gray-500 mt-1">
              {companyName} • {new Date().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          )}
        </div>
        <Button onClick={() => navigate('/mi-empresa')} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Configurar Empresa
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-4 overflow-x-auto pb-2 hide-scrollbar sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible sm:pb-0">
        {quickActions.map((action, index) => (
          <Card key={index} className="hover:shadow-lg transition-shadow h-full">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <action.icon className="h-5 w-5" />
                <span>{action.title}</span>
              </CardTitle>
              <CardDescription>{action.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={action.action} className={`w-full text-white ${action.color}`}>
                Comenzar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {showOnboarding ? (
        <Card>
          <CardHeader>
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>
              Completa estos pasos para desbloquear las estadísticas avanzadas del tablero.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.title}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {step.title}
                      {step.completed && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                    </h3>
                    <p className="text-sm text-gray-600">{step.description}</p>
                  </div>
                </div>
                <Button
                  variant={step.completed ? 'secondary' : 'outline'}
                  onClick={step.action}
                  className="w-full sm:w-auto"
                >
                  {step.completed ? 'Completado' : 'Ir ahora'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-4 overflow-x-auto hide-scrollbar sm:grid-flow-row sm:auto-cols-auto sm:grid-cols-2 md:grid-cols-3 sm:overflow-visible">
            {generalStats.map((card) => (
              <Card key={card.title} className="overflow-hidden h-full">
                <CardHeader className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p
                      className={`text-xs font-semibold uppercase tracking-wide rounded-full px-3 py-1 inline-flex items-center gap-2 ${card.badgeColor}`}
                    >
                      <card.icon className={`h-4 w-4 ${card.accent}`} />
                      {card.badge}
                    </p>
                    <BarChart3 className="h-4 w-4 text-gray-300" />
                  </div>
                  <CardTitle>{card.title}</CardTitle>
                  <p className="text-3xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-sm text-gray-500">{card.detail}</p>
                </CardHeader>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle>Resumen financiero</CardTitle>
                  <CardDescription>Rendimiento consolidado de préstamos y cobros.</CardDescription>
                </div>
                <span className="inline-flex items-center text-xs font-medium text-teal-700 bg-teal-50 px-3 py-1 rounded-full">
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  {portfolioInsights.collectionRate.toFixed(1)}% tasa de cobro
                </span>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-500">Capital prestado</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">
                      {formatCurrency(portfolioInsights.totalLent)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Balance vivo: {formatCurrency(portfolioInsights.totalBalance)}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-500">Ingresos cobrados</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">
                    {formatCurrency(portfolioInsights.totalIncome)}
                    </p>
                  <p className="text-xs text-gray-500 mt-1">
                    POS acumulado: {formatCurrency(portfolioInsights.totalPosSales)}
                  </p>
                  <p className="text-xs text-gray-500">
                    Préstamos cobrados: {formatCurrency(portfolioInsights.totalCollected)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Interés acumulado: {formatCurrency(portfolioInsights.totalInterest)}
                  </p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-100">
                    <p className="text-sm text-gray-500">Ticket promedio</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">
                      {formatCurrency(portfolioInsights.averageTicket)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Basado en préstamos activos</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Ventas / Cobros del mes</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                    {formatCurrency(portfolioInsights.monthlyIncome)}
                    </p>
                  <p className="text-sm text-gray-600">
                    POS del mes: {formatCurrency(portfolioInsights.monthlyPosSales)} • Préstamos: {formatCurrency(
                      portfolioInsights.monthlyCollected
                    )}
                  </p>
                  <p className="text-sm text-gray-600">
                    Intereses del mes: {formatCurrency(portfolioInsights.monthlyInterest)}
                  </p>
                  </div>
                  <div className="p-4 rounded-lg bg-gray-50">
                    <p className="text-sm text-gray-500 uppercase tracking-wide">Salud de la cartera</p>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <p className="text-3xl font-bold text-gray-900">{portfolioInsights.collectionRate.toFixed(1)}%</p>
                        <p className="text-sm text-gray-600">Tasa de cobro</p>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-bold text-gray-900">{portfolioInsights.delinquentLoans}</p>
                        <p className="text-sm text-gray-600">Préstamos en mora</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Próximos pagos</CardTitle>
                <CardDescription>
                  {portfolioInsights.dueThisWeek} compromisos esta semana
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {portfolioInsights.upcomingPayments.length === 0 ? (
                  <div className="flex items-center gap-3 text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
                    <AlertCircle className="h-5 w-5 text-gray-400" />
                    No hay pagos próximos registrados.
                  </div>
                ) : (
                  portfolioInsights.upcomingPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="border border-gray-100 rounded-lg p-4 flex items-start justify-between"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{payment.clientName}</p>
                        <p className="text-sm text-gray-500 flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {format(parseISO(payment.nextPaymentDate), "dd 'de' MMMM")}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
