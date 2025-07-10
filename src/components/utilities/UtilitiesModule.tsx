
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  DollarSign, 
  Plus, 
  Calculator, 
  TrendingUp, 
  TrendingDown,
  PieChart,
  BarChart3,
  Calendar,
  Target,
  Zap
} from 'lucide-react';

const UtilitiesModule = () => {
  const [activeTab, setActiveTab] = useState('gastos');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Utilidades y Gastos</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Gasto
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="ingresos">Ingresos</TabsTrigger>
          <TabsTrigger value="presupuestos">Presupuestos</TabsTrigger>
          <TabsTrigger value="calculadora">Calculadora</TabsTrigger>
          <TabsTrigger value="analisis">Análisis</TabsTrigger>
        </TabsList>

        <TabsContent value="gastos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gastos del Mes</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">$23,456</div>
                <p className="text-xs text-muted-foreground">+8% vs mes anterior</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gastos Fijos</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$12,500</div>
                <p className="text-xs text-muted-foreground">Mensuales</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Gastos Variables</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">$10,956</div>
                <p className="text-xs text-muted-foreground">Este mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categorías</CardTitle>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">8</div>
                <p className="text-xs text-muted-foreground">Tipos de gastos</p>
              </CardContent>
            </Card>
          </div>

          {/* Formulario Nuevo Gasto */}
          <Card>
            <CardHeader>
              <CardTitle>Registrar Nuevo Gasto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="expense_amount">Monto</Label>
                  <Input id="expense_amount" type="number" placeholder="0.00" />
                </div>
                <div>
                  <Label htmlFor="expense_category">Categoría</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="office">Oficina</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="transport">Transporte</SelectItem>
                      <SelectItem value="utilities">Servicios</SelectItem>
                      <SelectItem value="supplies">Materiales</SelectItem>
                      <SelectItem value="other">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="expense_date">Fecha</Label>
                  <Input id="expense_date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="expense_description">Descripción</Label>
                <Textarea id="expense_description" placeholder="Descripción del gasto..." />
              </div>
              <Button>Guardar Gasto</Button>
            </CardContent>
          </Card>

          {/* Lista de Gastos */}
          <Card>
            <CardHeader>
              <CardTitle>Gastos Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((expense) => (
                  <div key={expense} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="font-medium">Pago de Electricidad</div>
                        <div className="text-sm text-gray-600">15/01/2024 - Servicios</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-red-600">-$3,500.00</div>
                        <div className="text-sm text-gray-600">Gasto Fijo</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ingresos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Registrar Ingresos Adicionales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="income_amount">Monto</Label>
                  <Input id="income_amount" type="number" placeholder="0.00" />
                </div>
                <div>
                  <Label htmlFor="income_source">Fuente</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar fuente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="loans">Préstamos</SelectItem>
                      <SelectItem value="sales">Ventas</SelectItem>
                      <SelectItem value="services">Servicios</SelectItem>
                      <SelectItem value="investments">Inversiones</SelectItem>
                      <SelectItem value="other">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="income_date">Fecha</Label>
                  <Input id="income_date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="income_description">Descripción</Label>
                <Textarea id="income_description" placeholder="Descripción del ingreso..." />
              </div>
              <Button>Guardar Ingreso</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="presupuestos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Presupuesto Mensual</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Gastos Presupuestados</h3>
                  <div className="space-y-3">
                    {[
                      { category: 'Oficina', budgeted: 5000, spent: 4200 },
                      { category: 'Marketing', budgeted: 3000, spent: 3500 },
                      { category: 'Servicios', budgeted: 4000, spent: 3800 },
                    ].map((item, index) => (
                      <div key={index} className="border rounded p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium">{item.category}</span>
                          <span className={item.spent > item.budgeted ? 'text-red-600' : 'text-green-600'}>
                            ${item.spent} / ${item.budgeted}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded h-2">
                          <div 
                            className={`h-2 rounded ${item.spent > item.budgeted ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min((item.spent / item.budgeted) * 100, 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="font-medium mb-4">Configurar Presupuesto</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="budget_category">Categoría</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="office">Oficina</SelectItem>
                          <SelectItem value="marketing">Marketing</SelectItem>
                          <SelectItem value="transport">Transporte</SelectItem>
                          <SelectItem value="utilities">Servicios</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="budget_amount">Monto Presupuestado</Label>
                      <Input id="budget_amount" type="number" placeholder="0.00" />
                    </div>
                    <Button>Actualizar Presupuesto</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculadora" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calculator className="h-5 w-5 mr-2" />
                Calculadoras Financieras
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="font-medium">Calculadora de ROI</h3>
                  <div>
                    <Label htmlFor="investment">Inversión Inicial</Label>
                    <Input id="investment" type="number" placeholder="0.00" />
                  </div>
                  <div>
                    <Label htmlFor="returns">Retorno Obtenido</Label>
                    <Input id="returns" type="number" placeholder="0.00" />
                  </div>
                  <Button>Calcular ROI</Button>
                  <div className="p-3 bg-green-50 rounded">
                    <span className="text-green-700 font-medium">ROI: 25.5%</span>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h3 className="font-medium">Calculadora de Margen</h3>
                  <div>
                    <Label htmlFor="cost">Costo</Label>
                    <Input id="cost" type="number" placeholder="0.00" />
                  </div>
                  <div>
                    <Label htmlFor="price">Precio de Venta</Label>
                    <Input id="price" type="number" placeholder="0.00" />
                  </div>
                  <Button>Calcular Margen</Button>
                  <div className="p-3 bg-blue-50 rounded">
                    <span className="text-blue-700 font-medium">Margen: 40%</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analisis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Análisis Financiero</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Rentabilidad</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">15.5%</div>
                    <p className="text-sm text-gray-600">Margen neto mensual</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Eficiencia</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-600">87%</div>
                    <p className="text-sm text-gray-600">Ratio ingresos/gastos</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Crecimiento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-600">+12%</div>
                    <p className="text-sm text-gray-600">Vs período anterior</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UtilitiesModule;
