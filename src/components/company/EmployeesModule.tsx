import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Plus, 
  Users, 
  Search, 
  Mail, 
  Phone, 
  Calendar,
  DollarSign,
  Edit,
  Trash2,
  UserCheck,
  UserX,
  Shield,
  Settings,
  Eye,
  EyeOff,
  Building,
  Briefcase
} from 'lucide-react';

const employeeSchema = z.object({
  full_name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  dni: z.string().optional(),
  position: z.string().min(1, 'El cargo es requerido'),
  department: z.string().optional(),
  salary: z.number().min(0, 'El salario debe ser mayor o igual a 0').optional(),
  hire_date: z.string().optional(),
  role: z.enum(['admin', 'manager', 'employee', 'collector', 'accountant']).default('employee'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

type EmployeeFormData = z.infer<typeof employeeSchema>;

interface Employee {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  dni: string | null;
  position: string | null;
  department: string | null;
  salary: number | null;
  hire_date: string | null;
  status: string;
  role: string;
  permissions: any;
  company_owner_id: string | null;
  auth_user_id: string | null;
  created_at: string;
}

interface PermissionConfig {
  [key: string]: {
    label: string;
    description: string;
    category: string;
  };
}

const PERMISSIONS_CONFIG: PermissionConfig = {
  // Préstamos
  'loans.view': { label: 'Ver Préstamos', description: 'Puede ver la lista de préstamos', category: 'Préstamos' },
  'loans.create': { label: 'Crear Préstamos', description: 'Puede crear nuevos préstamos', category: 'Préstamos' },
  'loans.edit': { label: 'Editar Préstamos', description: 'Puede modificar préstamos existentes', category: 'Préstamos' },
  'loans.delete': { label: 'Eliminar Préstamos', description: 'Puede eliminar préstamos', category: 'Préstamos' },
  
  // Clientes
  'clients.view': { label: 'Ver Clientes', description: 'Puede ver la lista de clientes', category: 'Clientes' },
  'clients.create': { label: 'Crear Clientes', description: 'Puede registrar nuevos clientes', category: 'Clientes' },
  'clients.edit': { label: 'Editar Clientes', description: 'Puede modificar información de clientes', category: 'Clientes' },
  'clients.delete': { label: 'Eliminar Clientes', description: 'Puede eliminar clientes', category: 'Clientes' },
  
  // Pagos
  'payments.view': { label: 'Ver Pagos', description: 'Puede ver el historial de pagos', category: 'Pagos' },
  'payments.create': { label: 'Registrar Pagos', description: 'Puede registrar nuevos pagos', category: 'Pagos' },
  'payments.edit': { label: 'Editar Pagos', description: 'Puede modificar pagos registrados', category: 'Pagos' },
  
  // Reportes
  'reports.view': { label: 'Ver Reportes', description: 'Puede acceder a los reportes', category: 'Reportes' },
  'reports.export': { label: 'Exportar Reportes', description: 'Puede exportar reportes', category: 'Reportes' },
  'reports.financial': { label: 'Reportes Financieros', description: 'Puede ver reportes financieros sensibles', category: 'Reportes' },
  
  // Configuración
  'settings.view': { label: 'Ver Configuración', description: 'Puede ver configuraciones de la empresa', category: 'Configuración' },
  'settings.edit': { label: 'Editar Configuración', description: 'Puede modificar configuraciones', category: 'Configuración' },
  'employees.manage': { label: 'Gestionar Empleados', description: 'Puede gestionar otros empleados', category: 'Configuración' },
  
  // Inventario
  'inventory.view': { label: 'Ver Inventario', description: 'Puede ver el inventario', category: 'Inventario' },
  'inventory.manage': { label: 'Gestionar Inventario', description: 'Puede gestionar productos del inventario', category: 'Inventario' },
};

export const EmployeesModule = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const { user } = useAuth();

  const form = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      hire_date: new Date().toISOString().split('T')[0],
      role: 'employee',
    },
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('company_owner_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching employees:', error);
        toast.error('Error al cargar empleados');
        return;
      }

      setEmployees(data || []);
    } catch (error) {
      console.error('Error in fetchEmployees:', error);
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: EmployeeFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      if (editingEmployee) {
        // Update existing employee
        const { error } = await supabase
          .from('employees')
          .update({
            full_name: data.full_name,
            email: data.email,
            phone: data.phone,
            dni: data.dni,
            position: data.position,
            department: data.department,
            salary: data.salary || null,
            hire_date: data.hire_date,
            role: data.role,
            permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
          })
          .eq('id', editingEmployee.id);

        if (error) {
          throw error;
        }

        toast.success('Empleado actualizado exitosamente');
      } else {
        // Create new employee using Edge Function
        const employeeData = {
          ...data,
          permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
        };

        const { data: session } = await supabase.auth.getSession();
        
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-employee`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ employeeData }),
        });

        const result = await response.json();
        
        if (!response.ok) {
          throw new Error(result.error || 'Error al crear empleado');
        }

        toast.success('Empleado creado exitosamente');
      }

      setIsDialogOpen(false);
      setEditingEmployee(null);
      form.reset();
      setSelectedPermissions([]);
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast.error('Error al guardar empleado');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    form.reset({
      full_name: employee.full_name,
      email: employee.email || '',
      phone: employee.phone || '',
      dni: employee.dni || '',
      position: employee.position || '',
      department: employee.department || '',
      salary: employee.salary || undefined,
      hire_date: employee.hire_date || '',
      role: employee.role as 'admin' | 'manager' | 'employee' | 'collector' | 'accountant',
      password: '', // Don't pre-fill password for editing
    });
    
    // Set permissions
    const permissions = Object.keys(employee.permissions || {}).filter(key => employee.permissions[key]);
    setSelectedPermissions(permissions);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este empleado?')) return;

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast.success('Empleado eliminado exitosamente');
      fetchEmployees();
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast.error('Error al eliminar empleado');
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      const { error } = await supabase
        .from('employees')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast.success(`Empleado ${newStatus === 'active' ? 'activado' : 'desactivado'} exitosamente`);
      fetchEmployees();
    } catch (error) {
      console.error('Error updating employee status:', error);
      toast.error('Error al actualizar estado del empleado');
    }
  };

  const handlePermissionChange = (permission: string, checked: boolean) => {
    if (checked) {
      setSelectedPermissions(prev => [...prev, permission]);
    } else {
      setSelectedPermissions(prev => prev.filter(p => p !== permission));
    }
  };

  const filteredEmployees = employees.filter(employee =>
    employee.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.department?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const totalSalary = employees
    .filter(e => e.status === 'active' && e.salary)
    .reduce((sum, e) => sum + (e.salary || 0), 0);

  // Group permissions by category
  const permissionsByCategory = Object.entries(PERMISSIONS_CONFIG).reduce((acc, [key, config]) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push({ key, ...config });
    return acc;
  }, {} as Record<string, Array<{ key: string; label: string; description: string; category: string }>>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Gestión de Empleados</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingEmployee(null);
              form.reset();
              setSelectedPermissions([]);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Empleado
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Información Básica</TabsTrigger>
                    <TabsTrigger value="permissions">Permisos</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="full_name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre Completo</FormLabel>
                            <FormControl>
                              <Input placeholder="Nombre completo" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@ejemplo.com" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Teléfono</FormLabel>
                            <FormControl>
                              <Input placeholder="(809) 000-0000" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dni"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cédula</FormLabel>
                            <FormControl>
                              <Input placeholder="000-0000000-0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="position"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cargo</FormLabel>
                            <FormControl>
                              <Input placeholder="Cargo o posición" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Departamento</FormLabel>
                            <FormControl>
                              <Input placeholder="Departamento" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="salary"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Salario</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="hire_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Fecha de Contratación</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rol</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar rol" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="employee">Empleado</SelectItem>
                                <SelectItem value="collector">Cobrador</SelectItem>
                                <SelectItem value="accountant">Contador</SelectItem>
                                <SelectItem value="manager">Gerente</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {!editingEmployee && (
                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Contraseña</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Input 
                                    type={showPassword ? 'text' : 'password'} 
                                    placeholder="Contraseña" 
                                    {...field} 
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                  >
                                    {showPassword ? (
                                      <EyeOff className="h-4 w-4 text-gray-400" />
                                    ) : (
                                      <Eye className="h-4 w-4 text-gray-400" />
                                    )}
                                  </Button>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="permissions" className="space-y-4">
                    <div className="space-y-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Shield className="h-5 w-5 text-blue-600" />
                        <h3 className="text-lg font-semibold">Permisos del Sistema</h3>
                      </div>
                      
                      {Object.entries(permissionsByCategory).map(([category, permissions]) => (
                        <Card key={category}>
                          <CardHeader>
                            <CardTitle className="text-base">{category}</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {permissions.map((permission) => (
                                <div key={permission.key} className="flex items-start space-x-3">
                                  <Switch
                                    checked={selectedPermissions.includes(permission.key)}
                                    onCheckedChange={(checked) => handlePermissionChange(permission.key, checked)}
                                  />
                                  <div className="space-y-1">
                                    <Label className="text-sm font-medium">
                                      {permission.label}
                                    </Label>
                                    <p className="text-xs text-gray-500">
                                      {permission.description}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : editingEmployee ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeEmployees} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeEmployees}</div>
            <p className="text-xs text-muted-foreground">
              {employees.length - activeEmployees} inactivos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nómina Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalSalary.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Salarios mensuales</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, cargo o departamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Employees List */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando empleados...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay empleados registrados</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEmployees.map((employee) => (
                <div key={employee.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{employee.full_name}</h3>
                        <Badge variant={employee.status === 'active' ? 'default' : 'secondary'}>
                          {employee.status === 'active' ? 'Activo' : 'Inactivo'}
                        </Badge>
                        <Badge variant="outline">
                          {employee.role === 'admin' ? 'Administrador' :
                           employee.role === 'manager' ? 'Gerente' :
                           employee.role === 'collector' ? 'Cobrador' :
                           employee.role === 'accountant' ? 'Contador' : 'Empleado'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Cargo:</span>
                          <span>{employee.position}</span>
                        </div>
                        
                        {employee.department && (
                          <div className="flex items-center gap-2">
                            <Building className="h-4 w-4" />
                            <span>{employee.department}</span>
                          </div>
                        )}
                        
                        {employee.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span>{employee.email}</span>
                          </div>
                        )}
                        
                        {employee.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span>{employee.phone}</span>
                          </div>
                        )}
                        
                        {employee.hire_date && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>Desde: {new Date(employee.hire_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        
                        {employee.salary && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span>${employee.salary.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleStatus(employee.id, employee.status)}
                      >
                        {employee.status === 'active' ? (
                          <UserX className="h-4 w-4" />
                        ) : (
                          <UserCheck className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <Button variant="outline" size="sm" onClick={() => handleEdit(employee)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(employee.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};