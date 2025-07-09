
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import Navbar from '@/components/Navbar';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';
import Dashboard from '@/components/Dashboard';
import LoanCalculator from '@/components/LoanCalculator';

const Index = () => {
  const { user, profile, loading, signIn, signUp, signOut } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator'>('dashboard');

  const handleLogin = async (email: string, password: string) => {
    setAuthLoading(true);
    setError('');
    
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegister = async (data: any) => {
    setAuthLoading(true);
    setError('');
    
    try {
      await signUp(data);
    } catch (err: any) {
      setError(err.message || 'Error al crear la cuenta');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentView('dashboard');
  };

  const handleNewLoan = () => {
    setCurrentView('calculator');
  };

  const handleViewLoan = (loanId: string) => {
    console.log(`Viewing loan ${loanId}`);
    // Here you would navigate to loan details
  };

  const handleSubmitLoan = (loanData: any) => {
    console.log('Loan submitted:', loanData);
    setCurrentView('dashboard');
    // Here you would submit the loan application to Supabase
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  // If user is not logged in, show auth forms
  if (!user) {
    if (isLogin) {
      return (
        <LoginForm
          onLogin={handleLogin}
          onSwitchToRegister={() => setIsLogin(false)}
          error={error}
          loading={authLoading}
        />
      );
    } else {
      return (
        <RegisterForm
          onRegister={handleRegister}
          onSwitchToLogin={() => setIsLogin(true)}
          error={error}
          loading={authLoading}
        />
      );
    }
  }

  const userForNav = profile ? {
    name: profile.full_name || user.email || 'Usuario',
    email: user.email || '',
  } : {
    name: user.email || 'Usuario',
    email: user.email || '',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={userForNav} onLogout={handleLogout} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <Dashboard
            user={userForNav}
            onNewLoan={handleNewLoan}
            onViewLoan={handleViewLoan}
          />
        )}
        
        {currentView === 'calculator' && (
          <LoanCalculator
            onSubmitLoan={handleSubmitLoan}
            onBack={handleBackToDashboard}
          />
        )}
      </main>
    </div>
  );
};

export default Index;
