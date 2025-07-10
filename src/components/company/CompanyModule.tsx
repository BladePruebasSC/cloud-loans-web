
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanySettings } from './CompanySettings';
import { EmployeesModule } from './EmployeesModule';
import { HolidaysModule } from './HolidaysModule';
import { RoutesModule } from './RoutesModule';
import { 
  Building2, 
  Users, 
  Calendar, 
  Route,
  Settings,
  UserCog
} from 'lucide-react';

export const CompanyModule = () => {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <div className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="clientes" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clientes
          </TabsTrigger>
          <TabsTrigger value="empleados" className="flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Empleados
          </TabsTrigger>
          <TabsTrigger value="feriados" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Días Feriados
          </TabsTrigger>
          <TabsTrigger value="rutas" className="flex items-center gap-2">
            <Route className="h-4 w-4" />
            Rutas
          </TabsTrigger>
          <TabsTrigger value="configuracion" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <CompanySettings />
        </TabsContent>

        <TabsContent value="clientes">
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">Gestión de Clientes</h3>
            <p className="text-gray-600">
              Los clientes se gestionan desde el módulo principal de Clientes
            </p>
          </div>
        </TabsContent>

        <TabsContent value="empleados">
          <EmployeesModule />
        </TabsContent>

        <TabsContent value="feriados">
          <HolidaysModule />
        </TabsContent>

        <TabsContent value="rutas">
          <RoutesModule />
        </TabsContent>

        <TabsContent value="configuracion">
          <div className="text-center py-8">
            <Settings className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium mb-2">Configuraciones Avanzadas</h3>
            <p className="text-gray-600">
              Configuraciones adicionales del sistema en desarrollo
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
