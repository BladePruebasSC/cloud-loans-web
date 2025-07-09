
import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  CreditCard, 
  Package, 
  FileText, 
  Building2, 
  TrendingUp, 
  Clock, 
  Briefcase, 
  FileImage, 
  MapPin, 
  HandCoins, 
  BarChart3, 
  Settings,
  HelpCircle,
  DollarSign,
  Menu,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const menuItems = [
  { name: 'Préstamos', icon: CreditCard, path: '/prestamos' },
  { name: 'Inventario', icon: Package, path: '/inventario' },
  { name: 'Solicitudes', icon: FileText, path: '/solicitudes' },
  { name: 'Bancos', icon: Building2, path: '/bancos' },
  { name: 'Utilidades', icon: TrendingUp, path: '/utilidades' },
  { name: 'Turnos', icon: Clock, path: '/turnos' },
  { name: 'Carteras', icon: Briefcase, path: '/carteras' },
  { name: 'Documentos', icon: FileImage, path: '/documentos' },
  { name: 'Mapa en vivo', icon: MapPin, path: '/mapa' },
  { name: 'Acuerdo de pagos', icon: HandCoins, path: '/acuerdos' },
  { name: 'Reportes', icon: BarChart3, path: '/reportes' },
  { name: 'Mi empresa', icon: Settings, path: '/empresa' },
  { name: 'Ayuda', icon: HelpCircle, path: '/ayuda' },
];

const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar */}
      <div className={cn(
        "fixed left-0 top-0 h-full bg-white border-r border-gray-200 z-50 transition-transform duration-300 ease-in-out",
        "w-64 lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-500 p-2 rounded-lg">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">PrestamosFácil</h1>
              <p className="text-xs text-gray-500">Sistema Completo</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className="lg:hidden"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-2">
            {menuItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-100 text-primary-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </>
  );
};

export default Sidebar;
