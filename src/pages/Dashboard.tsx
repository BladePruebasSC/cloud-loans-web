
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Users, CreditCard, DollarSign, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();

  const stats = [
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
  ];

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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Bienvenido a PrestamosFácil</h1>
        <Button onClick={() => navigate('/empresa')}>
        <Button onClick={() => navigate('/mi-empresa')}>
          <Plus className="h-4 w-4 mr-2" />
          Configurar Empresa
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              1
            </div>
            <div>
              <h3 className="font-medium">Configurar tu empresa</h3>
              <p className="text-sm text-gray-600">Añade información de tu empresa, logo y datos de contacto</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/empresa')}>
            <Button variant="outline" onClick={() => navigate('/mi-empresa')}>
              Configurar
            </Button>
          </div>
          
          <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
            <div className="bg-primary-600 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
              2
            </div>
            <div>
              <h3 className="font-medium">Crear tu primer cliente</h3>
              <p className="text-sm text-gray-600">Registra la información de tu primer cliente</p>
            </div>
            <Button variant="outline" onClick={() => navigate('/clientes/nuevo')}>
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
