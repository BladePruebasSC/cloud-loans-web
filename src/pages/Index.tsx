
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
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
import { ClientsModule } from '@/components/clients/ClientsModule';
import { MapModule } from '@/components/map/MapModule';
import { DocumentsModule } from '@/components/documents/DocumentsModule';
import { CarterasModule } from '@/components/carteras/CarterasModule';
import { ReportsModule } from '@/components/reports/ReportsModule';
import { PaymentAgreementsModule } from '@/components/agreements/PaymentAgreementsModule';

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeModule, setActiveModule] = useState('inicio');

  // Set active module based on current route
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/prestamos')) {
      setActiveModule('prestamos');
    } else if (path === '/carteras') {
      setActiveModule('carteras');
    } else if (path.startsWith('/clientes')) {
      setActiveModule('clientes');
    } else if (path === '/inventario') {
      setActiveModule('inventario');
    } else if (path === '/documentos') {
      setActiveModule('documentos');
    } else if (path === '/solicitudes') {
      setActiveModule('solicitudes');
    } else if (path === '/bancos') {
      setActiveModule('bancos');
    } else if (path === '/utilidades') {
      setActiveModule('utilidades');
    } else if (path === '/turnos') {
      setActiveModule('turnos');
    } else if (path === '/mi-empresa' || path === '/empresa') {
      setActiveModule('mi-empresa');
    } else if (path === '/mapa') {
      setActiveModule('mapa');
    } else if (path === '/reportes') {
      setActiveModule('reportes');
    } else if (path === '/acuerdos') {
      setActiveModule('acuerdos');
    } else {
      setActiveModule('inicio');
    }
  }, [location.pathname]);

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'inicio':
        return <Dashboard />;
      case 'mi-empresa':
        return <CompanyModule />;
      case 'prestamos':
        return <LoansModule />;
      case 'carteras':
        return <CarterasModule />;
      case 'inventario':
        return <InventoryModule />;
      case 'documentos':
        return <DocumentsModule />;
      case 'solicitudes':
        return <RequestsModule />;
      case 'bancos':
        return <BanksModule />;
      case 'utilidades':
        return <UtilitiesModule />;
      case 'turnos':
        return <ShiftsModule />;
      case 'clientes':
        if (location.pathname === '/clientes/nuevo') {
          return <ClientForm />;
        } else if (location.pathname.startsWith('/clientes/editar/')) {
          return <ClientForm />;
        } else {
          return <ClientsModule />;
        }
      case 'mapa':
        return <MapModule />;
      case 'reportes':
        return <ReportsModule />;
      case 'acuerdos':
        return <PaymentAgreementsModule />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        isOpen={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
      />
      <div className="flex-1 flex flex-col">
        <Header 
          user={user ? { name: user.email || 'Usuario', email: user.email || '' } : undefined}
          onLogout={signOut}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />
        <main className="flex-1 overflow-auto">
          {renderActiveModule()}
        </main>
      </div>
    </div>
  );
};

export default Index;
