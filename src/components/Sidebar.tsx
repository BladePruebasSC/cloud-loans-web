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
      title: 'Clientes',
      icon: Users,
      path: '/clientes',
      permission: 'clients.view',
    },
    {
      title: 'Préstamos',
      icon: DollarSign,
      path: '/prestamos',
      permission: 'loans.view',
    },
    {
      title: 'Reportes',
      icon: BarChart3,
      path: '/reportes',
      permission: 'reports.view',
    },
    {
      title: 'Empresa',
      icon: Building2,
      path: '/empresa',
      permission: 'settings.view',
    },
    {
      title: 'Inventario',
      icon: Package,
      path: '/inventario',
      permission: 'inventory.view',
    },
    {
      title: 'Utilidades',
      icon: Calculator,
      path: '/utilidades',
      permission: 'settings.view',
    },
    { name: 'Solicitudes', path: '/solicitudes', icon: FileText },
    { name: 'Bancos', path: '/bancos', icon: Building2 },
    { name: 'Turnos', path: '/turnos', icon: Clock },
    { name: 'Carteras', path: '/carteras', icon: Briefcase },
    { name: 'Documentos', path: '/documentos', icon: File },
    { name: 'Mapa en vivo', path: '/mapa', icon: MapPin },
    { name: 'Acuerdo de pagos', path: '/acuerdos', icon: HandHeart },
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
              
              return (
                <div
                  key={item.path}
                  className={`relative ${disabled ? 'opacity-50' : ''}`}
                >
                  {disabled ? (
                    <div className="flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-400 cursor-not-allowed">
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
                      <Lock className="h-4 w-4 ml-auto" />
                    </div>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.title}</span>
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