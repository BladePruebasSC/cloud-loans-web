
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, CreditCard, DollarSign, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, companyId, profile } = useAuth();
  const [stats, setStats] = useState([
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
      description: 'Ganancias totales',
      icon: TrendingUp,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    }
  ]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 Dashboard useEffect - user:', user?.email);
    console.log('🔍 Dashboard useEffect - companyId:', companyId);
    console.log('🔍 Dashboard useEffect - profile:', profile);
    
    if (user && companyId) {
      fetchDashboardData(companyId);
    }
  }, [user, companyId, profile]);

  const fetchDashboardData = async (companyId: string) => {
    console.log('🔍 Dashboard: Iniciando fetchDashboardData');
    console.log('🔍 Dashboard: companyId =', companyId);
    console.log('🔍 Dashboard: user =', user);
    
    try {
      setLoading(true);
      

      
      // Verificar qué empresas existen con códigos similares
      console.log('🔍 Dashboard: Verificando empresas con códigos similares...');
      const { data: allCompanies, error: companiesError } = await supabase
        .from('company_settings')
        .select('user_id, company_name, company_code')
        .ilike('company_code', '%C699%');
      
      // DIAGNÓSTICO AVANZADO: Verificar todas las empresas
      console.log('🔍 DIAGNÓSTICO AVANZADO: Verificando todas las empresas...');
      const { data: allCompanySettings, error: allCompanySettingsError } = await supabase
        .from('company_settings')
        .select('user_id, company_name, company_code')
        .limit(10);
      
      console.log('🔍 DIAGNÓSTICO AVANZADO: Todas las empresas:', JSON.stringify(allCompanySettings, null, 2));
      
      console.log('🔍 Dashboard: Empresas encontradas con códigos similares:', JSON.stringify(allCompanies, null, 2));
      
      // Verificar todos los empleados de este usuario
      console.log('🔍 Dashboard: Verificando todos los empleados de este usuario...');
      const { data: allUserEmployees, error: employeesError } = await supabase
        .from('employees')
        .select('id, full_name, email, company_owner_id, status')
        .eq('auth_user_id', user.id);
      
      console.log('🔍 Dashboard: Todos los empleados de este usuario:', JSON.stringify(allUserEmployees, null, 2));
      
      // Verificar clientes y préstamos para cada empresa de este usuario
      if (allUserEmployees && allUserEmployees.length > 0) {
        for (const employee of allUserEmployees) {
          console.log(`🔍 Dashboard: Verificando empresa ${employee.company_owner_id} para empleado ${employee.full_name}...`);
          
                       // Buscar clientes de esta empresa
             const { data: companyClients, error: companyClientsError } = await supabase
               .from('clients')
               .select('id, full_name, status')
               .eq('user_id', employee.company_owner_id);
             
             console.log(`🔍 Dashboard: Clientes en empresa ${employee.company_owner_id}:`, companyClients?.length || 0);
             console.log(`🔍 Dashboard: Detalles de clientes:`, companyClients);
             
             // Buscar préstamos de esta empresa
             const { data: companyLoans, error: companyLoansError } = await supabase
               .from('loans')
               .select('id, amount, status')
               .eq('loan_officer_id', employee.company_owner_id);
             
             console.log(`🔍 Dashboard: Préstamos en empresa ${employee.company_owner_id}:`, companyLoans?.length || 0);
             console.log(`🔍 Dashboard: Detalles de préstamos:`, companyLoans);
        }
      }
      
      // DIAGNÓSTICO AVANZADO: Verificar todos los clientes y préstamos
      console.log('🔍 DIAGNÓSTICO AVANZADO: Verificando todos los clientes en la base de datos...');
      const { data: allClients, error: allClientsError } = await supabase
        .from('clients')
        .select('id, full_name, status, user_id')
        .limit(10);
      
      console.log('🔍 DIAGNÓSTICO AVANZADO: Todos los clientes:', JSON.stringify(allClients, null, 2));
      
      console.log('🔍 DIAGNÓSTICO AVANZADO: Verificando todos los préstamos en la base de datos...');
      const { data: allLoans, error: allLoansError } = await supabase
        .from('loans')
        .select('id, amount, status, loan_officer_id')
        .limit(10);
      
      console.log('🔍 DIAGNÓSTICO AVANZADO: Todos los préstamos:', JSON.stringify(allLoans, null, 2));
      
      // Obtener total de clientes
      console.log('🔍 Dashboard: Buscando clientes con user_id =', companyId);
      console.log('🔍 Dashboard: Tipo de companyId =', typeof companyId);
      console.log('🔍 Dashboard: Longitud de companyId =', companyId?.length);
      console.log('🔍 Dashboard: Usuario actual:', user?.email);
      
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Antes de consultar clientes');
      console.log('🔍 DASHBOARD DIAGNÓSTICO: companyId =', companyId);
      console.log('🔍 DASHBOARD DIAGNÓSTICO: user =', user?.email);
      
      // SOLUCIÓN SIMPLE: Usar el companyId directamente
      const ownerUserId = companyId;
      console.log('🔧 SOLUCIÓN SIMPLE: Usando companyId como ownerUserId:', ownerUserId);
      

      
      const { data: clientsData, error: clientsError } = await supabase
        .from('clients')
        .select('id, status, monthly_income')
        .eq('user_id', ownerUserId);
      
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Después de consultar clientes');
      console.log('🔍 DASHBOARD DIAGNÓSTICO: clientsData =', clientsData);
      console.log('🔍 DASHBOARD DIAGNÓSTICO: clientsError =', clientsError);
      
      // DIAGNÓSTICO: Verificar qué user_id tienen los clientes
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Verificando user_id de todos los clientes...');
      const { data: allClientsWithUserId, error: allClientsWithUserIdError } = await supabase
        .from('clients')
        .select('id, full_name, user_id')
        .limit(5);
      
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Todos los clientes con user_id:', allClientsWithUserId);
      
      if (clientsError) {
        console.error('❌ Dashboard: Error al buscar clientes:', clientsError);
        throw clientsError;
      }
      
      console.log('🔍 Dashboard: Clientes encontrados:', clientsData?.length || 0);
      
      // Obtener préstamos activos
      console.log('🔍 Dashboard: Buscando préstamos con loan_officer_id =', companyId);
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Antes de consultar préstamos');
      console.log('🔍 DASHBOARD DIAGNÓSTICO: companyId para préstamos =', companyId);
      
      const { data: loansData, error: loansError } = await supabase
        .from('loans')
        .select('id, amount, remaining_balance, status, total_amount')
        .eq('loan_officer_id', companyId)
        .eq('status', 'active');
      
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Después de consultar préstamos');
      console.log('🔍 DASHBOARD DIAGNÓSTICO: loansData =', loansData);
      console.log('🔍 DASHBOARD DIAGNÓSTICO: loansError =', loansError);
      
      // DIAGNÓSTICO: Verificar qué loan_officer_id tienen los préstamos
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Verificando loan_officer_id de todos los préstamos...');
      const { data: allLoansWithLoanOfficerId, error: allLoansWithLoanOfficerIdError } = await supabase
        .from('loans')
        .select('id, amount, loan_officer_id')
        .limit(5);
      
      console.log('🔍 DASHBOARD DIAGNÓSTICO: Todos los préstamos con loan_officer_id:', allLoansWithLoanOfficerId);
      
      if (loansError) {
        console.error('❌ Dashboard: Error al buscar préstamos:', loansError);
        throw loansError;
      }
      
      console.log('🔍 Dashboard: Préstamos encontrados:', loansData?.length || 0);
      
      // Obtener pagos para calcular ganancias
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, interest_amount')
        .eq('created_by', ownerUserId)
        .eq('status', 'paid');
      
      if (paymentsError) throw paymentsError;
      
      // Calcular estadísticas
      const totalClients = clientsData?.length || 0;
      const activeClients = clientsData?.filter(c => c.status === 'active').length || 0;
      const activeLoans = loansData?.length || 0;
      const totalLent = loansData?.reduce((sum, loan) => sum + loan.amount, 0) || 0;
      const totalBalance = loansData?.reduce((sum, loan) => sum + loan.remaining_balance, 0) || 0;
      const totalInterest = paymentsData?.reduce((sum, payment) => sum + payment.interest_amount, 0) || 0;
      
      // Actualizar estadísticas
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
          description: 'Préstamos en curso',
          icon: CreditCard,
          color: 'text-green-600',
          bgColor: 'bg-green-100'
        },
        {
          title: 'Total Prestado',
          value: `$${totalLent.toLocaleString()}`,
          description: `Balance: $${totalBalance.toLocaleString()}`,
          icon: DollarSign,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100'
        },
        {
          title: 'Ganancias',
          value: `$${totalInterest.toLocaleString()}`,
          description: 'Intereses cobrados',
          icon: TrendingUp,
          color: 'text-purple-600',
          bgColor: 'bg-purple-100'
        }
      ]);
      
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

  return (
    <div className="pt-4 pb-4 px-4 sm:pt-8 sm:pb-6 sm:px-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">Bienvenido a PrestamosFácil</h1>
        <Button onClick={() => navigate('/mi-empresa')} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Configurar Empresa
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {quickActions.map((action, index) => (
          <Card key={index} className="cursor-pointer hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <action.icon className="h-5 w-5" />
                <span>{action.title}</span>
              </CardTitle>
              <CardDescription>
                {action.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={action.action}
                className={`w-full text-white ${action.color}`}
              >
                Comenzar
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Getting Started */}
      <Card>
        <CardHeader>
          <CardTitle>Primeros Pasos</CardTitle>
          <CardDescription>
            Sigue estos pasos para comenzar a usar el sistema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Configurar tu empresa</h3>
              <p className="text-sm text-gray-600">Añade información de tu empresa, logo y datos de contacto</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/mi-empresa')} className="w-full sm:w-auto">
              Configurar
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div className="flex-1">
              <h3 className="font-medium">Crear tu primer cliente</h3>
              <p className="text-sm text-gray-600">Registra la información de tu primer cliente</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/clientes/nuevo')} className="w-full sm:w-auto">
              Crear Cliente
            </Button>
          </div>
          
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              3
            </div>
            <div>
              <h3 className="font-medium">Otorgar tu primer préstamo</h3>
              <p className="text-sm text-gray-600">Crea un préstamo para tu cliente</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/prestamos/nuevo')}>
              Crear Préstamo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
