
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Settings,
  User,
  DollarSign
} from 'lucide-react';

const RequestsModule = () => {
  const [activeTab, setActiveTab] = useState('nueva-solicitud');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Solicitudes de Préstamos</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Solicitud
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="nueva-solicitud">Nueva Solicitud</TabsTrigger>
          <TabsTrigger value="lista-solicitudes">Lista de Solicitudes</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="nueva-solicitud" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Crear Nueva Solicitud de Préstamo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto mb-4 text-blue-400" />
                <h3 className="text-lg font-medium mb-2">Formulario de Solicitud</h3>
                <p className="text-gray-600 mb-4">Completa la información para crear una nueva solicitud</p>
                <Button>Comenzar Solicitud</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lista-solicitudes" className="space-y-6">
          {/* Stats de Solicitudes */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Solicitudes</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">24</div>
                <p className="text-xs text-muted-foreground">Este mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">8</div>
                <p className="text-xs text-muted-foreground">En revisión</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">12</div>
                <p className="text-xs text-muted-foreground">Listas para préstamo</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">4</div>
                <p className="text-xs text-muted-foreground">No aprobadas</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Solicitudes */}
          <Card>
            <CardHeader>
              <CardTitle>Solicitudes Recientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Ejemplo de solicitud pendiente */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <User className="h-4 w-4 text-gray-500" />
                        <h3 className="font-medium">María González</h3>
                        <span className="bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">Pendiente</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <DollarSign className="h-3 w-3 mr-1" />
                          Solicita: $50,000
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          Hace 2 días
                        </div>
                        <div className="flex items-center">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Score: 720
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline">Ver Detalle</Button>
                      <Button size="sm">Revisar</Button>
                    </div>
                  </div>
                </div>

                {/* Ejemplo de solicitud aprobada */}
                <div className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-3">
                        <User className="h-4 w-4 text-gray-500" />
                        <h3 className="font-medium">Carlos Rodríguez</h3>
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">Aprobada</span>
                      </div>
                      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                        <div className="flex items-center">
                          <DollarSign className="h-3 w-3 mr-1" />
                          Aprobado: $35,000
                        </div>
                        <div className="flex items-center">
                          <Clock className="h-3 w-3 mr-1" />
                          Hace 1 semana
                        </div>
                        <div className="flex items-center">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Score: 780
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" variant="outline">Ver Detalle</Button>
                      <Button size="sm">Crear Préstamo</Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configuración de Solicitudes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Criterios de Aprobación</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Score Crediticio Mínimo</label>
                      <input 
                        type="number" 
                        className="w-full mt-1 p-2 border rounded" 
                        defaultValue="650"
                        placeholder="Score mínimo requerido"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Ingresos Mínimos Mensuales</label>
                      <input 
                        type="number" 
                        className="w-full mt-1 p-2 border rounded" 
                        defaultValue="25000"
                        placeholder="Ingresos mínimos en pesos"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Años de Empleo Mínimo</label>
                      <input 
                        type="number" 
                        className="w-full mt-1 p-2 border rounded" 
                        defaultValue="1"
                        placeholder="Años mínimos trabajando"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Documentos Requeridos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <label className="text-sm">Cédula de Identidad</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <label className="text-sm">Certificación de Ingresos</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <label className="text-sm">Estados Bancarios</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <label className="text-sm">Referencias Comerciales</label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <label className="text-sm">Garantías/Colateral</label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button>Guardar Configuración</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default RequestsModule;
