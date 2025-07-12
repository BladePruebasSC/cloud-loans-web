
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Zap, 
  Plus, 
  Calculator,
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  Settings,
  TrendingUp,
  Receipt,
  Edit,
  Trash2
} from 'lucide-react';

interface Expense {
  id: string;
  amount: number;
  description: string;
  category: string;
  status: string;
  expense_date: string;
  receipt_url: string | null;
  created_at: string;
  created_by: string;
}

const UtilitiesModule = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('calculadora');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const { user } = useAuth();

  // Calculator state
  const [loanAmount, setLoanAmount] = useState(100000);
  const [interestRate, setInterestRate] = useState(15);
  const [termMonths, setTermMonths] = useState(12);
  const [calculatedPayment, setCalculatedPayment] = useState(0);
  
  // Simple Interest Calculator
  const [simpleInterest, setSimpleInterest] = useState({
    principal: 100000,
    rate: 15,
    time: 12,
    result: 0
  });
  
  // Profitability Calculator
  const [profitability, setProfitability] = useState({
    initialInvestment: 100000,
    finalValue: 120000,
    timeMonths: 12,
    result: 0
  });
  
  // Currency Converter
  const [currency, setCurrency] = useState({
    amount: 1000,
    fromCurrency: 'DOP',
    toCurrency: 'USD',
    result: 0,
    exchangeRate: 58.5 // DOP to USD
  });
  
  const [showSimpleInterest, setShowSimpleInterest] = useState(false);
  const [showProfitability, setShowProfitability] = useState(false);
  const [showCurrencyConverter, setShowCurrencyConverter] = useState(false);

  // Expense form
  const [expenseForm, setExpenseForm] = useState({
    amount: 0,
    description: '',
    category: '',
    expense_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (user) {
      fetchExpenses();
    }
  }, [user]);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  };

  const calculateLoanPayment = () => {
    const principal = loanAmount;
    const monthlyRate = (interestRate / 100) / 12;
    const numPayments = termMonths;

    if (monthlyRate === 0) {
      setCalculatedPayment(principal / numPayments);
      return;
    }

    const payment = principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / 
                   (Math.pow(1 + monthlyRate, numPayments) - 1);
    
    setCalculatedPayment(Math.round(payment * 100) / 100);
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .insert([{
          ...expenseForm,
          created_by: user.id,
          status: 'approved'
        }]);

      if (error) throw error;

      toast.success('Gasto registrado exitosamente');
      setShowExpenseForm(false);
      resetExpenseForm();
      fetchExpenses();
    } catch (error) {
      console.error('Error creating expense:', error);
      toast.error('Error al registrar gasto');
    }
  };

  const resetExpenseForm = () => {
    setExpenseForm({
      amount: 0,
      description: '',
      category: '',
      expense_date: new Date().toISOString().split('T')[0]
    });
  };

  const deleteExpense = async (expenseId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return;

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId);

      if (error) throw error;

      toast.success('Gasto eliminado exitosamente');
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Error al eliminar gasto');
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const monthlyExpenses = expenses
    .filter(exp => new Date(exp.expense_date).getMonth() === new Date().getMonth())
    .reduce((sum, exp) => sum + exp.amount, 0);
  const categories = [...new Set(expenses.map(exp => exp.category).filter(Boolean))];

  // Funciones para calculadoras adicionales
  const calculateSimpleInterest = () => {
    const interest = (simpleInterest.principal * simpleInterest.rate * simpleInterest.time) / (100 * 12);
    setSimpleInterest(prev => ({ ...prev, result: Math.round(interest * 100) / 100 }));
  };

  const calculateProfitability = () => {
    const profit = ((profitability.finalValue - profitability.initialInvestment) / profitability.initialInvestment) * 100;
    const annualizedReturn = (profit / profitability.timeMonths) * 12;
    setProfitability(prev => ({ ...prev, result: Math.round(annualizedReturn * 100) / 100 }));
  };

  const convertCurrency = () => {
    let rate = currency.exchangeRate;
    if (currency.fromCurrency === 'USD' && currency.toCurrency === 'DOP') {
      rate = 58.5; // USD to DOP
    } else if (currency.fromCurrency === 'DOP' && currency.toCurrency === 'USD') {
      rate = 1 / 58.5; // DOP to USD
    } else if (currency.fromCurrency === 'EUR' && currency.toCurrency === 'DOP') {
      rate = 64.2; // EUR to DOP
    } else if (currency.fromCurrency === 'DOP' && currency.toCurrency === 'EUR') {
      rate = 1 / 64.2; // DOP to EUR
    } else if (currency.fromCurrency === 'USD' && currency.toCurrency === 'EUR') {
      rate = 0.91; // USD to EUR
    } else if (currency.fromCurrency === 'EUR' && currency.toCurrency === 'USD') {
      rate = 1.10; // EUR to USD
    }
    
    const result = currency.amount * rate;
    setCurrency(prev => ({ ...prev, result: Math.round(result * 100) / 100, exchangeRate: rate }));
  };

  useEffect(() => {
    calculateLoanPayment();
  }, [loanAmount, interestRate, termMonths]);

  useEffect(() => {
    if (showSimpleInterest) {
      calculateSimpleInterest();
    }
  }, [simpleInterest.principal, simpleInterest.rate, simpleInterest.time, showSimpleInterest]);

  useEffect(() => {
    if (showProfitability) {
      calculateProfitability();
    }
  }, [profitability.initialInvestment, profitability.finalValue, profitability.timeMonths, showProfitability]);

  useEffect(() => {
    if (showCurrencyConverter) {
      convertCurrency();
    }
  }, [currency.amount, currency.fromCurrency, currency.toCurrency, showCurrencyConverter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Utilidades</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="calculadora">Calculadora</TabsTrigger>
          <TabsTrigger value="gastos">Gastos</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="calculadora" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calculator className="h-5 w-5 mr-2" />
                  Calculadora de Préstamos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="loan_amount">Monto del Préstamo</Label>
                  <Input
                    id="loan_amount"
                    type="number"
                    value={loanAmount}
                    onChange={(e) => setLoanAmount(Number(e.target.value))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="interest_rate">Tasa de Interés Anual (%)</Label>
                  <Input
                    id="interest_rate"
                    type="number"
                    step="0.1"
                    value={interestRate}
                    onChange={(e) => setInterestRate(Number(e.target.value))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="term_months">Plazo (meses)</Label>
                  <Input
                    id="term_months"
                    type="number"
                    value={termMonths}
                    onChange={(e) => setTermMonths(Number(e.target.value))}
                  />
                </div>
                
                <Button onClick={calculateLoanPayment} className="w-full">
                  Calcular Cuota
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resultado del Cálculo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    ${calculatedPayment.toLocaleString()}
                  </div>
                  <p className="text-gray-600">Cuota mensual</p>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Monto del préstamo:</span>
                    <span>${loanAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tasa de interés:</span>
                    <span>{interestRate}% anual</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Plazo:</span>
                    <span>{termMonths} meses</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total a pagar:</span>
                    <span>${(calculatedPayment * termMonths).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total de intereses:</span>
                    <span>${((calculatedPayment * termMonths) - loanAmount).toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Otras Calculadoras</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowSimpleInterest(true)}
                >
                  <Calculator className="h-6 w-6 mb-2" />
                  Calculadora de Interés Simple
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowProfitability(true)}
                >
                  <TrendingUp className="h-6 w-6 mb-2" />
                  Calculadora de Rentabilidad
                </Button>
                <Button 
                  variant="outline" 
                  className="h-20 flex flex-col"
                  onClick={() => setShowCurrencyConverter(true)}
                >
                  <DollarSign className="h-6 w-6 mb-2" />
                  Conversor de Monedas
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gastos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Gastos</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{expenses.length}</div>
                <p className="text-xs text-muted-foreground">Gastos registrados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Monto</CardTitle>
                <DollarSign className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Total gastado</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Este Mes</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${monthlyExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Gastos del mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categorías</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{categories.length}</div>
                <p className="text-xs text-muted-foreground">Categorías activas</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Registro de Gastos</CardTitle>
                <Button onClick={() => setShowExpenseForm(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando gastos...</div>
              ) : expenses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay gastos registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expenses.map((expense) => (
                    <div key={expense.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">{expense.description}</h3>
                            <Badge variant="secondary">{expense.category}</Badge>
                            <Badge variant={expense.status === 'approved' ? 'default' : 'secondary'}>
                              {expense.status === 'approved' ? 'Aprobado' : expense.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Monto:</span> ${expense.amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Fecha:</span> {new Date(expense.expense_date).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => deleteExpense(expense.id)}>
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
        </TabsContent>

        <TabsContent value="reportes" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumen de Gastos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Gastos totales:</span>
                    <span className="font-semibold">{expenses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto total:</span>
                    <span className="font-semibold">${totalExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Gastos este mes:</span>
                    <span className="font-semibold">${monthlyExpenses.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio por gasto:</span>
                    <span className="font-semibold">
                      ${expenses.length > 0 ? (totalExpenses / expenses.length).toFixed(2) : '0'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gastos por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map((category) => {
                    const categoryExpenses = expenses.filter(exp => exp.category === category);
                    const categoryTotal = categoryExpenses.reduce((sum, exp) => sum + exp.amount, 0);
                    return (
                      <div key={category} className="flex justify-between">
                        <span className="truncate">{category}</span>
                        <span className="font-semibold">${categoryTotal.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configuración de Utilidades
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Configuración de Calculadora</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="default_interest">Tasa de Interés por Defecto (%)</Label>
                      <Input 
                        id="default_interest"
                        type="number" 
                        step="0.1"
                        defaultValue="15"
                        placeholder="Tasa por defecto"
                      />
                    </div>
                    <div>
                      <Label htmlFor="default_term">Plazo por Defecto (meses)</Label>
                      <Input 
                        id="default_term"
                        type="number" 
                        defaultValue="12"
                        placeholder="Plazo por defecto"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Categorías de Gastos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      {['Oficina', 'Marketing', 'Transporte', 'Servicios', 'Equipos'].map((category, index) => (
                        <div key={index} className="flex items-center justify-between">
                          <span className="text-sm">{category}</span>
                          <Button size="sm" variant="outline">
                            <Edit className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="w-full">
                      <Plus className="h-3 w-3 mr-2" />
                      Agregar Categoría
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button>Guardar Configuración</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Expense Form Dialog */}
      <Dialog open={showExpenseForm} onOpenChange={setShowExpenseForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Nuevo Gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleExpenseSubmit} className="space-y-4">
            <div>
              <Label htmlFor="description">Descripción *</Label>
              <Input
                id="description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})}
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="amount">Monto *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({...expenseForm, amount: Number(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="expense_date">Fecha *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({...expenseForm, expense_date: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="category">Categoría *</Label>
              <Select value={expenseForm.category} onValueChange={(value) => setExpenseForm({...expenseForm, category: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Oficina">Oficina</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Transporte">Transporte</SelectItem>
                  <SelectItem value="Servicios">Servicios</SelectItem>
                  <SelectItem value="Equipos">Equipos</SelectItem>
                  <SelectItem value="Otros">Otros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowExpenseForm(false);
                resetExpenseForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">Guardar Gasto</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Simple Interest Calculator Modal */}
      <Dialog open={showSimpleInterest} onOpenChange={setShowSimpleInterest}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Calculator className="h-5 w-5 mr-2" />
              Calculadora de Interés Simple
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="si_principal">Capital Principal ($)</Label>
              <Input
                id="si_principal"
                type="number"
                value={simpleInterest.principal}
                onChange={(e) => setSimpleInterest({...simpleInterest, principal: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="si_rate">Tasa de Interés Anual (%)</Label>
              <Input
                id="si_rate"
                type="number"
                step="0.1"
                value={simpleInterest.rate}
                onChange={(e) => setSimpleInterest({...simpleInterest, rate: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="si_time">Tiempo (meses)</Label>
              <Input
                id="si_time"
                type="number"
                value={simpleInterest.time}
                onChange={(e) => setSimpleInterest({...simpleInterest, time: Number(e.target.value)})}
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Resultados:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Capital inicial:</span>
                  <span className="font-medium">${simpleInterest.principal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Interés ganado:</span>
                  <span className="font-medium text-green-600">${simpleInterest.result.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Monto total:</span>
                  <span className="font-bold text-lg">${(simpleInterest.principal + simpleInterest.result).toLocaleString()}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowSimpleInterest(false)}>
                Cerrar
              </Button>
              <Button onClick={calculateSimpleInterest}>
                Recalcular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profitability Calculator Modal */}
      <Dialog open={showProfitability} onOpenChange={setShowProfitability}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Calculadora de Rentabilidad
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="prof_initial">Inversión Inicial ($)</Label>
              <Input
                id="prof_initial"
                type="number"
                value={profitability.initialInvestment}
                onChange={(e) => setProfitability({...profitability, initialInvestment: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="prof_final">Valor Final ($)</Label>
              <Input
                id="prof_final"
                type="number"
                value={profitability.finalValue}
                onChange={(e) => setProfitability({...profitability, finalValue: Number(e.target.value)})}
              />
            </div>
            
            <div>
              <Label htmlFor="prof_time">Tiempo (meses)</Label>
              <Input
                id="prof_time"
                type="number"
                value={profitability.timeMonths}
                onChange={(e) => setProfitability({...profitability, timeMonths: Number(e.target.value)})}
              />
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Resultados:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Inversión inicial:</span>
                  <span className="font-medium">${profitability.initialInvestment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Valor final:</span>
                  <span className="font-medium">${profitability.finalValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Ganancia total:</span>
                  <span className="font-medium text-green-600">${(profitability.finalValue - profitability.initialInvestment).toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Rentabilidad anualizada:</span>
                  <span className="font-bold text-lg">{profitability.result.toFixed(2)}%</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowProfitability(false)}>
                Cerrar
              </Button>
              <Button onClick={calculateProfitability}>
                Recalcular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Currency Converter Modal */}
      <Dialog open={showCurrencyConverter} onOpenChange={setShowCurrencyConverter}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <DollarSign className="h-5 w-5 mr-2" />
              Conversor de Monedas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="curr_amount">Cantidad</Label>
              <Input
                id="curr_amount"
                type="number"
                step="0.01"
                value={currency.amount}
                onChange={(e) => setCurrency({...currency, amount: Number(e.target.value)})}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from_currency">De</Label>
                <Select value={currency.fromCurrency} onValueChange={(value) => setCurrency({...currency, fromCurrency: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Moneda origen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP - Peso Dominicano</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="to_currency">A</Label>
                <Select value={currency.toCurrency} onValueChange={(value) => setCurrency({...currency, toCurrency: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Moneda destino" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP - Peso Dominicano</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Conversión:</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Cantidad original:</span>
                  <span className="font-medium">{currency.amount.toLocaleString()} {currency.fromCurrency}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tasa de cambio:</span>
                  <span className="font-medium">{currency.exchangeRate.toFixed(4)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span>Resultado:</span>
                  <span className="font-bold text-lg">{currency.result.toLocaleString()} {currency.toCurrency}</span>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCurrencyConverter(false)}>
                Cerrar
              </Button>
              <Button onClick={convertCurrency}>
                Convertir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UtilitiesModule;
