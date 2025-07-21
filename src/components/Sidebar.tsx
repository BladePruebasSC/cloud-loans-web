import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { NavLink } from 'react-router-dom';
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
      permission: 'clients'
  MapPin, 
  HandHeart, 
  BarChart3, 
  Settings,
  Users,
      permission: 'loans'
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

  const { profile } = useAuth();
      permission: 'reports'
  
  // Función para verificar permisos
  const hasPermission = (permission: string) => {
    if (!profile?.isEmployee) return true; // Los dueños tienen todos los permisos
    return profile?.permissions?.includes(permission) || false;
      permission: 'requests'
  };
interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}
      permission: 'agreements'

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const { profile } = useAuth();

  // Función para verificar permisos
      permission: 'shifts'
  const hasPermission = (permission: string) => {
    if (!profile?.is_employee) {
      console.log('User is owner, granting all permissions');
      return true; // Los dueños tienen todos los permisos
    }
      permission: 'map'
    
    const hasAccess = profile?.permissions?.[permission] === true;
    console.log(`Permission check for ${permission}:`, hasAccess, 'Permissions:', profile?.permissions);
    return profile?.permissions?.[permission] === true;
  };
      permission: 'portfolios'

  const menuItems = [
    { name: 'Inicio', path: '/', icon: Home },
    { name: 'Préstamos', path: '/prestamos', icon: CreditCard, permission: 'loans.view' },
    { name: 'Clientes', path: '/clientes', icon: Users, permission: 'clients.view' },
      permission: 'banks'
    { name: 'Inventario', path: '/inventario', icon: Package, permission: 'inventory.view' },
      permission: 'dashboard'
    { name: 'Solicitudes', path: '/solicitudes', icon: FileText },
    { name: 'Bancos', path: '/bancos', icon: Building2 },
    { name: 'Utilidades', path: '/utilidades', icon: DollarSign },
      permission: 'inventory'
    { name: 'Turnos', path: '/turnos', icon: Clock },
    { name: 'Carteras', path: '/carteras', icon: Briefcase },
    { name: 'Documentos', path: '/documentos', icon: File },
    { name: 'Mapa en vivo', path: '/mapa', icon: MapPin },
    { name: 'Acuerdo de pagos', path: '/acuerdos', icon: HandHeart },
      permission: 'documents'
    { name: 'Reportes', path: '/reportes', icon: BarChart3, permission: 'reports.view' },
    { name: 'Mi empresa', path: '/empresa', icon: Settings, ownerOnly: true },
  ].filter(item => {
    // Filtrar elementos según permisos
    if (item.ownerOnly && profile?.is_employee) return false;
      permission: 'utilities'
    if (item.permission && !hasPermission(item.permission)) return false;
    return true;
  });
  // Solo mostrar "Empresa" si NO es empleado (solo dueños)
  const companyMenuItems = !profile?.isEmployee ? [
    { 
      path: '/empresa', 
      icon: Building, 
      label: 'Empresa',
      permission: 'company'
    }
  ] : [];

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
          {[...menuItems, ...companyMenuItems].filter(item => hasPermission(item.permission)).map((item) => {
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700'
                      : 'text-gray-600 hover:bg-gray-100'
                  } ${!isOpen ? 'justify-center' : ''}`
                }
                title={!isOpen ? item.name : undefined}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {isOpen && <span className="text-sm font-medium">{item.name}</span>}
              </NavLink>
            ))}
        )}
      </div>
    </>
  );
};

export default Sidebar;
