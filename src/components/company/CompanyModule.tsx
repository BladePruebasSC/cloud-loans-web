import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompanySettings from './CompanySettings';
import { EmployeesModule } from './EmployeesModule';
import { HolidaysModule } from './HolidaysModule';
import { RoutesModule } from './RoutesModule';
import { Building2, Users, Calendar, Route, Settings, UserCog } from 'lucide-react';
export const CompanyModule = () => {
  const [activeTab, setActiveTab] = useState('general');
  return <div className="p-4 sm:p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-1 sm:gap-2">
          <TabsTrigger value="general" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Building2 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="empleados" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <UserCog className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Empleados</span>
          </TabsTrigger>
          <TabsTrigger value="feriados" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Feriados</span>
          </TabsTrigger>
          <TabsTrigger value="rutas" className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
            <Route className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Rutas</span>
          </TabsTrigger>
          
        </TabsList>

        <TabsContent value="general">
          <CompanySettings />
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
    </div>;
};