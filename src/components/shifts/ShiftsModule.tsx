
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Clock, 
  Plus, 
  Calendar, 
  Users, 
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  MapPin
} from 'lucide-react';

const ShiftsModule = () => {
  const [activeTab, setActiveTab] = useState('agenda');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Turnos</h1>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Turno
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="empleados">Empleados</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Turnos Hoy</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">8</div>
                <p className="text-xs text-muted-foreground">Programados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Confirmados</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">6</div>
                <p className="text-xs text-muted-foreground">Asistirán</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">2</div>
                <p className="text-xs text-muted-foreground">Sin confirmar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cancelados</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">0</div>
                <p className="text-xs text-muted-foreground">Hoy</p>
              </CardContent>
            </Card>
          </div>

          {/* Nuevo Turno */}
          <Card>
            <CardHeader>
              <CardTitle>Programar Nuevo Turno</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="client_select">Cliente</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="client1">Juan Pérez</SelectItem>
                      <SelectItem value="client2">María González</SelectItem>
                      <SelectItem value="client3">Carlos Rodríguez</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="appointment_date">Fecha</Label>
                  <Input id="appointment_date" type="date" />
                </div>
                <div>
                  <Label htmlFor="appointment_time">Hora</Label>
                  <Input id="appointment_time" type="time" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="purpose">Propósito</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar propósito" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="payment">Cobro de Cuota</SelectItem>
                      <SelectItem value="consultation">Consulta</SelectItem>
                      <SelectItem value="new_loan">Nuevo Préstamo</SelectItem>
                      <SelectItem value="documentation">Documentación</SelectItem>
                      <SelectItem value="other">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="location">Ubicación</Label>
                  <Input id="location" placeholder="Dirección o lugar de encuentro" />
                </div>
              </div>
              <Button>Programar Turno</Button>
            </CardContent>
          </Card>

          {/* Lista de Turnos */}
          <Card>
            <CardHeader>
              <CardTitle>Turnos de Hoy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { time: '09:00', client: 'Juan Pérez', purpose: 'Cobro de Cuota', status: 'confirmed', location: 'Oficina' },
                  { time: '10:30', client: 'María González', purpose: 'Nuevo Préstamo', status: 'pending', location: 'Casa del cliente' },
                  { time: '14:00', client: 'Carlos Rodríguez', purpose: 'Consulta', status: 'confirmed', location: 'Oficina' },
                  { time: '16:00', client: 'Ana Martínez', purpose: 'Documentación', status: 'pending', location: 'Oficina' },
                ].map((appointment, index) => (
                  <div key={index} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-3">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{appointment.time}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            appointment.status === 'confirmed' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {appointment.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                          <div className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {appointment.client}
                          </div>
                          <div>{appointment.purpose}</div>
                          <div className="flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            {appointment.location}
                          </div>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">Editar</Button>
                        <Button size="sm">
                          {appointment.status === 'confirmed' ? 'Completar' : 'Confirmar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="empleados" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gestión de Empleados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Agregar Empleado</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="employee_name">Nombre Completo</Label>
                      <Input id="employee_name" placeholder="Nombre del empleado" />
                    </div>
                    <div>
                      <Label htmlFor="employee_position">Posición</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar posición" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="collector">Cobrador</SelectItem>
                          <SelectItem value="advisor">Asesor</SelectItem>
                          <SelectItem value="manager">Gerente</SelectItem>
                          <SelectItem value="assistant">Asistente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="employee_phone">Teléfono</Label>
                      <Input id="employee_phone" placeholder="Teléfono de contacto" />
                    </div>
                    <Button>Agregar Empleado</Button>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-4">Empleados Activos</h3>
                  <div className="space-y-2">
                    {[
                      { name: 'Pedro García', position: 'Cobrador', phone: '809-123-4567' },
                      { name: 'Laura Rodríguez', position: 'Asesora', phone: '809-234-5678' },
                      { name: 'Miguel Santos', position: 'Gerente', phone: '809-345-6789' },
                    ].map((employee, index) => (
                      <div key={index} className="border rounded p-3">
                        <div className="flex justify-between items-center">
                          <div>
                            <div className="font-medium">{employee.name}</div>
                            <div className="text-sm text-gray-600">{employee.position} - {employee.phone}</div>
                          </div>
                          <div className="flex space-x-2">
                            <Button size="sm" variant="outline">Editar</Button>
                            <Button size="sm" variant="outline">Horario</Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="horarios" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Horarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-4">Horarios de Atención</h3>
                  <div className="space-y-3">
                    {[
                      'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
                    ].map((day) => (
                      <div key={day} className="flex items-center space-x-3">
                        <div className="w-20 text-sm font-medium">{day}</div>
                        <Input type="time" defaultValue="08:00" className="w-24" />
                        <span className="text-sm text-gray-500">a</span>
                        <Input type="time" defaultValue="18:00" className="w-24" />
                        <input type="checkbox" defaultChecked={day !== 'Domingo'} />
                        <span className="text-sm text-gray-500">Activo</span>
                      </div>
                    ))}
                  </div>
                  <Button className="mt-4">Guardar Horarios</Button>
                </div>
                
                <div>
                  <h3 className="font-medium mb-4">Configuración de Turnos</h3>
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="appointment_duration">Duración por Turno (minutos)</Label>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar duración" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 minutos</SelectItem>
                          <SelectItem value="30">30 minutos</SelectItem>
                          <SelectItem value="45">45 minutos</SelectItem>
                          <SelectItem value="60">1 hora</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="max_appointments">Máximo de Turnos por Día</Label>
                      <Input id="max_appointments" type="number" defaultValue="20" />
                    </div>
                    <div>
                      <Label htmlFor="advance_booking">Días de Anticipación</Label>
                      <Input id="advance_booking" type="number" defaultValue="7" />
                    </div>
                    <Button>Actualizar Configuración</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Reportes de Turnos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Esta Semana</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">45</div>
                    <p className="text-sm text-gray-600">Turnos programados</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Confirmados</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-600">38</div>
                    <p className="text-sm text-gray-600">84% de confirmación</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">No Shows</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">3</div>
                    <p className="text-sm text-gray-600">7% de ausencias</p>
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

export default ShiftsModule;
