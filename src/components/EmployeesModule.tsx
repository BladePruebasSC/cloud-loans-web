import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { toast } from '../components/ui/use-toast';
import { 
  Users, 
  UserPlus, 
  Calendar, 
  Clock, 
  DollarSign, 
  Edit, 
  Trash2, 
  Search,
  CheckCircle,
  XCircle,
  UserCheck,
  UserX,
  Building,
  Phone,
  Mail,
  MapPin,
  FileText,
  TrendingUp,
  Award,
  AlertCircle
} from 'lucide-react';

interface Employee {
  id: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  hire_date: string;
  salary: number;
  status: 'active' | 'inactive' | 'on_leave';
  address: string;
  emergency_contact: string;
  emergency_phone: string;
  notes: string;
  created_at: string;
}

interface Shift {
  id: string;
  employee_id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_start?: string;
  break_end?: string;
  total_hours: number;
  overtime_hours: number;
  status: 'scheduled' | 'completed' | 'missed' | 'partial';
  notes: string;
  created_at: string;
}

interface Attendance {
  id: string;
  employee_id: string;
  date: string;
  check_in: string;
  check_out?: string;
  total_hours?: number;
  status: 'present' | 'absent' | 'late' | 'early_out';
  notes: string;
  created_at: string;
}

interface Payroll {
  id: string;
  employee_id: string;
  pay_period_start: string;
  pay_period_end: string;
  base_salary: number;
  overtime_pay: number;
  bonuses: number;
  deductions: number;
  net_pay: number;
  status: 'draft' | 'processed' | 'paid';
  created_at: string;
}

export default function EmployeesModule() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payroll, setPayroll] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('employees');

  // Estados para modales
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState(false);
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);

  // Estados para formularios
  const [employeeForm, setEmployeeForm] = useState({
    employee_id: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    hire_date: '',
    salary: 0,
    status: 'active' as const,
    address: '',
    emergency_contact: '',
    emergency_phone: '',
    notes: ''
  });

  const [shiftForm, setShiftForm] = useState({
    employee_id: '',
    date: '',
    start_time: '',
    end_time: '',
    break_start: '',
    break_end: '',
    notes: ''
  });

  const [attendanceForm, setAttendanceForm] = useState({
    employee_id: '',
    date: '',
    check_in: '',
    check_out: '',
    notes: ''
  });

  // Cargar datos
  useEffect(() => {
    fetchEmployees();
    fetchShifts();
    fetchAttendance();
    fetchPayroll();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmployees(data || []);
    } catch (error) {
      console.error('Error fetching employees:', error);
      toast({
        title: "Error",
        description: "Error al cargar empleados",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchShifts = async () => {
    try {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setShifts(data || []);
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .order('date', { ascending: false });

      if (error) throw error;
      setAttendance(data || []);
    } catch (error) {
      console.error('Error fetching attendance:', error);
    }
  };

  const fetchPayroll = async () => {
    try {
      const { data, error } = await supabase
        .from('payroll')
        .select('*')
        .order('pay_period_start', { ascending: false });

      if (error) throw error;
      setPayroll(data || []);
    } catch (error) {
      console.error('Error fetching payroll:', error);
    }
  };

  const saveEmployee = async () => {
    if (!employeeForm.first_name || !employeeForm.last_name || !employeeForm.email) {
      toast({
        title: "Error",
        description: "Por favor complete los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(employeeForm)
          .eq('id', editingEmployee.id);

        if (error) throw error;
        toast({
          title: "Éxito",
          description: "Empleado actualizado correctamente"
        });
      } else {
        const { error } = await supabase
          .from('employees')
          .insert([employeeForm]);

        if (error) throw error;
        toast({
          title: "Éxito",
          description: "Empleado creado correctamente"
        });
      }

      setIsEmployeeModalOpen(false);
      setEditingEmployee(null);
      resetEmployeeForm();
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      toast({
        title: "Error",
        description: "Error al guardar empleado",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteEmployee = async (id: string) => {
    if (!confirm('¿Está seguro de que desea eliminar este empleado?')) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({
        title: "Éxito",
        description: "Empleado eliminado correctamente"
      });
      fetchEmployees();
    } catch (error) {
      console.error('Error deleting employee:', error);
      toast({
        title: "Error",
        description: "Error al eliminar empleado",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const saveShift = async () => {
    if (!shiftForm.employee_id || !shiftForm.date || !shiftForm.start_time || !shiftForm.end_time) {
      toast({
        title: "Error",
        description: "Por favor complete todos los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    // Calcular horas totales
    const startTime = new Date(`${shiftForm.date} ${shiftForm.start_time}`);
    const endTime = new Date(`${shiftForm.date} ${shiftForm.end_time}`);
    const totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
    const overtimeHours = Math.max(0, totalHours - 8);

    const shiftData = {
      ...shiftForm,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      status: 'scheduled' as const
    };

    setLoading(true);
    try {
      if (editingShift) {
        const { error } = await supabase
          .from('shifts')
          .update(shiftData)
          .eq('id', editingShift.id);

        if (error) throw error;
        toast({
          title: "Éxito",
          description: "Turno actualizado correctamente"
        });
      } else {
        const { error } = await supabase
          .from('shifts')
          .insert([shiftData]);

        if (error) throw error;
        toast({
          title: "Éxito",
          description: "Turno creado correctamente"
        });
      }

      setIsShiftModalOpen(false);
      setEditingShift(null);
      resetShiftForm();
      fetchShifts();
    } catch (error) {
      console.error('Error saving shift:', error);
      toast({
        title: "Error",
        description: "Error al guardar turno",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const markAttendance = async () => {
    if (!attendanceForm.employee_id || !attendanceForm.date || !attendanceForm.check_in) {
      toast({
        title: "Error",
        description: "Por favor complete los campos requeridos",
        variant: "destructive"
      });
      return;
    }

    let totalHours = 0;
    let status: 'present' | 'absent' | 'late' | 'early_out' = 'present';

    if (attendanceForm.check_out) {
      const checkIn = new Date(`${attendanceForm.date} ${attendanceForm.check_in}`);
      const checkOut = new Date(`${attendanceForm.date} ${attendanceForm.check_out}`);
      totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
    }

    const attendanceData = {
      ...attendanceForm,
      total_hours: totalHours,
      status
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('attendance')
        .insert([attendanceData]);

      if (error) throw error;
      toast({
        title: "Éxito",
        description: "Asistencia registrada correctamente"
      });

      setIsAttendanceModalOpen(false);
      resetAttendanceForm();
      fetchAttendance();
    } catch (error) {
      console.error('Error marking attendance:', error);
      toast({
        title: "Error",
        description: "Error al registrar asistencia",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generatePayroll = async (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;

    const startDate = new Date();
    startDate.setDate(1);
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);

    const employeeShifts = shifts.filter(s => 
      s.employee_id === employeeId &&
      s.date >= startDate.toISOString().split('T')[0] &&
      s.date <= endDate.toISOString().split('T')[0]
    );

    const totalHours = employeeShifts.reduce((sum, shift) => sum + shift.total_hours, 0);
    const overtimeHours = employeeShifts.reduce((sum, shift) => sum + shift.overtime_hours, 0);
    const hourlyRate = employee.salary / (40 * 4); // Asumiendo 40 horas por semana
    const overtimeRate = hourlyRate * 1.5;

    const baseSalary = totalHours * hourlyRate;
    const overtimePay = overtimeHours * overtimeRate;
    const bonuses = 0; // Puede ser configurado
    const deductions = baseSalary * 0.1; // 10% de deducciones (impuestos, etc.)
    const netPay = baseSalary + overtimePay + bonuses - deductions;

    const payrollData = {
      employee_id: employeeId,
      pay_period_start: startDate.toISOString().split('T')[0],
      pay_period_end: endDate.toISOString().split('T')[0],
      base_salary: baseSalary,
      overtime_pay: overtimePay,
      bonuses,
      deductions,
      net_pay: netPay,
      status: 'draft' as const
    };

    setLoading(true);
    try {
      const { error } = await supabase
        .from('payroll')
        .insert([payrollData]);

      if (error) throw error;
      toast({
        title: "Éxito",
        description: "Nómina generada correctamente"
      });
      fetchPayroll();
    } catch (error) {
      console.error('Error generating payroll:', error);
      toast({
        title: "Error",
        description: "Error al generar nómina",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetEmployeeForm = () => {
    setEmployeeForm({
      employee_id: '',
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      position: '',
      department: '',
      hire_date: '',
      salary: 0,
      status: 'active',
      address: '',
      emergency_contact: '',
      emergency_phone: '',
      notes: ''
    });
  };

  const resetShiftForm = () => {
    setShiftForm({
      employee_id: '',
      date: '',
      start_time: '',
      end_time: '',
      break_start: '',
      break_end: '',
      notes: ''
    });
  };

  const resetAttendanceForm = () => {
    setAttendanceForm({
      employee_id: '',
      date: '',
      check_in: '',
      check_out: '',
      notes: ''
    });
  };

  const editEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm(employee);
    setIsEmployeeModalOpen(true);
  };

  const filteredEmployees = employees.filter(employee =>
    employee.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    employee.position.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusColors = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-red-100 text-red-800',
      on_leave: 'bg-yellow-100 text-yellow-800',
      scheduled: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      missed: 'bg-red-100 text-red-800',
      partial: 'bg-yellow-100 text-yellow-800',
      present: 'bg-green-100 text-green-800',
      absent: 'bg-red-100 text-red-800',
      late: 'bg-yellow-100 text-yellow-800',
      early_out: 'bg-orange-100 text-orange-800',
      draft: 'bg-gray-100 text-gray-800',
      processed: 'bg-blue-100 text-blue-800',
      paid: 'bg-green-100 text-green-800'
    };

    return statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
  };

  const getStatusText = (status: string) => {
    const statusTexts = {
      active: 'Activo',
      inactive: 'Inactivo',
      on_leave: 'En Licencia',
      scheduled: 'Programado',
      completed: 'Completado',
      missed: 'No Asistió',
      partial: 'Parcial',
      present: 'Presente',
      absent: 'Ausente',
      late: 'Tarde',
      early_out: 'Salida Temprana',
      draft: 'Borrador',
      processed: 'Procesado',
      paid: 'Pagado'
    };

    return statusTexts[status as keyof typeof statusTexts] || status;
  };

  // Estadísticas
  const totalEmployees = employees.length;
  const activeEmployees = employees.filter(e => e.status === 'active').length;
  const onLeaveEmployees = employees.filter(e => e.status === 'on_leave').length;
  const totalPayroll = payroll.reduce((sum, p) => sum + p.net_pay, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold">Gestión de Empleados</h2>
        <div className="flex gap-2">
          <Dialog open={isEmployeeModalOpen} onOpenChange={setIsEmployeeModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => {
                setEditingEmployee(null);
                resetEmployeeForm();
              }}>
                <UserPlus className="w-4 h-4 mr-2" />
                Nuevo Empleado
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingEmployee ? 'Editar Empleado' : 'Nuevo Empleado'}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="employee_id">ID Empleado</Label>
                    <Input
                      id="employee_id"
                      value={employeeForm.employee_id}
                      onChange={(e) => setEmployeeForm({...employeeForm, employee_id: e.target.value})}
                      placeholder="EMP001"
                    />
                  </div>
                  <div>
                    <Label htmlFor="first_name">Nombre *</Label>
                    <Input
                      id="first_name"
                      value={employeeForm.first_name}
                      onChange={(e) => setEmployeeForm({...employeeForm, first_name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="last_name">Apellido *</Label>
                    <Input
                      id="last_name"
                      value={employeeForm.last_name}
                      onChange={(e) => setEmployeeForm({...employeeForm, last_name: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={employeeForm.email}
                      onChange={(e) => setEmployeeForm({...employeeForm, email: e.target.value})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      value={employeeForm.phone}
                      onChange={(e) => setEmployeeForm({...employeeForm, phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="position">Posición</Label>
                    <Input
                      id="position"
                      value={employeeForm.position}
                      onChange={(e) => setEmployeeForm({...employeeForm, position: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="department">Departamento</Label>
                    <Select value={employeeForm.department} onValueChange={(value) => setEmployeeForm({...employeeForm, department: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar departamento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="administracion">Administración</SelectItem>
                        <SelectItem value="creditos">Créditos</SelectItem>
                        <SelectItem value="cobranzas">Cobranzas</SelectItem>
                        <SelectItem value="atencion_cliente">Atención al Cliente</SelectItem>
                        <SelectItem value="gerencia">Gerencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="hire_date">Fecha de Contratación</Label>
                    <Input
                      id="hire_date"
                      type="date"
                      value={employeeForm.hire_date}
                      onChange={(e) => setEmployeeForm({...employeeForm, hire_date: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="salary">Salario</Label>
                    <Input
                      id="salary"
                      type="number"
                      value={employeeForm.salary}
                      onChange={(e) => setEmployeeForm({...employeeForm, salary: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Estado</Label>
                    <Select value={employeeForm.status} onValueChange={(value: 'active' | 'inactive' | 'on_leave') => setEmployeeForm({...employeeForm, status: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="inactive">Inactivo</SelectItem>
                        <SelectItem value="on_leave">En Licencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="address">Dirección</Label>
                    <Textarea
                      id="address"
                      value={employeeForm.address}
                      onChange={(e) => setEmployeeForm({...employeeForm, address: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emergency_contact">Contacto de Emergencia</Label>
                    <Input
                      id="emergency_contact"
                      value={employeeForm.emergency_contact}
                      onChange={(e) => setEmployeeForm({...employeeForm, emergency_contact: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emergency_phone">Teléfono de Emergencia</Label>
                    <Input
                      id="emergency_phone"
                      value={employeeForm.emergency_phone}
                      onChange={(e) => setEmployeeForm({...employeeForm, emergency_phone: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notas</Label>
                    <Textarea
                      id="notes"
                      value={employeeForm.notes}
                      onChange={(e) => setEmployeeForm({...employeeForm, notes: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button variant="outline" onClick={() => setIsEmployeeModalOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={saveEmployee} disabled={loading}>
                  {loading ? 'Guardando...' : editingEmployee ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Empleados</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Licencia</CardTitle>
            <UserX className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{onLeaveEmployees}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nómina Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">RD${totalPayroll.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="employees">Empleados</TabsTrigger>
          <TabsTrigger value="shifts">Turnos</TabsTrigger>
          <TabsTrigger value="attendance">Asistencia</TabsTrigger>
          <TabsTrigger value="payroll">Nómina</TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          {/* Búsqueda */}
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar empleados..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Lista de empleados */}
          <div className="grid gap-4">
            {filteredEmployees.map((employee) => (
              <Card key={employee.id}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">
                          {employee.first_name} {employee.last_name}
                        </h3>
                        <Badge className={getStatusBadge(employee.status)}>
                          {getStatusText(employee.status)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4" />
                          <span>{employee.position} - {employee.department}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>{employee.email}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span>{employee.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span>RD${employee.salary.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span>Desde: {new Date(employee.hire_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          <span>{employee.address}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => editEmployee(employee)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => generatePayroll(employee.id)}
                      >
                        <DollarSign className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteEmployee(employee.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Gestión de Turnos</h3>
            <Dialog open={isShiftModalOpen} onOpenChange={setIsShiftModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => {
                  setEditingShift(null);
                  resetShiftForm();
                }}>
                  <Clock className="w-4 h-4 mr-2" />
                  Nuevo Turno
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingShift ? 'Editar Turno' : 'Nuevo Turno'}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="shift_employee">Empleado</Label>
                    <Select value={shiftForm.employee_id} onValueChange={(value) => setShiftForm({...shiftForm, employee_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.first_name} {employee.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="shift_date">Fecha</Label>
                    <Input
                      id="shift_date"
                      type="date"
                      value={shiftForm.date}
                      onChange={(e) => setShiftForm({...shiftForm, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="start_time">Hora Inicio</Label>
                    <Input
                      id="start_time"
                      type="time"
                      value={shiftForm.start_time}
                      onChange={(e) => setShiftForm({...shiftForm, start_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="end_time">Hora Fin</Label>
                    <Input
                      id="end_time"
                      type="time"
                      value={shiftForm.end_time}
                      onChange={(e) => setShiftForm({...shiftForm, end_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="break_start">Inicio Descanso</Label>
                    <Input
                      id="break_start"
                      type="time"
                      value={shiftForm.break_start}
                      onChange={(e) => setShiftForm({...shiftForm, break_start: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="break_end">Fin Descanso</Label>
                    <Input
                      id="break_end"
                      type="time"
                      value={shiftForm.break_end}
                      onChange={(e) => setShiftForm({...shiftForm, break_end: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="shift_notes">Notas</Label>
                  <Textarea
                    id="shift_notes"
                    value={shiftForm.notes}
                    onChange={(e) => setShiftForm({...shiftForm, notes: e.target.value})}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsShiftModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={saveShift} disabled={loading}>
                    {loading ? 'Guardando...' : editingShift ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {shifts.map((shift) => {
              const employee = employees.find(e => e.id === shift.employee_id);
              return (
                <Card key={shift.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">
                            {employee?.first_name} {employee?.last_name}
                          </h4>
                          <Badge className={getStatusBadge(shift.status)}>
                            {getStatusText(shift.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(shift.date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>{shift.start_time} - {shift.end_time}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            <span>{shift.total_hours.toFixed(1)} hrs</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Award className="h-4 w-4" />
                            <span>{shift.overtime_hours.toFixed(1)} hrs extra</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingShift(shift);
                            setShiftForm({
                              employee_id: shift.employee_id,
                              date: shift.date,
                              start_time: shift.start_time,
                              end_time: shift.end_time,
                              break_start: shift.break_start || '',
                              break_end: shift.break_end || '',
                              notes: shift.notes
                            });
                            setIsShiftModalOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Control de Asistencia</h3>
            <Dialog open={isAttendanceModalOpen} onOpenChange={setIsAttendanceModalOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => resetAttendanceForm()}>
                  <UserCheck className="w-4 h-4 mr-2" />
                  Marcar Asistencia
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Registrar Asistencia</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="attendance_employee">Empleado</Label>
                    <Select value={attendanceForm.employee_id} onValueChange={(value) => setAttendanceForm({...attendanceForm, employee_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((employee) => (
                          <SelectItem key={employee.id} value={employee.id}>
                            {employee.first_name} {employee.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="attendance_date">Fecha</Label>
                    <Input
                      id="attendance_date"
                      type="date"
                      value={attendanceForm.date}
                      onChange={(e) => setAttendanceForm({...attendanceForm, date: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="check_in">Hora Entrada</Label>
                    <Input
                      id="check_in"
                      type="time"
                      value={attendanceForm.check_in}
                      onChange={(e) => setAttendanceForm({...attendanceForm, check_in: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="check_out">Hora Salida</Label>
                    <Input
                      id="check_out"
                      type="time"
                      value={attendanceForm.check_out}
                      onChange={(e) => setAttendanceForm({...attendanceForm, check_out: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="attendance_notes">Notas</Label>
                    <Textarea
                      id="attendance_notes"
                      value={attendanceForm.notes}
                      onChange={(e) => setAttendanceForm({...attendanceForm, notes: e.target.value})}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAttendanceModalOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={markAttendance} disabled={loading}>
                    {loading ? 'Registrando...' : 'Registrar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid gap-4">
            {attendance.map((record) => {
              const employee = employees.find(e => e.id === record.employee_id);
              return (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">
                            {employee?.first_name} {employee?.last_name}
                          </h4>
                          <Badge className={getStatusBadge(record.status)}>
                            {getStatusText(record.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(record.date).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4" />
                            <span>Entrada: {record.check_in}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4" />
                            <span>Salida: {record.check_out || 'N/A'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>{record.total_hours?.toFixed(1) || 0} hrs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="payroll" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Nómina</h3>
          </div>

          <div className="grid gap-4">
            {payroll.map((record) => {
              const employee = employees.find(e => e.id === record.employee_id);
              return (
                <Card key={record.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-semibold">
                            {employee?.first_name} {employee?.last_name}
                          </h4>
                          <Badge className={getStatusBadge(record.status)}>
                            {getStatusText(record.status)}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Período:</span>
                              <span>{new Date(record.pay_period_start).toLocaleDateString()} - {new Date(record.pay_period_end).toLocaleDateString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Salario Base:</span>
                              <span>RD${record.base_salary.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Horas Extra:</span>
                              <span>RD${record.overtime_pay.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span>Bonificaciones:</span>
                              <span>RD${record.bonuses.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Deducciones:</span>
                              <span>RD${record.deductions.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between font-semibold">
                              <span>Pago Neto:</span>
                              <span>RD${record.net_pay.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
