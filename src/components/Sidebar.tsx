import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { 
  Home,
  CreditCard, 
  Package, 
  FileText, 
  Building2, 
  DollarSign, 
  Clock, 
  Briefcase, 
  File, 
  MapPin, 
  HandHeart, 
  BarChart3, 
  Settings,
  Users,
  ChevronLeft,
  ChevronRight,
  Calculator,
  Lock
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  const location = useLocation();
  const { profile } = useAuth();

  // Function to check if user has permission
  const hasPermission = (permission: string) => {
    if (!profile) return false;
    if (profile.role === 'owner' || profile.role === 'admin') return true;
    return profile.permissions?.[permission] === true;
  };

  // Function to check if menu item should be disabled
  const isDisabled = (permission: string) => {
    return !hasPermission(permission);
  };

  const menuItems = [
    { name: 'Inicio', path: '/', icon: Home },
    {
      name: 'Clientes',
      icon: Users,
      path: '/clientes',
      permission: 'clients.view',
    },
    {
      name: 'Préstamos',
      icon: DollarSign,
      path: '/prestamos',
      permission: 'loans.view',
    },
    { 
      name: 'Carteras', 
      path: '/carteras', 
      icon: Briefcase,
      permission: 'portfolios.view'
    },
    { 
      name: 'Inventario', 
      path: '/inventario', 
      icon: Package,
      permission: 'inventory.view'
    },
    { 
      name: 'Documentos', 
      path: '/documentos', 
      icon: File,
      permission: 'documents.view'
    },
    { 
      name: 'Solicitudes', 
      path: '/solicitudes', 
      icon: FileText,
      permission: 'requests.view'
    },
    { 
      name: 'Bancos', 
      path: '/bancos', 
      icon: Building2,
      permission: 'settings.view'
    },
    { 
      name: 'Utilidades', 
      path: '/utilidades', 
      icon: Calculator,
      permission: 'settings.view'
    },
    { 
      name: 'Turnos', 
      path: '/turnos', 
      icon: Clock,
      permission: 'shifts.view'
    },
    { 
      name: 'Mapa', 
      path: '/mapa', 
      icon: MapPin,
      permission: 'routes.view'
    },
    { 
      name: 'Acuerdos', 
      path: '/acuerdos', 
      icon: HandHeart,
      permission: 'agreements.view'
    },
    {
      name: 'Reportes',
      icon: BarChart3,
      path: '/reportes',
      permission: 'reports.view',
    },
    {
      name: 'Mi Empresa',
      icon: Building2,
      path: '/mi-empresa',
      permission: 'settings.view',
      ownerOnly: true
    },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-50 transition-all duration-300 shadow-lg
        ${isOpen ? 'w-64' : 'w-0 lg:w-16'}
        lg:relative lg:z-auto
      `}>
        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-6 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow z-10"
        >
          {isOpen ? (
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-600" />
          )}
        </button>

        <div className="p-4 h-full overflow-y-auto">
          {/* Logo/Title */}
          <div className="mb-8">
            {isOpen ? (
              <div>
                <h1 className="text-xl font-bold text-gray-800">PrestamosPro</h1>
                {profile?.is_employee && (
                  <p className="text-xs text-blue-600 mt-1">
                    {profile.role === 'admin' ? 'Administrador' :
                     profile.role === 'manager' ? 'Gerente' :
                     profile.role === 'collector' ? 'Cobrador' :
                     profile.role === 'accountant' ? 'Contador' : 'Empleado'}
                  </p>
                )}
              </div>
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
            )}
          </div>

          {/* Menu Items */}
          <nav className="space-y-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;
              const disabled = item.permission && isDisabled(item.permission);
              const isOwnerOnly = item.ownerOnly && profile?.is_employee;
              const shouldBlock = disabled || isOwnerOnly;
              
              return (
                <div
                  key={item.path}
                  className={`relative ${shouldBlock ? 'opacity-50' : ''}`}
                >
                  {shouldBlock ? (
                    <div className={`flex items-center px-3 py-2 rounded-lg text-gray-400 cursor-not-allowed ${
                      isOpen ? 'space-x-3' : 'justify-center'
                    }`}>
                      <item.icon className="h-5 w-5" />
                      {isOpen && (
                        <>
                          <span className="flex-1">{item.name}</span>
                          <Lock className="h-4 w-4" />
                        </>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center px-3 py-2 rounded-lg transition-colors ${
                        isOpen ? 'space-x-3' : 'justify-center'
                      } ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={!isOpen ? item.name : undefined}
                    >
                      <item.icon className="h-5 w-5" />
                      {isOpen && <span>{item.name}</span>}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      </div>
    </>
  );
};

export default Sidebar;