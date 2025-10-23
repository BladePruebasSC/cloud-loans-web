import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import Dashboard from '@/pages/Dashboard';
import { LoansModule } from '@/components/loans/LoansModule';
import { ClientsModule } from '@/components/clients/ClientsModule';
import ClientForm from '@/components/clients/ClientForm';
import InventoryModule from '@/components/inventory/InventoryModule';
import RequestsModule from '@/components/requests/RequestsModule';
import BanksModule from '@/components/banks/BanksModule';
import UtilitiesModule from '@/components/utilities/UtilitiesModule';
import ShiftsModule from '@/components/shifts/ShiftsModule';
import { CarterasModule } from '@/components/carteras/CarterasModule';
import { DocumentsModule } from '@/components/documents/DocumentsModule';
import { MapModule } from '@/components/map/MapModule';
import { PaymentAgreementsModule } from '@/components/agreements/PaymentAgreementsModule';
import { ReportsModule } from '@/components/reports/ReportsModule';
import { CompanyModule } from '@/components/company/CompanyModule';
import RegistrationCodesModule from '@/components/admin/RegistrationCodesModule';
import RegistrationCodeModal from '@/components/RegistrationCodeModal';
import { PawnShopModule } from '@/components/pawnshop/PawnShopModule';
import { Building, CreditCard, Package, Users, BarChart3, Key } from 'lucide-react';

// Componente para mostrar acceso restringido
const RestrictedAccess = ({ module }: { module: string }) => {
  const moduleNames = {
    loans: 'Préstamos',
    clients: 'Clientes', 
    inventory: 'Inventario',
    reports: 'Reportes',
    company: 'Configuración de Empresa',
    admin: 'Administración'
  };

  return (
    <div className="p-6">
      <div className="text-center py-8">
        <div className="h-12 w-12 mx-auto mb-4 text-gray-400">
          {module === 'loans' && <CreditCard className="h-12 w-12" />}
          {module === 'clients' && <Users className="h-12 w-12" />}
          {module === 'inventory' && <Package className="h-12 w-12" />}
          {module === 'reports' && <BarChart3 className="h-12 w-12" />}
          {module === 'company' && <Building className="h-12 w-12" />}
          {module === 'admin' && <Key className="h-12 w-12" />}
        </div>
        <h3 className="text-lg font-medium mb-2 text-gray-900">Acceso Restringido</h3>
        <p className="text-gray-600 mb-4">
          No tienes permisos para acceder al módulo de {moduleNames[module as keyof typeof moduleNames] || module}.
        </p>
        <p className="text-sm text-gray-500">
          Contacta a tu supervisor si necesitas acceso a esta funcionalidad.
        </p>
      </div>
    </div>
  );
};

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false); // Cambiar a false para móviles
  const location = useLocation();
  const { profile, user, needsRegistrationCode, validateRegistrationCode } = useAuth();

  // Función para verificar permisos
  const hasPermission = (permission: string) => {
    if (!profile?.is_employee) {
      console.log('User is owner, granting all permissions for:', permission);
      return true; // Los dueños tienen todos los permisos
    }
    if (!profile?.permissions) return false; // Si no hay permisos definidos, denegar acceso
    const hasAccess = profile?.permissions?.[permission] === true;
    console.log(`Permission check for ${permission}:`, hasAccess, 'User permissions:', profile?.permissions);
    return hasAccess;
  };

  const renderContent = () => {
    const path = location.pathname;

    switch (path) {
      case '/':
        return <Dashboard />;
      
      case '/prestamos':
        if (!hasPermission('loans.view')) {
          return <RestrictedAccess module="loans" />;
        }
        return <LoansModule />;
      
      case '/prestamos/nuevo':
        if (!hasPermission('loans.create')) {
          return <RestrictedAccess module="loans" />;
        }
        return <LoansModule />;
      
      case '/clientes':
        if (!hasPermission('clients.view')) {
          return <RestrictedAccess module="clients" />;
        }
        return <ClientsModule />;
      
      case '/clientes/nuevo':
        if (!hasPermission('clients.create')) {
          return <RestrictedAccess module="clients" />;
        }
        return <ClientForm />;
      
      case path.match(/^\/clientes\/editar\//)?.input:
        if (!hasPermission('clients.edit')) {
          return <RestrictedAccess module="clients" />;
        }
        return <ClientForm />;
      
      case '/inventario':
        if (!hasPermission('inventory.view')) {
          return <RestrictedAccess module="inventory" />;
        }
        return <InventoryModule />;
      
      case '/compra-venta':
        if (!hasPermission('inventory.view')) {
          return <RestrictedAccess module="inventory" />;
        }
        return <PawnShopModule />;
      
      case '/solicitudes':
        return <RequestsModule />;
      
      case '/bancos':
        return <BanksModule />;
      
      case '/utilidades':
        return <UtilitiesModule />;
      
      case '/turnos':
        return <ShiftsModule />;
      
      case '/carteras':
        return <CarterasModule />;
      
      case '/documentos':
        return <DocumentsModule />;
      
      case '/mapa':
        return <MapModule />;
      
      case '/acuerdos':
        return <PaymentAgreementsModule />;
      
      case '/reportes':
        if (!hasPermission('reports.view')) {
          return <RestrictedAccess module="reports" />;
        }
        return <ReportsModule />;
      
      case '/empresa':
      case '/mi-empresa':
        if (profile?.is_employee) {
          return <RestrictedAccess module="company" />;
        }
        return <CompanyModule />;
      
      case '/admin/codigos-registro':
        // Acceso directo al panel de códigos (sin autenticación requerida)
        return <RegistrationCodesModule />;
      
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <div className="flex h-screen bg-gray-50">
        {/* Overlay para móviles */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        
        <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />
          
          <main className="flex-1 overflow-y-auto">
            {renderContent()}
          </main>
        </div>
      </div>

      {/* Modal de código de registro */}
      {needsRegistrationCode && user && <RegistrationCodeModal />}
    </>
  );
};

export default Index;