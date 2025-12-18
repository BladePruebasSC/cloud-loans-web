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
  Briefcase,
  CheckCircle2,
  Key
} from 'lucide-react';

const employeeSchema = z.object({
  full_name: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  dni: z.string().optional(),
  position: z.string().min(1, 'El cargo es requerido'),
  department: z.string().optional(),
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
  // ========== PRÉSTAMOS ==========
  'loans.view': { label: 'Ver Préstamos', description: 'Puede ver la lista de préstamos', category: 'Préstamos' },
  'loans.create': { label: 'Crear Préstamos', description: 'Puede crear nuevos préstamos', category: 'Préstamos' },
  'loans.edit': { label: 'Editar Préstamos', description: 'Puede modificar préstamos existentes', category: 'Préstamos' },
  'loans.delete': { label: 'Eliminar Préstamos', description: 'Puede eliminar préstamos', category: 'Préstamos' },
  
  // ========== CLIENTES ==========
  'clients.view': { label: 'Ver Clientes', description: 'Puede ver la lista de clientes', category: 'Clientes' },
  'clients.create': { label: 'Crear Clientes', description: 'Puede registrar nuevos clientes', category: 'Clientes' },
  'clients.edit': { label: 'Editar Clientes', description: 'Puede modificar información de clientes', category: 'Clientes' },
  'clients.delete': { label: 'Eliminar Clientes', description: 'Puede eliminar clientes', category: 'Clientes' },
  
  // ========== PAGOS ==========
  'payments.view': { label: 'Ver Pagos', description: 'Puede ver el historial de pagos', category: 'Pagos' },
  'payments.create': { label: 'Registrar Pagos', description: 'Puede registrar nuevos pagos', category: 'Pagos' },
  'payments.edit': { label: 'Editar Pagos', description: 'Puede modificar pagos registrados', category: 'Pagos' },
  'payments.delete': { label: 'Eliminar Pagos', description: 'Puede eliminar pagos registrados', category: 'Pagos' },
  
  // ========== INVENTARIO ==========
  'inventory.view': { label: 'Ver Inventario', description: 'Puede ver el inventario de productos', category: 'Inventario' },
  'inventory.products.create': { label: 'Crear Productos', description: 'Puede crear nuevos productos en el inventario', category: 'Inventario' },
  'inventory.products.edit': { label: 'Editar Productos', description: 'Puede modificar productos existentes', category: 'Inventario' },
  'inventory.products.delete': { label: 'Eliminar Productos', description: 'Puede eliminar productos del inventario', category: 'Inventario' },
  'inventory.movements.view': { label: 'Ver Movimientos', description: 'Puede ver los movimientos de inventario', category: 'Inventario' },
  'inventory.sales.view': { label: 'Ver Ventas POS', description: 'Puede ver el historial de ventas del punto de venta', category: 'Inventario' },
  'inventory.reports.view': { label: 'Ver Reportes de Inventario', description: 'Puede ver reportes y estadísticas de inventario', category: 'Inventario' },
  
  // ========== PUNTO DE VENTA (POS) ==========
  'pos.view': { label: 'Ver Punto de Venta', description: 'Puede acceder al módulo de punto de venta', category: 'Punto de Venta' },
  'pos.create': { label: 'Realizar Ventas', description: 'Puede procesar nuevas ventas en el punto de venta', category: 'Punto de Venta' },
  'pos.edit': { label: 'Editar Ventas', description: 'Puede editar ventas realizadas', category: 'Punto de Venta' },
  'pos.delete': { label: 'Eliminar Ventas', description: 'Puede eliminar ventas registradas', category: 'Punto de Venta' },
  'pos.receipt.print': { label: 'Imprimir Recibos', description: 'Puede imprimir recibos de venta', category: 'Punto de Venta' },
  'pos.receipt.download': { label: 'Descargar Recibos', description: 'Puede descargar recibos de venta', category: 'Punto de Venta' },
  
  // ========== COMPRA-VENTA (CASA DE EMPEÑO) ==========
  'pawnshop.view': { label: 'Ver Transacciones', description: 'Puede ver las transacciones de compra-venta', category: 'Compra-Venta' },
  'pawnshop.create': { label: 'Crear Transacciones', description: 'Puede crear nuevas transacciones de empeño', category: 'Compra-Venta' },
  'pawnshop.edit': { label: 'Editar Transacciones', description: 'Puede modificar transacciones existentes', category: 'Compra-Venta' },
  'pawnshop.delete': { label: 'Eliminar Transacciones', description: 'Puede eliminar transacciones', category: 'Compra-Venta' },
  'pawnshop.payments.view': { label: 'Ver Pagos de Empeño', description: 'Puede ver el historial de pagos de empeños', category: 'Compra-Venta' },
  'pawnshop.payments.create': { label: 'Registrar Pagos de Empeño', description: 'Puede registrar pagos de transacciones de empeño', category: 'Compra-Venta' },
  'pawnshop.payments.edit': { label: 'Editar Pagos de Empeño', description: 'Puede modificar pagos de empeños registrados', category: 'Compra-Venta' },
  'pawnshop.redeem': { label: 'Redimir Artículos', description: 'Puede marcar artículos como redimidos', category: 'Compra-Venta' },
  'pawnshop.forfeit': { label: 'Marcar como Perdido', description: 'Puede marcar artículos como perdidos', category: 'Compra-Venta' },
  'pawnshop.reports.view': { label: 'Ver Reportes de Empeño', description: 'Puede ver reportes y estadísticas de compra-venta', category: 'Compra-Venta' },
  'pawnshop.receipt.print': { label: 'Imprimir Recibos de Empeño', description: 'Puede imprimir recibos de transacciones de empeño', category: 'Compra-Venta' },
  
  // ========== CARTERAS ==========
  'portfolios.view': { label: 'Ver Carteras', description: 'Puede ver las carteras de préstamos', category: 'Carteras' },
  'portfolios.create': { label: 'Crear Carteras', description: 'Puede crear nuevas carteras', category: 'Carteras' },
  'portfolios.edit': { label: 'Editar Carteras', description: 'Puede modificar carteras existentes', category: 'Carteras' },
  'portfolios.delete': { label: 'Eliminar Carteras', description: 'Puede eliminar carteras', category: 'Carteras' },
  
  // ========== SOLICITUDES ==========
  'requests.view': { label: 'Ver Solicitudes', description: 'Puede ver solicitudes de préstamos', category: 'Solicitudes' },
  'requests.create': { label: 'Crear Solicitudes', description: 'Puede crear nuevas solicitudes', category: 'Solicitudes' },
  'requests.edit': { label: 'Editar Solicitudes', description: 'Puede modificar solicitudes existentes', category: 'Solicitudes' },
  'requests.approve': { label: 'Aprobar Solicitudes', description: 'Puede aprobar solicitudes de préstamos', category: 'Solicitudes' },
  'requests.reject': { label: 'Rechazar Solicitudes', description: 'Puede rechazar solicitudes de préstamos', category: 'Solicitudes' },
  
  // ========== ACUERDOS DE PAGO ==========
  'agreements.view': { label: 'Ver Acuerdos', description: 'Puede ver acuerdos de pago', category: 'Acuerdos' },
  'agreements.create': { label: 'Crear Acuerdos', description: 'Puede crear nuevos acuerdos de pago', category: 'Acuerdos' },
  'agreements.edit': { label: 'Editar Acuerdos', description: 'Puede modificar acuerdos existentes', category: 'Acuerdos' },
  'agreements.delete': { label: 'Eliminar Acuerdos', description: 'Puede eliminar acuerdos de pago', category: 'Acuerdos' },
  
  // ========== DOCUMENTOS ==========
  'documents.view': { label: 'Ver Documentos', description: 'Puede ver documentos del sistema', category: 'Documentos' },
  'documents.create': { label: 'Subir Documentos', description: 'Puede subir nuevos documentos', category: 'Documentos' },
  'documents.edit': { label: 'Editar Documentos', description: 'Puede modificar documentos existentes', category: 'Documentos' },
  'documents.delete': { label: 'Eliminar Documentos', description: 'Puede eliminar documentos', category: 'Documentos' },
  'documents.download': { label: 'Descargar Documentos', description: 'Puede descargar documentos del sistema', category: 'Documentos' },
  
  // ========== RUTAS Y COBRANZA ==========
  'routes.view': { label: 'Ver Rutas', description: 'Puede ver las rutas de cobranza', category: 'Rutas y Cobranza' },
  'routes.create': { label: 'Crear Rutas', description: 'Puede crear nuevas rutas de cobranza', category: 'Rutas y Cobranza' },
  'routes.edit': { label: 'Editar Rutas', description: 'Puede modificar rutas existentes', category: 'Rutas y Cobranza' },
  'routes.delete': { label: 'Eliminar Rutas', description: 'Puede eliminar rutas de cobranza', category: 'Rutas y Cobranza' },
  'routes.map.view': { label: 'Ver Mapa', description: 'Puede ver el mapa de rutas y ubicaciones', category: 'Rutas y Cobranza' },
  
  // ========== REPORTES ==========
  'reports.view': { label: 'Ver Reportes', description: 'Puede acceder a los reportes generales', category: 'Reportes' },
  'reports.loans': { label: 'Reportes de Préstamos', description: 'Puede ver reportes de préstamos', category: 'Reportes' },
  'reports.financial': { label: 'Reportes Financieros', description: 'Puede ver reportes financieros sensibles', category: 'Reportes' },
  'reports.export': { label: 'Exportar Reportes', description: 'Puede exportar reportes a diferentes formatos', category: 'Reportes' },
  'reports.inventory': { label: 'Reportes de Inventario', description: 'Puede ver reportes de inventario y ventas', category: 'Reportes' },
  'reports.pawnshop': { label: 'Reportes de Compra-Venta', description: 'Puede ver reportes de compra-venta', category: 'Reportes' },
  
  // ========== FINANZAS ==========
  'expenses.view': { label: 'Ver Gastos', description: 'Puede ver los gastos registrados', category: 'Finanzas' },
  'expenses.create': { label: 'Registrar Gastos', description: 'Puede registrar nuevos gastos', category: 'Finanzas' },
  'expenses.edit': { label: 'Editar Gastos', description: 'Puede modificar gastos registrados', category: 'Finanzas' },
  'expenses.delete': { label: 'Eliminar Gastos', description: 'Puede eliminar gastos registrados', category: 'Finanzas' },
  
  // ========== PERSONAL Y TURNOS ==========
  'shifts.view': { label: 'Ver Turnos', description: 'Puede ver los turnos de trabajo', category: 'Personal' },
  'shifts.create': { label: 'Crear Turnos', description: 'Puede crear nuevos turnos de trabajo', category: 'Personal' },
  'shifts.edit': { label: 'Editar Turnos', description: 'Puede modificar turnos existentes', category: 'Personal' },
  'shifts.delete': { label: 'Eliminar Turnos', description: 'Puede eliminar turnos de trabajo', category: 'Personal' },
  
  // ========== AGENDA Y CITAS ==========
  'appointments.view': { label: 'Ver Citas', description: 'Puede ver las citas programadas', category: 'Agenda' },
  'appointments.create': { label: 'Crear Citas', description: 'Puede programar nuevas citas', category: 'Agenda' },
  'appointments.edit': { label: 'Editar Citas', description: 'Puede modificar citas existentes', category: 'Agenda' },
  'appointments.delete': { label: 'Eliminar Citas', description: 'Puede eliminar citas programadas', category: 'Agenda' },
  
  // ========== CONFIGURACIÓN Y ADMINISTRACIÓN ==========
  'settings.view': { label: 'Ver Configuración', description: 'Puede ver configuraciones de la empresa', category: 'Configuración' },
  'settings.edit': { label: 'Editar Configuración', description: 'Puede modificar configuraciones generales', category: 'Configuración' },
  'employees.manage': { label: 'Gestionar Empleados', description: 'Puede gestionar otros empleados y sus permisos', category: 'Configuración' },
  'settings.banks': { label: 'Gestionar Bancos', description: 'Puede gestionar información de bancos', category: 'Configuración' },
  'settings.utilities': { label: 'Gestionar Utilidades', description: 'Puede acceder a utilidades del sistema', category: 'Configuración' },
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
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [employeeForPasswordChange, setEmployeeForPasswordChange] = useState<Employee | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
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
          
          console.error('❌ Error response status:', response.status);
          console.error('❌ Error response text:', errorText);
          
          try {
            const errorJson = JSON.parse(errorText);
            errorMessage = errorJson.error || errorJson.message || errorText;
            console.error('❌ Error JSON:', errorJson);
          } catch (parseError) {
            // Si no es JSON, usar el texto directamente
            errorMessage = errorText || `Error del servidor (${response.status})`;
            console.error('❌ Error no es JSON, usando texto:', errorMessage);
          }
          
          // Si el error es sobre email ya registrado, intentar crear empleado directamente
          if (errorMessage.includes('already registered') || errorMessage.includes('ya existe') || errorMessage.includes('duplicate key') || errorMessage.includes('email')) {
            console.log('📧 Email ya existe, intentando crear empleado directamente...');
            
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
                hire_date: data.hire_date,
                role: data.role,
                status: 'active',
                permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
              });

            if (directError) {
              console.error('❌ Error directo al crear empleado:', directError);
              // Si falla por restricción única, mostrar mensaje más claro
              if (directError.message.includes('duplicate key') || directError.message.includes('employees_email_key')) {
                throw new Error('Ya existe un empleado con este email en tu empresa. El sistema necesita ser actualizado para permitir emails duplicados entre empresas.');
              }
              throw new Error(`Error al crear empleado: ${directError.message}`);
            }

            toast.success('Empleado creado exitosamente (reutilizando cuenta existente)');
            setIsDialogOpen(false);
            setEditingEmployee(null);
            form.reset();
            setSelectedPermissions([]);
            fetchEmployees();
            return;
          }
          
          // Si la Edge Function no existe o hay un error de conexión
          if (response.status === 404 || response.status === 500) {
            console.log('⚠️ Edge Function no disponible, intentando crear empleado directamente...');
            
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
                hire_date: data.hire_date,
                role: data.role,
                status: 'active',
                permissions: selectedPermissions.reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
              });

            if (directError) {
              console.error('❌ Error directo al crear empleado:', directError);
              throw new Error(`Error al crear empleado: ${directError.message || directError.code || 'Error desconocido'}`);
            }

            toast.success('Empleado creado exitosamente (sin cuenta de autenticación)');
            setIsDialogOpen(false);
            setEditingEmployee(null);
            form.reset();
            setSelectedPermissions([]);
            fetchEmployees();
            return;
          }
          
          throw new Error(errorMessage || `Error del servidor (${response.status})`);
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

  const confirmEmployeeEmail = async (employee: Employee) => {
    if (!employee.email) {
      toast.error('El empleado no tiene email');
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error('No estás autenticado');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jabiezfpkfyzfpiswcwz.supabase.co';
      const response = await fetch(`${supabaseUrl}/functions/v1/confirm-employee-emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: employee.email }),
      });

      if (response.ok) {
        const result = await response.json();
        toast.success('Correo del empleado confirmado exitosamente');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        toast.error(`Error al confirmar correo: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error confirming employee email:', error);
      toast.error('Error al confirmar correo del empleado');
    }
  };

  const confirmAllEmployeeEmails = async () => {
    if (!companyId) return;
    
    const activeEmployees = employees.filter(emp => emp.status === 'active' && emp.email);
    if (activeEmployees.length === 0) {
      toast.info('No hay empleados activos con email para confirmar');
      return;
    }

    if (!confirm(`¿Confirmar el correo de ${activeEmployees.length} empleado(s)?`)) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error('No estás autenticado');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jabiezfpkfyzfpiswcwz.supabase.co';
      const response = await fetch(`${supabaseUrl}/functions/v1/confirm-employee-emails`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`${result.confirmed || 0} correo(s) confirmado(s) exitosamente`);
        if (result.errors && result.errors.length > 0) {
          console.warn('Errores al confirmar algunos correos:', result.errors);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        toast.error(`Error al confirmar correos: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error confirming all employee emails:', error);
      toast.error('Error al confirmar correos de empleados');
    }
  };

  const handleChangePassword = (employee: Employee) => {
    setEmployeeForPasswordChange(employee);
    setNewPassword('');
    setIsPasswordDialogOpen(true);
  };

  const changeEmployeePassword = async () => {
    if (!employeeForPasswordChange || !employeeForPasswordChange.email) {
      toast.error('No se ha seleccionado un empleado');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast.error('No estás autenticado');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jabiezfpkfyzfpiswcwz.supabase.co';
      const response = await fetch(`${supabaseUrl}/functions/v1/change-employee-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: employeeForPasswordChange.email,
          password: newPassword 
        }),
      });

      if (response.ok) {
        toast.success('Contraseña cambiada exitosamente');
        setIsPasswordDialogOpen(false);
        setNewPassword('');
        setEmployeeForPasswordChange(null);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        toast.error(`Error al cambiar contraseña: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      toast.error('Error al cambiar contraseña del empleado');
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

  // Group permissions by category and sort them in a logical order
  const categoryOrder = [
    'Préstamos',
    'Clientes',
    'Pagos',
    'Inventario',
    'Punto de Venta',
    'Compra-Venta',
    'Carteras',
    'Solicitudes',
    'Acuerdos',
    'Documentos',
    'Rutas y Cobranza',
    'Reportes',
    'Finanzas',
    'Personal',
    'Agenda',
    'Configuración'
  ];
  
  const permissionsByCategory = Object.entries(PERMISSIONS_CONFIG).reduce((acc, [key, config]) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push({ key, ...config });
    return acc;
  }, {} as Record<string, Array<{ key: string; label: string; description: string; category: string }>>);

  // Sort categories according to the defined order
  const sortedCategories = Object.keys(permissionsByCategory).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

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
                
                      
                      {sortedCategories.map((category) => {
                        const permissions = permissionsByCategory[category];
                        return (
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
                        );
                      })}
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
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Lista de Empleados</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={confirmAllEmployeeEmails}
            title="Confirmar correos de todos los empleados activos"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Confirmar Todos los Correos
          </Button>
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
                        
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => confirmEmployeeEmail(employee)}
                        title="Confirmar correo electrónico"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleChangePassword(employee)}
                        title="Cambiar contraseña"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      
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

      {/* Dialog para cambiar contraseña */}
      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {employeeForPasswordChange && (
              <div>
                <Label>Empleado</Label>
                <p className="text-sm text-gray-600">{employeeForPasswordChange.full_name} ({employeeForPasswordChange.email})</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">La contraseña debe tener al menos 6 caracteres</p>
            </div>
            <div className="flex gap-4 justify-end">
              <Button variant="outline" onClick={() => {
                setIsPasswordDialogOpen(false);
                setNewPassword('');
                setEmployeeForPasswordChange(null);
              }}>
                Cancelar
              </Button>
              <Button onClick={changeEmployeePassword} disabled={!newPassword || newPassword.length < 6}>
                Cambiar Contraseña
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};