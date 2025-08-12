
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CompanySettings from './CompanySettings';
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
        <TabsList className="w-full overflow-x-auto">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            General
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

      </Tabs>
    </div>
  );
};
