
import React from 'react';
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
  MapPin, 
  HandHeart, 
  BarChart3, 
                      {profile.role === 'admin' ? 'Administrador' :
                       profile.role === 'manager' ? 'Gerente' :
                       profile.role === 'collector' ? 'Cobrador' :
                       profile.role === 'accountant' ? 'Contador' : 'Empleado'} • Empresa
  Users,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const menuItems = [
    { name: 'Inicio', path: '/', icon: Home },
    { name: 'Préstamos', path: '/prestamos', icon: CreditCard },
    { name: 'Clientes', path: '/clientes', icon: Users },
    { name: 'Inventario', path: '/inventario', icon: Package },
    { name: 'Solicitudes', path: '/solicitudes', icon: FileText },
    { name: 'Bancos', path: '/bancos', icon: Building2 },
    { name: 'Utilidades', path: '/utilidades', icon: DollarSign },
    { name: 'Turnos', path: '/turnos', icon: Clock },
    { name: 'Carteras', path: '/carteras', icon: Briefcase },
    { name: 'Documentos', path: '/documentos', icon: File },
    { name: 'Mapa en vivo', path: '/mapa', icon: MapPin },
    { name: 'Acuerdo de pagos', path: '/acuerdos', icon: HandHeart },
    { name: 'Reportes', path: '/reportes', icon: BarChart3 },
    { name: 'Mi empresa', path: '/empresa', icon: Settings },
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
              <h1 className="text-xl font-bold text-gray-800">PrestamosPro</h1>
            ) : (
              <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
            )}
          </div>

          {/* Menu Items */}
          <nav className="space-y-2">
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
          </nav>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
