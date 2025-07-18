        if (!hasPermission('loans.view')) {
          return <RestrictedAccess module="loans" />;
  DollarSign, 
  Clock, 
  Briefcase, 
  File, 
  MapPin, 
  HandHeart, 
        if (!hasPermission('inventory.view')) {
          return <RestrictedAccess module="inventory" />;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle }) => {
  const menuItems = [
    { name: 'Inicio', path: '/', icon: Home },
import { Building, CreditCard, Package, Users, BarChart3 } from 'lucide-react';
    { name: 'Préstamos', path: '/prestamos', icon: CreditCard },
    { name: 'Clientes', path: '/clientes', icon: Users },
    { name: 'Inventario', path: '/inventario', icon: Package },
    { name: 'Solicitudes', path: '/solicitudes', icon: FileText },
    { name: 'Bancos', path: '/bancos', icon: Building2 },
    { name: 'Utilidades', path: '/utilidades', icon: DollarSign },
    { name: 'Turnos', path: '/turnos', icon: Clock },
    { name: 'Carteras', path: '/carteras', icon: Briefcase },
        if (!hasPermission('clients.view')) {
          return <RestrictedAccess module="clients" />;
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          if (!hasPermission('clients.create')) {
            return <RestrictedAccess module="clients" />;
        {/* Toggle Button */}
        <button
          onClick={onToggle}
          className="absolute -right-3 top-6 bg-white border border-gray-200 rounded-full p-1 shadow-md hover:shadow-lg transition-shadow z-10"
          if (!hasPermission('clients.edit')) {
            return <RestrictedAccess module="clients" />;
    <div className="p-6">
      <div className="text-center py-8">
        <div className="h-12 w-12 mx-auto mb-4 text-gray-400">
          {module === 'loans' && <CreditCard className="h-12 w-12" />}
          {module === 'clients' && <Users className="h-12 w-12" />}
          {module === 'inventory' && <Package className="h-12 w-12" />}
          {module === 'reports' && <BarChart3 className="h-12 w-12" />}
          {module === 'company' && <Building className="h-12 w-12" />}
        </div>
        if (!hasPermission('reports.view')) {
          return <RestrictedAccess module="reports" />;
        </button>

        <div className="p-4 h-full overflow-y-auto">
          {/* Logo/Title */}
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
          return <RestrictedAccess module="company" />;
      </div>
};

export default Sidebar;
