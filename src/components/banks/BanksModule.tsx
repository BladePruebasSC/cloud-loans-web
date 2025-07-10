
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { 
  Building2, 
  Plus, 
  CreditCard, 
  TrendingUp, 
  DollarSign,
  ArrowUpDown,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';

const BanksModule = () => {
  const [activeTab, setActiveTab] = useState('cuentas');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión Bancaria</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cuentas">Cuentas Bancarias</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="conciliacion">Conciliación</TabsTrigger>
          <TabsTrigger value="transferencias">Transferencias</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cuentas</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">5</div>
                <p className="text-xs text-muted-foreground">Cuentas activas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">$456,789</div>
                <p className="text-xs text-muted-foreground">Disponible</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">$89,234</div>
                <p className="text-xs text-muted-foreground">+15% vs mes anterior</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Egresos del Mes</CardTitle>
                <ArrowUpDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">$23,456</div>
                <p className="text-xs text-muted-foreground">Gastos operativos</p>
              </CardContent>
            </Card>
          </div>

          {/* Formulario Nueva Cuenta */}
          <Card>
            <CardHeader>
              <CardTitle>Agregar Nueva Cuenta Bancaria</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bank_name">Nombre del Banco</Label>
                  <Input id="bank_name" placeholder="Ej: Banco Popular" />
                </div>
                <div>
                  <Label htmlFor="account_type">Tipo de Cuenta</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="checking">Cuenta Corriente</SelectItem>
                      <SelectItem value="savings">Cuenta de Ahorros</SelectItem>
                      <SelectItem value="business">Cuenta Empresarial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="account_number">Número de Cuenta</Label>
                  <Input id="account_number" placeholder="1234567890" />
                </div>
                <div>
                  <Label htmlFor="initial_balance">Saldo Inicial</Label>
                  <Input id="initial_balance" type="number" placeholder="0.00" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" placeholder="Descripción de la cuenta..." />
              </div>
              <Button>Agregar Cuenta</Button>
            </CardContent>
          </Card>

          {/* Lista de Cuentas */}
          <Card>
            <CardHeader>
              <CardTitle>Cuentas Bancarias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((account) => (
                  <div key={account} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-3">
                          <Building2 className="h-5 w-5 text-blue-600" />
                          <h3 className="font-medium">Banco Popular - Cuenta Corriente</h3>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                          <div>Cuenta: ****7890</div>
                          <div>Saldo: $123,456.78</div>
                          <div>Estado: Activa</div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4 mr-1" />
                          Editar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Movimientos Bancarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4 mb-6">
                <Input placeholder="Buscar movimientos..." className="flex-1" />
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>
              </div>
              
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((mov) => (
                  <div key={mov} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-center">
                      <div className="space-y-1">
                        <div className="font-medium">Pago de Préstamo - Cliente Juan Pérez</div>
                        <div className="text-sm text-gray-600">15/01/2024 10:30 AM</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">+$2,500.00</div>
                        <div className="text-sm text-gray-600">Banco Popular</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conciliacion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conciliación Bancaria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Saldo en Sistema</h3>
                  <div className="text-2xl font-bold text-blue-600">$123,456.78</div>
                </div>
                <div>
                  <h3 className="font-medium mb-4">Saldo en Estado de Cuenta</h3>
                  <Input type="number" placeholder="Ingrese saldo del banco" />
                </div>
              </div>
              
              <div className="mt-6">
                <h3 className="font-medium mb-4">Movimientos Pendientes de Conciliar</h3>
                <div className="space-y-2">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="border rounded p-3 flex justify-between items-center">
                      <span>Transferencia a Proveedor ABC</span>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">-$1,500.00</span>
                        <Button size="sm">Conciliar</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transferencias" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Nueva Transferencia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="from_account">Cuenta Origen</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="account1">Banco Popular - ****7890</SelectItem>
                      <SelectItem value="account2">Banco BHD - ****1234</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="to_account">Cuenta Destino</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="account1">Banco Popular - ****7890</SelectItem>
                      <SelectItem value="account2">Banco BHD - ****1234</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="amount">Monto</Label>
                  <Input id="amount" type="number" placeholder="0.00" />
                </div>
                <div>
                  <Label htmlFor="transfer_date">Fecha</Label>
                  <Input id="transfer_date" type="date" />
                </div>
              </div>
              <div>
                <Label htmlFor="description">Descripción</Label>
                <Textarea id="description" placeholder="Motivo de la transferencia..." />
              </div>
              <Button>Realizar Transferencia</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BanksModule;
