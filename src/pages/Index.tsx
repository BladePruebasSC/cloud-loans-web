
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import { CompanyModule } from '@/components/company/CompanyModule';
import { LoansModule } from '@/components/loans/LoansModule';
import InventoryModule from '@/components/inventory/InventoryModule';
import RequestsModule from '@/components/requests/RequestsModule';
import BanksModule from '@/components/banks/BanksModule';
import UtilitiesModule from '@/components/utilities/UtilitiesModule';
import ShiftsModule from '@/components/shifts/ShiftsModule';
import ClientForm from '@/components/clients/ClientForm';

const Index = () => {
  const [activeModule, setActiveModule] = useState('inicio');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'inicio':
        return <Dashboard />;
      case 'mi-empresa':
        return <CompanyModule />;
      case 'prestamos':
        return <LoansModule />;
      case 'inventario':
        return <InventoryModule />;
      case 'solicitudes':
        return <RequestsModule />;
      case 'bancos':
        return <BanksModule />;
      case 'utilidades':
        return <UtilitiesModule />;
      case 'turnos':
        return <ShiftsModule />;
      case 'clientes':
        return <ClientForm />;
      default:
        return (
          <div className="p-6">
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Módulo en Desarrollo
              </h2>
              <p className="text-gray-600">
                Esta funcionalidad está siendo desarrollada y estará disponible próximamente.
              </p>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        isOpen={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
      />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto">
          {renderActiveModule()}
        </main>
      </div>
    </div>
  );
};

export default Index;
