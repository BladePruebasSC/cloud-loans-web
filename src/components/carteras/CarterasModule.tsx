
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Plus,
  BarChart3,
  Users,
  AlertCircle
} from 'lucide-react';

export const CarterasModule = () => {
  const [activeTab, setActiveTab] = useState('resumen');

  const mockPortfolios = [
    { id: 1, name: 'Cartera Personal', clients: 25, amount: 450000, performance: 8.5 },
    { id: 2, name: 'Cartera Comercial', clients: 12, amount: 890000, performance: 12.3 },
    { id: 3, name: 'Cartera Emergencia', clients: 8, amount: 125000, performance: 15.2 },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Carteras</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <BarChart3 className="h-4 w-4 mr-2" />
            Ver Reportes
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Cartera
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Carteras</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">Carteras activas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$1,465,000</div>
            <p className="text-xs text-muted-foreground">+12% este mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rendimiento Promedio</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">12.0%</div>
            <p className="text-xs text-muted-foreground">Anual</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Total</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45</div>
            <p className="text-xs text-muted-foreground">En todas las carteras</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="carteras">Mis Carteras</TabsTrigger>
          <TabsTrigger value="analisis">Análisis</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resumen de Carteras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockPortfolios.map((portfolio) => (
                  <div key={portfolio.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <Wallet className="h-8 w-8 text-blue-500" />
                      <div>
                        <h3 className="font-medium">{portfolio.name}</h3>
                        <p className="text-sm text-gray-500">{portfolio.clients} clientes</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${portfolio.amount.toLocaleString()}</div>
                      <div className="text-sm text-green-600 flex items-center">
                        <TrendingUp className="h-4 w-4 mr-1" />
                        {portfolio.performance}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="carteras">
          <Card>
            <CardContent className="text-center py-8">
              <Wallet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Gestión de Carteras</h3>
              <p className="text-gray-600">Administra y organiza tus carteras de préstamos</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analisis">
          <Card>
            <CardContent className="text-center py-8">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Análisis de Rendimiento</h3>
              <p className="text-gray-600">Estadísticas y métricas de tus carteras</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracion">
          <Card>
            <CardContent className="text-center py-8">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Configuración de Carteras</h3>
              <p className="text-gray-600">Parámetros y configuraciones avanzadas</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
