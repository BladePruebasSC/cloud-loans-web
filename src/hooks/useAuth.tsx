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
  signIn: (email: string, password: string, role: 'owner' | 'employee') => Promise<void>;
  signUp: (data: RegisterData) => Promise<void>;
  signOut: () => Promise<void>;
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

  const loadEmployeeProfile = async (userId: string) => {
    try {
      console.log('Loading employee profile for user:', userId);
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select('id,full_name,email,role,permissions,company_owner_id,status')
        .eq('auth_user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (employeeError) {
        console.error('Error loading employee profile:', employeeError);
        return null;
      }

      if (!employeeData) {
        console.log('No employee profile found for user:', userId);
        return null;
      }

      console.log('Employee profile loaded:', employeeData);

      // Cargar datos de la empresa empleadora
      const { data: companyData, error: companyError } = await supabase
        .from('company_settings')
        .select('company_name')
        .eq('user_id', employeeData.company_owner_id)
        .maybeSingle();

      if (companyError) {
        console.error('Error loading company data:', companyError);
      }

      console.log('Company data for employee:', companyData);

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
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

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
    console.log('Owner logged in:', ownerProfile);
  };

  const signIn = async (email: string, password: string, role: 'owner' | 'employee') => {
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

      if (role === 'employee') {
        const employeeProfile = await loadEmployeeProfile(data.user.id);
        if (!employeeProfile) {
          // Cerrar sesión si no se encuentra perfil de empleado
          await supabase.auth.signOut();
          throw new Error('No se encontró un perfil de empleado activo para este usuario. Por favor, inicia sesión como Dueño de Empresa o contacta al administrador.');
        }
        
        setProfile(employeeProfile);
        setCompanyId(employeeProfile.company_owner_id);
        console.log('Employee profile set:', employeeProfile);
        console.log('Company ID set to:', employeeProfile.company_owner_id);
      } else {
        // Verificar que el usuario no sea un empleado intentando entrar como dueño
        const { data: employeeCheck, error: employeeCheckError } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', data.user.id)
          .eq('status', 'active')
          .maybeSingle();

        if (employeeCheckError) {
          console.error('Error checking employee status:', employeeCheckError);
        }

        if (employeeCheck) {
          // Cerrar sesión si es un empleado intentando entrar como dueño
          await supabase.auth.signOut();
          throw new Error('Este usuario es un empleado. Por favor, inicia sesión usando la pestaña "Empleado".');
        }

        await loadOwnerProfile(data.user);
      }

      toast.success('Inicio de sesión exitoso');
    } catch (err: any) {
      setError(err);
      console.error('Error signing in:', err);
      toast.error(err.message || 'Error al iniciar sesión');
      throw new Error(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (data: RegisterData) => {
    setLoading(true);
    setError(null);
    try {
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

      if (error) {
        setError(error);
        throw error;
      }

      if (authData.user) {
        toast.success('Cuenta creada exitosamente');
      }
    } catch (err: any) {
      setError(err);
      console.error('Error signing up:', err);
      throw new Error(err.message || 'Error al crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error && error.message !== 'Auth session missing!' && !error.message.includes('session_not_found')) {
        setError(error);
        throw error;
      }
      setUser(null);
      setProfile(null);
      setCompanyId(null);
      toast.success('Sesión cerrada exitosamente');
    } catch (err: any) {
      // If it's a session not found error, treat it as successful logout
      if (err.message === 'Auth session missing!' || err.message.includes('session_not_found')) {
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        toast.success('Sesión cerrada exitosamente');
      } else {
        setError(err);
        console.error('Error signing out:', err);
        toast.error('Error al cerrar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const value = {
    user,
    profile,
    companyId,
    loading,
    error,
    signIn,
    signUp,
    signOut,
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