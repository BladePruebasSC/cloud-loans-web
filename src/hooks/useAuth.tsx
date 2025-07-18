import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
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
  signIn: (email: string, password: string) => Promise<void>;
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

  useEffect(() => {
    setLoading(true);
    setError(null);
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        await loadUserProfile(session.user);
      } else {
        setUser(null);
        setProfile(null);
        setCompanyId(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (authUser: User) => {
    setLoading(true);
    setError(null);
    try {
      const { data: employeeData, error: employeeError } = await supabase
        .from('employees')
        .select(`
          id,
          full_name,
          email,
          role,
          permissions,
          company_owner_id,
          status,
          company_settings:company_owner_id (
            company_name
          )
        `)
        .eq('auth_user_id', authUser.id)
        .eq('status', 'active')
        .single();

      if (employeeData && !employeeError) {
        const employeeProfile: EmployeeProfile = {
          id: employeeData.id,
          full_name: employeeData.full_name,
          email: employeeData.email,
          role: employeeData.role,
          permissions: employeeData.permissions || {},
          company_owner_id: employeeData.company_owner_id,
          is_employee: true,
          company_name: employeeData.company_settings?.company_name
        };

        setProfile(employeeProfile);
        setCompanyId(employeeData.company_owner_id);
        setError(null);
        console.log('Employee logged in:', employeeProfile);
      } else {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          setError(profileError);
          console.error('Error loading profile:', profileError);
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
        setError(null);
        console.log('Owner logged in:', ownerProfile);
      }
    } catch (err: any) {
      setError(err);
      console.error('Error loading user profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error);
        throw error;
      }

      if (data.user) {
        setUser(data.user);
        await loadUserProfile(data.user);
        toast.success('Inicio de sesión exitoso');
      }
    } catch (err: any) {
      setError(err);
      console.error('Error signing in:', err);
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
      if (error) {
        setError(error);
        throw error;
      }
      setUser(null);
      setProfile(null);
      setCompanyId(null);
      toast.success('Sesión cerrada exitosamente');
    } catch (err: any) {
      setError(err);
      console.error('Error signing out:', err);
      toast.error('Error al cerrar sesión');
    } finally {
      setLoading(false);
    }
  };

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