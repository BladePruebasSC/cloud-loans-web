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

const employeeEditSchema = z.object({
  full_name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  dni: z.string().optional(),
  position: z.string().min(1, 'El cargo es requerido'),
  department: z.string().optional(),
  salary: z.number().min(0, 'El salario debe ser mayor o igual a 0').optional(),
  hire_date: z.string().optional(),
  role: z.enum(['admin', 'manager', 'employee', 'collector', 'accountant']).default('employee'),
  password: z.string().optional(), // Opcional para edición
});

type EmployeeFormData = z.infer<typeof employeeSchema>;
type EmployeeEditFormData = z.infer<typeof employeeEditSchema>;

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
  company_owner_id: string;
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
  
  // Citas y Agenda
  'appointments.view': { label: 'Ver Citas', description: 'Puede ver las citas programadas', category: 'Agenda' },
  'appointments.create': { label: 'Crear Citas', description: 'Puede programar nuevas citas', category: 'Agenda' },
  'appointments.edit': { label: 'Editar Citas', description: 'Puede modificar citas existentes', category: 'Agenda' },
  
  // Gastos
  'expenses.view': { label: 'Ver Gastos', description: 'Puede ver los gastos registrados', category: 'Finanzas' },
  'expenses.create': { label: 'Registrar Gastos', description: 'Puede registrar nuevos gastos', category: 'Finanzas' },
  'expenses.edit': { label: 'Editar Gastos', description: 'Puede modificar gastos registrados', category: 'Finanzas' },
  
  // Carteras
  'portfolios.view': { label: 'Ver Carteras', description: 'Puede ver las carteras de préstamos', category: 'Carteras' },
  'portfolios.manage': { label: 'Gestionar Carteras', description: 'Puede gestionar carteras de préstamos', category: 'Carteras' },
  
  // Rutas
  'routes.view': { label: 'Ver Rutas', description: 'Puede ver las rutas de cobranza', category: 'Cobranza' },
  'routes.manage': { label: 'Gestionar Rutas', description: 'Puede gestionar rutas de cobranza', category: 'Cobranza' },
  
  // Turnos
  'shifts.view': { label: 'Ver Turnos', description: 'Puede ver los turnos de trabajo', category: 'Personal' },
  'shifts.manage': { label: 'Gestionar Turnos', description: 'Puede gestionar turnos de trabajo', category: 'Personal' },
  
  // Documentos
  'documents.view': { label: 'Ver Documentos', description: 'Puede ver documentos del sistema', category: 'Documentos' },
  'documents.manage': { label: 'Gestionar Documentos', description: 'Puede gestionar documentos', category: 'Documentos' },
  
  // Solicitudes
  'requests.view': { label: 'Ver Solicitudes', description: 'Puede ver solicitudes de préstamos', category: 'Solicitudes' },
  'requests.manage': { label: 'Gestionar Solicitudes', description: 'Puede gestionar solicitudes', category: 'Solicitudes' },
  
  // Acuerdos de Pago
  'agreements.view': { label: 'Ver Acuerdos', description: 'Puede ver acuerdos de pago', category: 'Acuerdos' },
  'agreements.manage': { label: 'Gestionar Acuerdos', description: 'Puede gestionar acuerdos de pago', category: 'Acuerdos' },
};

export const EmployeesModule = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [diagnosticEmail, setDiagnosticEmail] = useState('');
  const { user, companyId } = useAuth();

  const form = useForm<EmployeeFormData | EmployeeEditFormData>({
    resolver: zodResolver(editingEmployee ? employeeEditSchema : employeeSchema),
    defaultValues: {
      hire_date: new Date().toISOString().split('T')[0],
      role: 'employee',
    },
  });

  useEffect(() => {
    if (user) {
      fetchEmployees();
    }
  }, [user]);

  // Actualizar el resolver del formulario cuando cambie editingEmployee
  useEffect(() => {
    form.clearErrors();
    if (editingEmployee) {
      form.reset({
        full_name: editingEmployee.full_name,
        email: editingEmployee.email || '',
        phone: editingEmployee.phone || '',
        dni: editingEmployee.dni || '',
        position: editingEmployee.position || '',
        department: editingEmployee.department || '',
        salary: editingEmployee.salary || undefined,
        hire_date: editingEmployee.hire_date || '',
        role: editingEmployee.role as 'admin' | 'manager' | 'employee' | 'collector' | 'accountant',
        password: '', // No pre-llenar contraseña para edición
      });
      
      // Set permissions
      const permissions = Object.keys(editingEmployee.permissions || {}).filter(key => editingEmployee.permissions[key]);
      setSelectedPermissions(permissions);
    } else {
      form.reset({
        hire_date: new Date().toISOString().split('T')[0],
        role: 'employee',
      });
      setSelectedPermissions([]);
    }
  }, [editingEmployee, form]);

  const fetchEmployees = async () => {
    if (!companyId) return;

    try {
      const { data, error } = await (supabase as any)
        .from('employees')
        .select('*')
        .eq('company_owner_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching employees:', error);
        toast.error('Error al cargar empleados');
        return;
      }

      setEmployees((data as Employee[]) || []);
    } catch (error) {
      console.error('Error in fetchEmployees:', error);
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: EmployeeFormData) => {
    if (!companyId) return;

    console.log('🔍 onSubmit ejecutándose...');
    console.log('🔍 editingEmployee:', editingEmployee);
    console.log('🔍 data:', data);
    console.log('🔍 selectedPermissions:', selectedPermissions);

    setLoading(true);
    try {
      if (editingEmployee) {
        console.log('🔍 Actualizando empleado existente...');
        // Update existing employee
        const updateData = {
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
        };

        console.log('🔍 Datos a actualizar:', updateData);
        console.log('🔍 ID del empleado:', editingEmployee.id);

        const { error: updateError } = await (supabase as any)
          .from('employees')
          .update(updateData)
          .eq('id', editingEmployee.id);

        if (updateError) {
          console.error('❌ Error updating employee:', updateError);
          throw new Error(`Error al actualizar empleado: ${updateError.message}`);
        }

        console.log('✅ Empleado actualizado exitosamente en la base de datos');

                 // Also update the auth user if the email has changed
         if (data.email && data.email !== editingEmployee.email && editingEmployee.auth_user_id) {
           try {
             const { error: authError } = await supabase.auth.admin.updateUserById(
               editingEmployee.auth_user_id,
               { email: data.email }
             );
             if (authError) {
               console.error('Error updating auth user email:', authError);
               // No lanzar error aquí, solo mostrar advertencia
               toast.warning(`Empleado actualizado pero no se pudo actualizar el email de autenticación: ${authError.message}`);
             }
           } catch (error) {
             console.error('Error updating auth user:', error);
             toast.warning('Empleado actualizado pero hubo un problema con la autenticación');
           }
         }

        console.log('✅ Toast de éxito mostrado');
        toast.success('Empleado actualizado exitosamente');
      } else {
        // Create new employee using Edge Function
        const employeeData = {
          ...data,
          permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
          company_owner_id: companyId,
        };

        const { data: session } = await supabase.auth.getSession();
        
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${supabaseUrl}/functions/v1/create-employee`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ employeeData }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = 'Error del servidor';
          
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorText;
            
                         // Si el error es sobre email ya registrado, intentar crear empleado directamente
             if (errorMessage.includes('already registered') || errorMessage.includes('ya existe') || errorMessage.includes('duplicate key')) {
               console.log('Email ya existe, intentando crear empleado directamente...');
               
                               // Verificar si ya existe un empleado con este email en esta empresa
                const { data: existingEmployee, error: checkError } = await supabase
                  .from('employees')
                  .select('id, email')
                  .eq('email', data.email)
                  .eq('company_owner_id', companyId)
                  .single();

               if (existingEmployee) {
                 throw new Error('Ya existe un empleado con este email en tu empresa');
               }
               
                               // Intentar crear el empleado directamente sin crear usuario de auth
                const { error: directError } = await supabase
                  .from('employees')
                  .insert({
                    company_owner_id: companyId,
                   full_name: data.full_name,
                   email: data.email,
                   phone: data.phone,
                   dni: data.dni,
                   position: data.position,
                   department: data.department,
                   salary: data.salary || null,
                   hire_date: data.hire_date,
                   role: data.role,
                   status: 'active',
                   permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
                 });

                               if (directError) {
                  // Si falla por restricción única, mostrar mensaje más claro
                  if (directError.message.includes('duplicate key') || directError.message.includes('employees_email_key')) {
                    throw new Error('Ya existe un empleado con este email en tu empresa. El sistema necesita ser actualizado para permitir emails duplicados entre empresas.');
                  }
                  throw new Error(`Error al crear empleado: ${directError.message}`);
                }

               toast.success('Empleado creado exitosamente (reutilizando cuenta existente)');
               return;
             }
          } catch (e) {
            errorMessage = errorText || 'Error desconocido';
          }
          
          throw new Error(errorMessage);
        }

        const result = await response.json();
        toast.success(result.message || 'Empleado creado exitosamente');
      }

      console.log('🔍 Cerrando modal y limpiando estado...');
      setIsDialogOpen(false);
      setEditingEmployee(null);
      form.reset();
      setSelectedPermissions([]);
      console.log('🔍 Actualizando lista de empleados...');
      fetchEmployees();
    } catch (error: any) {
      console.error('Error saving employee:', error);
      const errorMessage = error?.message || 'Error al guardar empleado';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este empleado?')) return;

    try {
      const { error } = await (supabase as any)
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
      const { error } = await (supabase as any)
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

  // Función de diagnóstico para empleados
  const diagnoseEmployee = async (email: string) => {
    if (!email) {
      toast.error('Por favor ingresa un email');
      return;
    }

    try {
      console.log('🔍 Diagnóstico para email:', email);
      
      // Buscar todos los registros de empleado con este email
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('*')
        .eq('email', email);

      if (employeesError) {
        console.error('Error buscando empleados:', employeesError);
        toast.error('Error al buscar empleados');
        return;
      }

      console.log('📋 Empleados encontrados:', employees);

             // Buscar configuraciones de empresa
       const { data: companySettings, error: companyError } = await supabase
         .from('company_settings')
         .select('*')
         .eq('user_id', companyId);

      if (companyError) {
        console.error('Error buscando configuraciones de empresa:', companyError);
      } else {
        console.log('🏢 Configuración de empresa:', companySettings);
      }

      toast.success('Diagnóstico completado. Revisa la consola del navegador.');
    } catch (error) {
      console.error('Error en diagnóstico:', error);
      toast.error('Error al realizar diagnóstico');
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
                                                         <p className="text-xs text-gray-500 mt-1">
                               💡 Puedes usar un email que ya exista en otra empresa. El sistema identificará al empleado por el código de empresa.
                             </p>
                             <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mt-2">
                               <p className="text-xs text-blue-700">
                                 🔧 <strong>Nota:</strong> Si recibes un error sobre "duplicate key", es porque la base de datos aún no ha sido actualizada. 
                                 El administrador está trabajando en aplicar la migración necesaria.
                               </p>
                             </div>
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
                    {loading ? 'Guardando...'  : editingEmployee ? 'Guardar Cambios' : 'Crear Empleado'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Diagnóstico</CardTitle>
            <Search className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Input
                placeholder="Email del empleado"
                value={diagnosticEmail}
                onChange={(e) => setDiagnosticEmail(e.target.value)}
                className="text-sm"
              />
              <Button 
                size="sm" 
                onClick={() => diagnoseEmployee(diagnosticEmail)}
                className="w-full"
              >
                Diagnosticar
              </Button>
            </div>
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
                        <h3 className="font-semibol text-lg">{employee.full_name}</h3>
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