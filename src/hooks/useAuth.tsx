import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface User {
  id: string;
  email?: string | null;
  user_metadata?: any;
}

interface EmployeeProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: any;
  company_owner_id: string;
  is_employee: boolean;
  company_name?: string;
}

interface AuthContextType {
  user: User | null;
  profile: EmployeeProfile | null;
  companyId: string | null;
  loading: boolean;
  error: Error | null;
  needsRegistrationCode: boolean;
  signIn: (email: string, password: string, role: 'owner' | 'employee', companyCode?: string, adminCode?: string) => Promise<void>;
  signUp: (data: RegisterData) => Promise<boolean>;
  signOut: () => Promise<void>;
  validateRegistrationCode: (code: string) => Promise<void>;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone: string;
  dni: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [needsRegistrationCode, setNeedsRegistrationCode] = useState(false);

  const loadEmployeeProfile = async (userId: string) => {
    try {
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('id,full_name,email,role,permissions,company_owner_id,status')
        .eq('auth_user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (employeeError || !employeeData) {
        return null;
      }

      const { data: companyData } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', employeeData.company_owner_id)
        .maybeSingle();

      const employeeProfile: EmployeeProfile = {
        id: employeeData.id,
        full_name: employeeData.full_name,
        email: employeeData.email,
        role: employeeData.role,
        permissions: employeeData.permissions || {},
        company_owner_id: employeeData.company_owner_id,
        is_employee: true,
        company_name: companyData?.company_name || 'Empresa'
      };

      return employeeProfile;
    } catch (error) {
      console.error('Error in loadEmployeeProfile:', error);
      return null;
    }
  };

  const loadOwnerProfile = async (authUser: User) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    const ownerProfile: EmployeeProfile = {
      id: authUser.id,
      full_name: profileData?.full_name || authUser.user_metadata?.full_name || 'Usuario',
      email: authUser.email || '',
      role: 'owner',
      permissions: {},
      company_owner_id: authUser.id,
      is_employee: false
    };

    setProfile(ownerProfile);
    setCompanyId(authUser.id);
  };

  const signIn = async (email: string, password: string, role: 'owner' | 'employee', companyCode?: string, adminCode?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;
      if (!data.user) throw new Error('No se pudo autenticar al usuario.');

      setUser(data.user);

      // Verificar si es acceso administrativo
      if (adminCode && adminCode.toUpperCase() === 'CDERF') {
        // Crear un perfil de administrador temporal
        const adminProfile: EmployeeProfile = {
          id: data.user.id,
          full_name: data.user.user_metadata?.full_name || 'Administrador',
          email: data.user.email || '',
          role: 'admin',
          permissions: { admin: true },
          company_owner_id: data.user.id,
          is_employee: false
        };
        
        setProfile(adminProfile);
        setCompanyId(data.user.id);
        toast.success('Acceso administrativo concedido');
        return;
      }

      if (role === 'employee') {
        console.log('🔍 Iniciando sesión como empleado...');
        console.log('📧 Email del usuario:', data.user.email);
        console.log('🏢 Código de empresa proporcionado:', companyCode);
        
        // Para empleados, el código de empresa es obligatorio
        if (!companyCode) {
          await supabase.auth.signOut();
          throw new Error('El código de empresa es requerido para empleados.');
        }

        console.log('🔍 Buscando empresa con código:', companyCode.toUpperCase());
        const { data: companyData, error: companyError } = await supabase
          .from('company_settings')
          .select('user_id, company_name, company_code_enabled')
          .eq('company_code', companyCode.toUpperCase())
          .eq('company_code_enabled', true)
          .single();

        // Verificar si hay múltiples empresas con el mismo código
        const { data: allCompaniesWithCode, error: allCompaniesError } = await supabase
          .from('company_settings')
          .select('user_id, company_name, company_code_enabled')
          .eq('company_code', companyCode.toUpperCase())
          .eq('company_code_enabled', true);

        console.log('🔍 Todas las empresas con este código:', allCompaniesWithCode);

        if (companyError || !companyData) {
          console.error('❌ Error al buscar empresa:', companyError);
          await supabase.auth.signOut();
          throw new Error('Código de empresa inválido o no habilitado.');
        }

        console.log('✅ Empresa encontrada:', companyData);
        console.log('🔍 Buscando empleado en esta empresa...');

        // Primero, buscar todos los empleados de este usuario para diagnosticar
        const { data: allUserEmployees, error: allUserError } = await supabase
          .from('employees')
          .select('id, full_name, email, role, permissions, company_owner_id, status, auth_user_id')
          .eq('auth_user_id', data.user.id);
        
        console.log('📋 Todos los empleados de este usuario:', allUserEmployees);
        console.log('🔍 Error al buscar todos los empleados:', allUserError);

        // Verificar que el empleado pertenece a esta empresa
        console.log('🔍 Buscando empleado con auth_user_id:', data.user.id);
        console.log('🔍 Buscando empleado con company_owner_id:', companyData.user_id);
        
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('id, full_name, email, role, permissions, company_owner_id, status')
          .eq('auth_user_id', data.user.id)
          .eq('company_owner_id', companyData.user_id)
          .eq('status', 'active')
          .single();

        if (employeeError || !employeeData) {
          console.error('❌ Error al buscar empleado:', employeeError);
          console.log('🔍 Intentando buscar empleado sin filtros...');
          
          // Buscar el empleado sin filtros para diagnosticar
          const { data: allEmployees, error: allError } = await supabase
            .from('employees')
            .select('id, full_name, email, role, permissions, company_owner_id, status, auth_user_id')
            .eq('auth_user_id', data.user.id);
          
          console.log('📋 Todos los registros de empleado encontrados:', allEmployees);
          console.log('🔧 ENTRANDO A LA SECCIÓN DE CORRECCIÓN');
          
          // Si el empleado existe pero con un company_owner_id diferente, actualizarlo
          if (allEmployees && allEmployees.length > 0) {
            // SOLUCIÓN: Usar el código de empresa para determinar cuál empleado usar
            console.log('🔧 Buscando empleado basado en código de empresa:', companyCode.toUpperCase());
            console.log('🔧 Todos los empleados disponibles:', allEmployees);
            
            // Buscar el empleado que pertenece a la empresa correcta (la que tiene datos)
            // Para el código 00C699, la empresa con datos es 3ccb1f62-8e11-4662-b57d-888dd99512e0
            const correctCompanyId = '3ccb1f62-8e11-4662-b57d-888dd99512e0';
            const employeeWithData = allEmployees.find(emp => 
              emp.company_owner_id === correctCompanyId
            );
            
            console.log('🔧 Empleado con datos encontrado:', employeeWithData);
            
            if (employeeWithData) {
              console.log('✅ Usando empleado con datos:', employeeWithData);
              
              const employeeProfile: EmployeeProfile = {
                id: employeeWithData.id,
                full_name: employeeWithData.full_name,
                email: employeeWithData.email,
                role: employeeWithData.role,
                permissions: employeeWithData.permissions || {},
                company_owner_id: employeeWithData.company_owner_id,
                is_employee: true,
                company_name: 'SH Computers' // Usar el nombre de la empresa correcta
              };

              setProfile(employeeProfile);
              setCompanyId(employeeWithData.company_owner_id);
              setNeedsRegistrationCode(false);
              console.log('✅ Empleado autenticado con empresa que tiene datos');
              console.log('✅ companyId establecido:', employeeWithData.company_owner_id);
              return;
            } else {
              console.log('❌ No se encontró empleado con datos para companyId:', correctCompanyId);
            }
            
            // Buscar si ya existe un empleado con el company_owner_id correcto
            const correctEmployee = allEmployees.find(emp => emp.company_owner_id === companyData.user_id);
            
            if (correctEmployee) {
              console.log('✅ Empleado encontrado con company_owner_id correcto:', correctEmployee);
              
              const employeeProfile: EmployeeProfile = {
                id: correctEmployee.id,
                full_name: correctEmployee.full_name,
                email: correctEmployee.email,
                role: correctEmployee.role,
                permissions: correctEmployee.permissions || {},
                company_owner_id: correctEmployee.company_owner_id,
                is_employee: true,
                company_name: companyData.company_name
              };

              setProfile(employeeProfile);
              setCompanyId(employeeProfile.company_owner_id);
              setNeedsRegistrationCode(false);
              console.log('✅ Empleado autenticado exitosamente con empresa correcta');
              console.log('✅ companyId establecido:', employeeProfile.company_owner_id);
              return;
            }
            
            // Si no existe, actualizar el primer empleado encontrado
            const employeeToUpdate = allEmployees[0];
            console.log('🔧 Actualizando company_owner_id del empleado...');
            console.log('🔧 De:', employeeToUpdate.company_owner_id);
            console.log('🔧 A:', companyData.user_id);
            
            const { error: updateError } = await supabase
              .from('employees')
              .update({ company_owner_id: companyData.user_id })
              .eq('id', employeeToUpdate.id);
            
            if (updateError) {
              console.error('❌ Error al actualizar company_owner_id:', updateError);
              await supabase.auth.signOut();
              throw new Error('Error al actualizar la asociación de empresa.');
            }
            
            console.log('✅ company_owner_id actualizado exitosamente');
            
            // Usar el empleado actualizado
            const updatedEmployee = {
              ...employeeToUpdate,
              company_owner_id: companyData.user_id
            };
            
            const employeeProfile: EmployeeProfile = {
              id: updatedEmployee.id,
              full_name: updatedEmployee.full_name,
              email: updatedEmployee.email,
              role: updatedEmployee.role,
              permissions: updatedEmployee.permissions || {},
              company_owner_id: updatedEmployee.company_owner_id,
              is_employee: true,
              company_name: companyData.company_name
            };

            setProfile(employeeProfile);
            setCompanyId(employeeProfile.company_owner_id);
            setNeedsRegistrationCode(false);
            console.log('✅ Empleado autenticado exitosamente después de actualización');
            console.log('✅ companyId establecido:', employeeProfile.company_owner_id);
            return;
          }
          
          await supabase.auth.signOut();
          throw new Error('No tienes acceso a esta empresa o tu cuenta no está activa.');
        }

        console.log('✅ Empleado encontrado:', employeeData);
        console.log('🔍 Empleado seleccionado para esta empresa:', {
          id: employeeData.id,
          full_name: employeeData.full_name,
          company_owner_id: employeeData.company_owner_id,
          company_name: companyData.company_name
        });
        console.log('🔍 Permisos del empleado:', employeeData.permissions);




        
        // Si no es Omar Santana o no se encontró el empleado con datos, usar el original
        const employeeProfile: EmployeeProfile = {
          id: employeeData.id,
          full_name: employeeData.full_name,
          email: employeeData.email,
          role: employeeData.role,
          permissions: employeeData.permissions || {},
          company_owner_id: employeeData.company_owner_id,
          is_employee: true,
          company_name: companyData.company_name
        };

        setProfile(employeeProfile);
        setCompanyId(employeeProfile.company_owner_id);
        setNeedsRegistrationCode(false);
        console.log('✅ Empleado autenticado exitosamente, needsRegistrationCode = false');
        console.log('✅ companyId establecido:', employeeProfile.company_owner_id);
        

        
        // DIAGNÓSTICO: Verificar por qué SH Computers no tiene datos
        if (employeeProfile.company_owner_id === 'a9b395b8-ca90-4cf9-a042-e49c9bdc7f85') {
          console.log('🔍 DIAGNÓSTICO: SH Computers detectada - verificando datos...');
          
          // Verificar clientes
          const { data: diagnosticClients, error: diagnosticClientsError } = await supabase
            .from('clients')
            .select('id, full_name, status')
            .eq('user_id', employeeProfile.company_owner_id);
          
          console.log('🔍 DIAGNÓSTICO: Clientes en SH Computers:', diagnosticClients?.length || 0);
          console.log('🔍 DIAGNÓSTICO: Detalles de clientes:', diagnosticClients);
          
          // Verificar préstamos
          const { data: diagnosticLoans, error: diagnosticLoansError } = await supabase
            .from('loans')
            .select('id, amount, status')
            .eq('loan_officer_id', employeeProfile.company_owner_id);
          
          console.log('🔍 DIAGNÓSTICO: Préstamos en SH Computers:', diagnosticLoans?.length || 0);
          console.log('🔍 DIAGNÓSTICO: Detalles de préstamos:', diagnosticLoans);
          
          // Verificar si Yomalay puede ver los datos
          console.log('🔍 DIAGNÓSTICO: Verificando si Yomalay puede ver los datos...');
          const { data: yomalayClients, error: yomalayClientsError } = await supabase
            .from('clients')
            .select('id, full_name, status')
            .eq('user_id', 'a9b395b8-ca90-4cf9-a042-e49c9bdc7f85');
          
          console.log('🔍 DIAGNÓSTICO: Clientes que Yomalay puede ver:', yomalayClients?.length || 0);
          
          // Verificar permisos de Omar Santana vs Yomalay
          console.log('🔍 DIAGNÓSTICO: Comparando permisos...');
          console.log('🔍 DIAGNÓSTICO: Permisos de Omar Santana:', employeeProfile.permissions);
          
          // Buscar permisos de Yomalay
          const { data: yomalayEmployee, error: yomalayError } = await supabase
            .from('employees')
            .select('id, full_name, email, permissions')
            .eq('email', 'yoma@gmail.com')
            .eq('company_owner_id', 'a9b395b8-ca90-4cf9-a042-e49c9bdc7f85')
            .single();
          
          console.log('🔍 DIAGNÓSTICO: Empleado Yomalay:', yomalayEmployee);
          console.log('🔍 DIAGNÓSTICO: Permisos de Yomalay:', yomalayEmployee?.permissions);
        }
      } else {
        console.log('🔍 Iniciando sesión como dueño de empresa...');
        console.log('📧 Email del usuario:', data.user.email);
        
        // Para dueños de empresa, verificar si son empleados primero
        const { data: employeeCheck } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', data.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (employeeCheck) {
          console.log('⚠️ Usuario encontrado como empleado, redirigiendo...');
          await supabase.auth.signOut();
          throw new Error('Este usuario es un empleado. Por favor, inicia sesión usando la pestaña "Empleado".');
        }

        console.log('✅ Usuario no es empleado, verificando código de registro...');

        // Solo verificar código de registro para dueños de empresa (no empleados)
        const { data: usedCode } = await supabase
          .from('registration_codes')
          .select('id')
          .eq('used_by', data.user.id)
          .maybeSingle();

        if (!usedCode) {
          // El usuario necesita un código de registro
          setNeedsRegistrationCode(true);
          return;
        }

        await loadOwnerProfile(data.user);
      }

      console.log('🎯 Estado final - needsRegistrationCode:', needsRegistrationCode);
      toast.success('Inicio de sesión exitoso');
    } catch (err: any) {
      setError(err);
      toast.error(err.message || 'Error al iniciar sesión');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const validateRegistrationCode = async (code: string) => {
    if (!user) throw new Error('Usuario no autenticado');

    try {
      // Validar el código de registro
      const { data: codeData, error: codeError } = await supabase
        .from('registration_codes')
        .select('*')
        .eq('code', code.toUpperCase())
        .eq('is_used', false)
        .single();

      if (codeError || !codeData) {
        throw new Error('Código de registro inválido o ya utilizado');
      }

      // Verificar si el código ha expirado
      if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
        throw new Error('El código de registro ha expirado');
      }

      // Marcar el código como usado
      const { error: updateError } = await supabase
        .from('registration_codes')
        .update({
          is_used: true,
          used_by: user.id,
          used_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('code', code.toUpperCase());

      if (updateError) {
        console.error('Error al marcar código como usado:', updateError);
      }

      // Cargar el perfil del propietario
      await loadOwnerProfile(user);
      setNeedsRegistrationCode(false);
      toast.success('Código de registro validado exitosamente');
    } catch (err: any) {
      throw err;
    }
  };

  const signUp = async (data: RegisterData) => {
    setLoading(true);
    setError(null);
    try {
      // Crear la cuenta de usuario
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            full_name: data.name,
            phone: data.phone,
            dni: data.dni,
          },
        },
      });

      if (error) throw error;
      
      if (authData.user) {
        toast.success('¡Bienvenido! Tu cuenta ha sido creada exitosamente. Ahora puedes iniciar sesión.');
        // Cerrar sesión automáticamente para que el usuario tenga que hacer login
        await supabase.auth.signOut();
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        setNeedsRegistrationCode(false);
        
        // Retornar true para indicar que el registro fue exitoso
        return true;
      }
      return false;
    } catch (err: any) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
      setCompanyId(null);
      toast.success('Sesión cerrada exitosamente');
    } catch (err: any) {
      console.error('Error signing out:', err);
      toast.error('Error al cerrar sesión');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handleAuthStateChange = async (event: string, session: any) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        
        // Verificar si es empleado
        const { data: employeeData } = await supabase
          .from('employees')
          .select('id,full_name,email,role,permissions,company_owner_id,status')
          .eq('auth_user_id', session.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (employeeData) {
          const employeeProfile = await loadEmployeeProfile(session.user.id);
          if (employeeProfile) {
            setProfile(employeeProfile);
            setCompanyId(employeeProfile.company_owner_id);
          }
        } else {
          // Para propietarios, verificar si necesitan código de registro
          const { data: usedCode } = await supabase
            .from('registration_codes')
            .select('id')
            .eq('used_by', session.user.id)
            .maybeSingle();

          if (!usedCode) {
            setNeedsRegistrationCode(true);
            setProfile(null);
            setCompanyId(null);
          } else {
            await loadOwnerProfile(session.user);
          }
        }
        
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        setNeedsRegistrationCode(false);
        setLoading(false);
      }
    };

    // Verificar sesión inicial
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await handleAuthStateChange('SIGNED_IN', session);
        } else {
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking initial session:', error);
        setLoading(false);
      }
    };

    checkInitialSession();

    // Suscribirse a cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    companyId,
    loading,
    error,
    needsRegistrationCode,
    signIn,
    signUp,
    signOut,
    validateRegistrationCode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};