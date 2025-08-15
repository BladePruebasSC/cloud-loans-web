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

// Función para guardar datos en localStorage
const saveToLocalStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    // También guardar timestamp para verificar validez
    localStorage.setItem(`${key}_timestamp`, Date.now().toString());
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

// Función para obtener datos de localStorage
const getFromLocalStorage = (key: string) => {
  try {
    const item = localStorage.getItem(key);
    const timestamp = localStorage.getItem(`${key}_timestamp`);
    
    if (!item || !timestamp) {
      return null;
    }
    
    // Verificar si los datos no son muy antiguos (más de 24 horas)
    const dataAge = Date.now() - parseInt(timestamp);
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
    
    if (dataAge > maxAge) {
      console.log(`LocalStorage data for ${key} is too old, clearing...`);
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}_timestamp`);
      return null;
    }
    
    return JSON.parse(item);
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return null;
  }
};

// Función para limpiar datos de localStorage
const clearLocalStorage = () => {
  try {
    localStorage.removeItem('user_profile');
    localStorage.removeItem('user_profile_timestamp');
    localStorage.removeItem('company_id');
    localStorage.removeItem('company_id_timestamp');
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
};

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

      // Guardar en localStorage
      saveToLocalStorage('user_profile', employeeProfile);
      saveToLocalStorage('company_id', employeeData.company_owner_id);

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
    
    // Guardar en localStorage
    saveToLocalStorage('user_profile', ownerProfile);
    saveToLocalStorage('company_id', authUser.id);
    
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
      
      // Limpiar localStorage
      clearLocalStorage();
      
      toast.success('Sesión cerrada exitosamente');
    } catch (err: any) {
      // If it's a session not found error, treat it as successful logout
      if (err.message === 'Auth session missing!' || err.message.includes('session_not_found')) {
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        clearLocalStorage();
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
    // Función para cargar el perfil del usuario
    const loadUserProfile = async (authUser: User) => {
      try {
        console.log('Loading profile for user:', authUser.id);
        
        // Primero verificar si es empleado
        const { data: employeeData, error: employeeError } = await supabase
          .from('employees')
          .select('id,full_name,email,role,permissions,company_owner_id,status')
          .eq('auth_user_id', authUser.id)
          .eq('status', 'active')
          .maybeSingle();

        if (employeeError) {
          console.error('Error checking employee status:', employeeError);
        }

        if (employeeData) {
          // Es un empleado
          console.log('User is an employee, loading employee profile');
          const employeeProfile = await loadEmployeeProfile(authUser.id);
          if (employeeProfile) {
            setProfile(employeeProfile);
            setCompanyId(employeeProfile.company_owner_id);
            console.log('Employee profile restored:', employeeProfile);
          }
        } else {
          // Es un dueño de empresa
          console.log('User is an owner, loading owner profile');
          await loadOwnerProfile(authUser);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
      }
    };

    // Verificar sesión inicial
    const checkInitialSession = async () => {
      try {
        console.log('Checking initial session...');
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          console.log('Initial session found:', session.user.id);
          setUser(session.user);
          
          // Intentar cargar perfil desde localStorage primero para respuesta inmediata
          const savedProfile = getFromLocalStorage('user_profile');
          const savedCompanyId = getFromLocalStorage('company_id');
          
          if (savedProfile && savedCompanyId) {
            console.log('Restoring profile from localStorage for immediate response');
            setProfile(savedProfile);
            setCompanyId(savedCompanyId);
          }
          
          // Luego cargar desde la base de datos para asegurar datos actualizados
          console.log('Loading fresh profile from database...');
          await loadUserProfile(session.user);
        } else {
          console.log('No initial session found');
          // Si no hay sesión, intentar restaurar desde localStorage como fallback
          const savedProfile = getFromLocalStorage('user_profile');
          const savedCompanyId = getFromLocalStorage('company_id');
          
          if (savedProfile && savedCompanyId) {
            console.log('Attempting to restore from localStorage as fallback');
            // Verificar si el token aún es válido
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (currentSession?.user) {
              setUser(currentSession.user);
              setProfile(savedProfile);
              setCompanyId(savedCompanyId);
            } else {
              // Si no hay sesión válida, limpiar localStorage
              clearLocalStorage();
            }
          }
        }
      } catch (error) {
        console.error('Error checking initial session:', error);
        // En caso de error, intentar restaurar desde localStorage
        const savedProfile = getFromLocalStorage('user_profile');
        const savedCompanyId = getFromLocalStorage('company_id');
        
        if (savedProfile && savedCompanyId) {
          console.log('Restoring from localStorage after error');
          setProfile(savedProfile);
          setCompanyId(savedCompanyId);
        }
      } finally {
        setLoading(false);
      }
    };

    // Verificar sesión inicial al cargar
    checkInitialSession();

    // Escuchar cambios en el estado de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, session?.user?.id);
      
      if (event === 'SIGNED_IN' && session?.user) {
        console.log('User signed in, loading profile...');
        setUser(session.user);
        await loadUserProfile(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing state...');
        setUser(null);
        setProfile(null);
        setCompanyId(null);
        clearLocalStorage();
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log('Token refreshed, updating user...');
        setUser(session.user);
        if (!profile) {
          await loadUserProfile(session.user);
        }
      } else if (event === 'USER_UPDATED' && session?.user) {
        console.log('User updated, refreshing profile...');
        setUser(session.user);
        await loadUserProfile(session.user);
      }
    });

    // Listener para guardar datos antes de que se recargue la página
    const handleBeforeUnload = () => {
      if (user && profile && companyId) {
        console.log('Saving session data before page unload...');
        saveToLocalStorage('user_profile', profile);
        saveToLocalStorage('company_id', companyId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, profile, companyId]);

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