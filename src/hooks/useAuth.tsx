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

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone: string;
  dni: string;
}

interface CompanySettings {
  currency: string | null;
  interest_rate_default: number | null;
  late_fee_percentage: number | null;
  grace_period_days: number | null;
  default_grace_period_days: number | null;
  min_loan_amount: number | null;
  max_loan_amount: number | null;
  min_term_months: number | null;
  max_term_months: number | null;
  default_late_fee_rate: number | null;
  default_pawn_period_days: number | null;
  default_capital_payment_penalty_percentage: number | null;
  document_templates?: any;
  company_name?: string;
  notify_late_fees?: boolean | null;
  notify_rate_changes?: boolean | null;
  notify_payment_reminders?: boolean | null;
  notify_loan_approvals?: boolean | null;
  notify_loan_rejections?: boolean | null;
  ask_whatsapp_before_send?: boolean | null;
}

interface AuthContextType {
  user: User | null;
  profile: EmployeeProfile | null;
  companyId: string | null;
  companySettings: CompanySettings | null;
  refreshCompanySettings: () => Promise<void>;
  loading: boolean;
  error: Error | null;
  needsRegistrationCode: boolean;
  signIn: (email: string, password: string, role: 'owner' | 'employee', companyCode?: string, adminCode?: string) => Promise<void>;
  signUp: (data: RegisterData) => Promise<boolean>;
  signOut: () => Promise<void>;
  validateRegistrationCode: (code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [needsRegistrationCode, setNeedsRegistrationCode] = useState(false);

  // Timeout de seguridad para evitar cargas infinitas
  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (loading) {
        console.warn('⚠️ Timeout de seguridad: Forzando finalización de carga');
        setLoading(false);
        setError(new Error('La carga se demoró demasiado. Por favor, recarga la página.'));
      }
    }, 5000); // 5 segundos de timeout

    return () => clearTimeout(safetyTimeout);
  }, [loading]);

  const loadEmployeeProfile = async (userId: string) => {
    try {
      // Timeout para evitar cargas infinitas
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const profilePromise = async () => {
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
      };

      return await Promise.race([profilePromise(), timeoutPromise]) as EmployeeProfile | null;
    } catch (error) {
      console.error('Error in loadEmployeeProfile:', error);
      return null;
    }
  };

  const loadCompanySettings = async (ownerId: string) => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('currency, interest_rate_default, late_fee_percentage, grace_period_days, default_grace_period_days, min_loan_amount, max_loan_amount, min_term_months, max_term_months, default_late_fee_rate, default_pawn_period_days, default_capital_payment_penalty_percentage, document_templates, company_name, notify_late_fees, notify_rate_changes, notify_payment_reminders, notify_loan_approvals, notify_loan_rejections, ask_whatsapp_before_send')
        .eq('user_id', ownerId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        console.error('Error loading company settings:', error);
        return;
      }
      setCompanySettings(data || null);
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  };

  const loadOwnerProfile = async (authUser: User) => {
    try {
      // Timeout para evitar cargas infinitas
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 5000)
      );

      const profilePromise = async () => {
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

      await Promise.race([profilePromise(), timeoutPromise]);
    } catch (error) {
      console.error('Error in loadOwnerProfile:', error);
      // En caso de error, establecer valores por defecto
      const fallbackProfile: EmployeeProfile = {
        id: authUser.id,
        full_name: authUser.user_metadata?.full_name || 'Usuario',
        email: authUser.email || '',
        role: 'owner',
        permissions: {},
        company_owner_id: authUser.id,
        is_employee: false
      };
      setProfile(fallbackProfile);
      setCompanyId(authUser.id);
    }
  };

  const ensureOwnerAccessWithoutCode = async (authUser: User) => {
    try {
      const { data: existingCompany } = await supabase
        .from('company_settings')
        .select('user_id')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (existingCompany) {
        console.warn('⚠️ No se encontró código de registro, pero la empresa existe. Omitiendo verificación para evitar bloqueo post-reset.');
        await loadOwnerProfile(authUser);
        setNeedsRegistrationCode(false);
        return true;
      }
    } catch (error) {
      console.error('Error verifying company settings for owner access:', error);
    }
    return false;
  };

  const signIn = async (email: string, password: string, role: 'owner' | 'employee', companyCode?: string, adminCode?: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      // Si el error es de email no confirmado y es un empleado, intentar confirmar automáticamente
      const errorMessage = error?.message?.toLowerCase() || '';
      const errorCode = error?.status || error?.code || '';
      const isEmailNotConfirmed = 
        errorMessage.includes('email_not_confirmed') || 
        errorMessage.includes('email not confirmed') || 
        errorMessage.includes('correo no confirmado') ||
        errorMessage.includes('correo electrónico no está confirmado') ||
        errorCode === 'email_not_confirmed' ||
        error?.name === 'EmailNotConfirmed';

      if (error && isEmailNotConfirmed) {
        if (role === 'employee') {
          console.log('🔍 Email no confirmado detectado para empleado, intentando confirmar automáticamente...');
          console.log('🔍 Error completo:', error);
          
          try {
            // Intentar confirmar el correo usando la función Edge Function (sin autenticación requerida)
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jabiezfpkfyzfpiswcwz.supabase.co';
            console.log('🔍 Llamando a función para confirmar correo:', `${supabaseUrl}/functions/v1/confirm-employee-email`);
            
            const response = await fetch(`${supabaseUrl}/functions/v1/confirm-employee-email`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email }),
            });

            console.log('🔍 Respuesta de confirmación:', response.status, response.statusText);

            if (response.ok) {
              console.log('✅ Correo confirmado automáticamente, reintentando login...');
              // Esperar un momento para que Supabase procese la confirmación
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Reintentar el login después de confirmar el correo
              const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
                email,
                password,
              });

              if (retryError) {
                console.error('❌ Error al reintentar login:', retryError);
                throw retryError;
              }
              if (!retryData.user) {
                throw new Error('No se pudo autenticar al usuario después de confirmar el correo.');
              }

              // Continuar con el flujo normal usando retryData
              const data = retryData;
              setUser(data.user);
            } else {
              const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
              console.error('❌ Error al confirmar correo automáticamente:', errorData);
              throw new Error('Tu correo electrónico no está confirmado. Por favor, contacta al administrador para confirmar tu correo.');
            }
          } catch (confirmError: any) {
            console.error('Error al confirmar correo:', confirmError);
            throw new Error('Tu correo electrónico no está confirmado. Por favor, contacta al administrador para confirmar tu correo.');
          }
        } else {
          throw error;
        }
      } else if (error) {
        throw error;
      }

      if (!data?.user) throw new Error('No se pudo autenticar al usuario.');

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
            return;
          }
          
          await supabase.auth.signOut();
          throw new Error('No tienes acceso a esta empresa o tu cuenta no está activa.');
        }

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
          .select('id, expires_at')
          .eq('used_by', data.user.id)
          .maybeSingle();

        if (!usedCode) {
          const recovered = await ensureOwnerAccessWithoutCode(data.user);
          if (!recovered) {
            setNeedsRegistrationCode(true);
            return;
          }
        } else if (usedCode.expires_at) {
          const expirationDate = new Date(usedCode.expires_at);
          const now = new Date();
          
          if (expirationDate < now) {
            console.log('⚠️ El código de registro usado ha expirado. Intentando recuperar acceso basado en configuración existente.');
            const recovered = await ensureOwnerAccessWithoutCode(data.user);
            if (!recovered) {
              setNeedsRegistrationCode(true);
              return;
            }
          } else {
            await loadOwnerProfile(data.user);
          }
        } else {
          await loadOwnerProfile(data.user);
        }
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
    try {
      // Limpiar el estado primero para evitar problemas
      setUser(null);
      setProfile(null);
      setCompanyId(null);
      setNeedsRegistrationCode(false);
      setError(null);
      
      // Luego cerrar sesión en Supabase
      await supabase.auth.signOut();
      
      toast.success('Sesión cerrada exitosamente');
    } catch (err: any) {
      console.error('Error signing out:', err);
      // Aún así, limpiar el estado local
      setUser(null);
      setProfile(null);
      setCompanyId(null);
      setNeedsRegistrationCode(false);
      setError(null);
      toast.error('Error al cerrar sesión');
    } finally {
      setLoading(false);
    }
  };

  const refreshCompanySettings = async () => {
    if (companyId) {
      await loadCompanySettings(companyId);
    }
  };

  useEffect(() => {
    if (companyId) {
      loadCompanySettings(companyId);
    } else {
      setCompanySettings(null);
    }
  }, [companyId]);

  useEffect(() => {
    let hasInitialized = false;

    const handleAuthStateChange = async (event: string, session: any) => {
      // Solo procesar SIGNED_OUT para limpiar la sesión
      if (event === 'SIGNED_OUT') {
        console.log('🔍 SIGNED_OUT detectado, limpiando estado...');
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        setNeedsRegistrationCode(false);
        setError(null);
        setLoading(false);
        hasInitialized = false;
        return;
      }

      // Solo procesar SIGNED_IN una vez para evitar re-procesamiento
      if (event === 'SIGNED_IN' && session?.user && !hasInitialized) {
        hasInitialized = true;
        setUser(session.user);
        
        try {
          // Timeout muy corto para evitar cargas largas
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 3000)
          );

          const authPromise = async () => {
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
                .select('id, expires_at')
                .eq('used_by', session.user.id)
                .maybeSingle();

              if (!usedCode) {
                const recovered = await ensureOwnerAccessWithoutCode(session.user);
                if (!recovered) {
                  setNeedsRegistrationCode(true);
                  setProfile(null);
                  setCompanyId(null);
                }
              } else if (usedCode.expires_at) {
                const expirationDate = new Date(usedCode.expires_at);
                const now = new Date();
                
                if (expirationDate < now) {
                  console.log('⚠️ El código de registro usado ha expirado (session). Intentando recuperación.');
                  const recovered = await ensureOwnerAccessWithoutCode(session.user);
                  if (!recovered) {
                    setNeedsRegistrationCode(true);
                    setProfile(null);
                    setCompanyId(null);
                  }
                } else {
                  await loadOwnerProfile(session.user);
                }
              } else {
                await loadOwnerProfile(session.user);
              }
            }
          };

          await Promise.race([authPromise(), timeoutPromise]);
        } catch (error) {
          console.error('Error en autenticación:', error);
          // En caso de error o timeout, verificar si el usuario aún existe
          if (session?.user) {
            try {
              // Intentar verificar código de registro de forma más simple
              const { data: usedCode } = await supabase
                .from('registration_codes')
                .select('id, expires_at')
                .eq('used_by', session.user.id)
                .maybeSingle();
              
              if (!usedCode) {
                const recovered = await ensureOwnerAccessWithoutCode(session.user);
                if (!recovered) {
                  setNeedsRegistrationCode(true);
                  setProfile(null);
                  setCompanyId(null);
                }
              } else {
                // Si tiene código usado, intentar cargar perfil
                await loadOwnerProfile(session.user);
                setNeedsRegistrationCode(false);
              }
            } catch (fallbackError) {
              console.error('Error en fallback de autenticación:', fallbackError);
              // Si todo falla, establecer needsRegistrationCode para que el usuario pueda ingresar código
              setNeedsRegistrationCode(true);
              setProfile(null);
              setCompanyId(null);
            }
          } else {
            // Si no hay usuario, limpiar todo
            setUser(null);
            setProfile(null);
            setCompanyId(null);
            setNeedsRegistrationCode(false);
          }
        }
        
        setLoading(false);
      }
    };

    // Verificar sesión inicial de manera simple
    const checkInitialSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('✅ Sesión encontrada:', session.user.email);
          await handleAuthStateChange('SIGNED_IN', session);
        } else {
          console.log('ℹ️ No hay sesión activa');
          setLoading(false);
        }
      } catch (error) {
        console.error('Error checking initial session:', error);
        setLoading(false);
      }
    };

    // Verificar sesión inicial inmediatamente
    checkInitialSession();

    // Suscribirse SOLO a SIGNED_OUT para evitar conflictos
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        handleAuthStateChange(event, session);
      }
      // Ignorar SIGNED_IN y otros eventos para evitar re-procesamiento
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    companyId,
    companySettings,
    refreshCompanySettings,
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