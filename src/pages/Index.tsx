
import React, { useState } from 'react';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import LoginForm from '@/components/LoginForm';
import RegisterForm from '@/components/RegisterForm';
import Dashboard from '@/components/Dashboard';
import LoanCalculator from '@/components/LoanCalculator';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  dni: string;
}

interface Loan {
  id: string;
  amount: number;
  interestRate: number;
  term: number;
  monthlyPayment: number;
  remainingBalance: number;
  nextPaymentDate: string;
  status: 'active' | 'paid' | 'overdue';
  startDate: string;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone: string;
  dni: string;
}

interface LoanRequest {
  amount: number;
  interestRate: number;
  term: number;
  monthlyPayment: number;
  totalInterest: number;
  totalAmount: number;
}

const Index = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentView, setCurrentView] = useState<'dashboard' | 'calculator'>('dashboard');

  // Mock data for demonstration
  const [loans] = useState<Loan[]>([
    {
      id: '1',
      amount: 15000,
      interestRate: 12,
      term: 24,
      monthlyPayment: 705.46,
      remainingBalance: 8456.78,
      nextPaymentDate: '2024-08-15',
      status: 'active',
      startDate: '2023-08-15'
    },
    {
      id: '2',
      amount: 5000,
      interestRate: 15,
      term: 12,
      monthlyPayment: 451.58,
      remainingBalance: 0,
      nextPaymentDate: '2024-02-15',
      status: 'paid',
      startDate: '2023-02-15'
    }
  ]);

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock successful login
      const mockUser: User = {
        id: '1',
        name: 'Juan Pérez',
        email: email,
        phone: '+34 600 123 456',
        dni: '12345678A'
      };
      
      setCurrentUser(mockUser);
      toast.success('¡Bienvenido! Has iniciado sesión correctamente');
    } catch (err) {
      setError('Credenciales inválidas. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (data: RegisterData) => {
    setLoading(true);
    setError('');
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock successful registration
      const newUser: User = {
        id: '2',
        name: data.name,
        email: data.email,
        phone: data.phone,
        dni: data.dni
      };
      
      setCurrentUser(newUser);
      toast.success('¡Cuenta creada exitosamente! Bienvenido');
    } catch (err) {
      setError('Error al crear la cuenta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCurrentView('dashboard');
    toast.info('Has cerrado sesión correctamente');
  };

  const handleNewLoan = () => {
    setCurrentView('calculator');
  };

  const handleViewLoan = (loanId: string) => {
    toast.info(`Visualizando préstamo #${loanId}`);
    // Here you would navigate to loan details
  };

  const handleSubmitLoan = (loanData: LoanRequest) => {
    toast.success('Solicitud de préstamo enviada correctamente');
    setCurrentView('dashboard');
    // Here you would submit the loan application
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
  };

  // If user is not logged in, show auth forms
  if (!currentUser) {
    if (isLogin) {
      return (
        <LoginForm
          onLogin={handleLogin}
          onSwitchToRegister={() => setIsLogin(false)}
          error={error}
          loading={loading}
        />
      );
    } else {
      return (
        <RegisterForm
          onRegister={handleRegister}
          onSwitchToLogin={() => setIsLogin(true)}
          error={error}
          loading={loading}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={currentUser} onLogout={handleLogout} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'dashboard' && (
          <Dashboard
            user={currentUser}
            loans={loans}
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
