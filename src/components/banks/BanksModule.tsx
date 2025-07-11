
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
  Building2, 
  Plus, 
  TrendingUp, 
  DollarSign,
  ArrowUpDown,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  CreditCard
} from 'lucide-react';

interface BankAccount {
  id: string;
  user_id: string;
  bank_name: string;
  account_type: string;
  account_number: string;
  balance: number;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  account_id: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description: string;
  reference_number: string | null;
  transaction_date: string;
  created_at: string;
}

const BanksModule = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cuentas');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const { user } = useAuth();

  const [accountForm, setAccountForm] = useState({
    bank_name: '',
    account_type: '',
    account_number: '',
    balance: 0,
    description: ''
  });

  const [transactionForm, setTransactionForm] = useState({
    account_id: '',
    type: 'income' as 'income' | 'expense' | 'transfer',
    amount: 0,
    description: '',
    reference_number: '',
    transaction_date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (user) {
      fetchAccounts();
      fetchTransactions();
    }
  }, [user]);

  // Note: Since there's no bank_accounts table in the schema, I'll simulate this functionality
  // In a real implementation, you would need to create these tables in Supabase
  
  const fetchAccounts = async () => {
    try {
      setLoading(true);
      // Simulated data - in real app you'd fetch from supabase
      const mockAccounts: BankAccount[] = [
        {
          id: '1',
          user_id: user?.id || '',
          bank_name: 'Banco Popular',
          account_type: 'checking',
          account_number: '****7890',
          balance: 123456.78,
          description: 'Cuenta principal del negocio',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      setAccounts(mockAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    try {
      // Simulated transactions
      const mockTransactions: Transaction[] = [
        {
          id: '1',
          account_id: '1',
          type: 'income',
          amount: 2500,
          description: 'Pago de Préstamo - Cliente Juan Pérez',
          reference_number: 'REF001',
          transaction_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString()
        }
      ];
      setTransactions(mockTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // In a real app, you would save to Supabase here
      const newAccount: BankAccount = {
        id: Date.now().toString(),
        user_id: user?.id || '',
        ...accountForm,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (editingAccount) {
        setAccounts(prev => prev.map(acc => 
          acc.id === editingAccount.id 
            ? { ...acc, ...accountForm, updated_at: new Date().toISOString() }
            : acc
        ));
        toast.success('Cuenta actualizada exitosamente');
      } else {
        setAccounts(prev => [...prev, newAccount]);
        toast.success('Cuenta agregada exitosamente');
      }

      setShowAccountForm(false);
      setEditingAccount(null);
      resetAccountForm();
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error('Error al guardar cuenta');
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const newTransaction: Transaction = {
        id: Date.now().toString(),
        ...transactionForm,
        created_at: new Date().toISOString()
      };

      setTransactions(prev => [newTransaction, ...prev]);
      
      // Update account balance
      setAccounts(prev => prev.map(acc => 
        acc.id === transactionForm.account_id
          ? { 
              ...acc, 
              balance: transactionForm.type === 'income' 
                ? acc.balance + transactionForm.amount
                : acc.balance - transactionForm.amount
            }
          : acc
      ));

      toast.success('Transacción registrada exitosamente');
      resetTransactionForm();
    } catch (error) {
      console.error('Error saving transaction:', error);
      toast.error('Error al registrar transacción');
    }
  };

  const resetAccountForm = () => {
    setAccountForm({
      bank_name: '',
      account_type: '',
      account_number: '',
      balance: 0,
      description: ''
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      account_id: '',
      type: 'income',
      amount: 0,
      description: '',
      reference_number: '',
      transaction_date: new Date().toISOString().split('T')[0]
    });
  };

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const monthlyIncome = transactions
    .filter(t => t.type === 'income' && new Date(t.transaction_date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + t.amount, 0);
  const monthlyExpenses = transactions
    .filter(t => t.type === 'expense' && new Date(t.transaction_date).getMonth() === new Date().getMonth())
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión Bancaria</h1>
        <Button onClick={() => setShowAccountForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cuentas">Cuentas Bancarias</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="conciliacion">Conciliación</TabsTrigger>
          <TabsTrigger value="transferencias">Transferencias</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Cuentas</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{accounts.length}</div>
                <p className="text-xs text-muted-foreground">Cuentas activas</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Saldo Total</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">${totalBalance.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Disponible</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">${monthlyIncome.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">+15% vs mes anterior</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Egresos del Mes</CardTitle>
                <ArrowUpDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">${monthlyExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Gastos operativos</p>
              </CardContent>
            </Card>
          </div>

          {/* Accounts List */}
          <Card>
            <CardHeader>
              <CardTitle>Cuentas Bancarias</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando cuentas...</div>
              ) : accounts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay cuentas bancarias registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {accounts.map((account) => (
                    <div key={account.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-3">
                            <Building2 className="h-5 w-5 text-blue-600" />
                            <h3 className="font-medium">{account.bank_name} - {account.account_type === 'checking' ? 'Cuenta Corriente' : 'Cuenta de Ahorros'}</h3>
                            <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                              {account.status === 'active' ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>Cuenta: {account.account_number}</div>
                            <div>Saldo: ${account.balance.toLocaleString()}</div>
                            <div>Estado: {account.status === 'active' ? 'Activa' : 'Inactiva'}</div>
                          </div>
                          {account.description && (
                            <p className="text-sm text-gray-600">{account.description}</p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingAccount(account);
                            setAccountForm({
                              bank_name: account.bank_name,
                              account_type: account.account_type,
                              account_number: account.account_number,
                              balance: account.balance,
                              description: account.description || ''
                            });
                            setShowAccountForm(true);
                          }}>
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
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

        <TabsContent value="movimientos" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Movimientos Bancarios</CardTitle>
                <Button onClick={() => setActiveTab('transferencias')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Movimiento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-4 mb-6">
                <Input placeholder="Buscar movimientos..." className="flex-1" />
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>
              </div>
              
              <div className="space-y-3">
                {transactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay movimientos registrados</p>
                  </div>
                ) : (
                  transactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-center">
                        <div className="space-y-1">
                          <div className="font-medium">{transaction.description}</div>
                          <div className="text-sm text-gray-600">
                            {new Date(transaction.transaction_date).toLocaleDateString()} 
                            {transaction.reference_number && ` | Ref: ${transaction.reference_number}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            transaction.type === 'income' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {transaction.type === 'income' ? '+' : '-'}${transaction.amount.toLocaleString()}
                          </div>
                          <div className="text-sm text-gray-600">
                            {accounts.find(acc => acc.id === transaction.account_id)?.bank_name || 'Cuenta desconocida'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conciliacion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conciliación Bancaria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="font-medium mb-4 block">Saldo en Sistema</Label>
                  <div className="text-2xl font-bold text-blue-600">${totalBalance.toLocaleString()}</div>
                </div>
                <div>
                  <Label htmlFor="bank_balance" className="font-medium mb-4 block">Saldo en Estado de Cuenta</Label>
                  <Input id="bank_balance" type="number" placeholder="Ingrese saldo del banco" />
                </div>
              </div>
              
              <div className="mt-6">
                <Label className="font-medium mb-4 block">Movimientos Pendientes de Conciliar</Label>
                <p className="text-gray-500 text-center py-8">No hay movimientos pendientes de conciliar</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transferencias" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Registrar Movimiento</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTransactionSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="account_id">Cuenta</Label>
                    <Select value={transactionForm.account_id} onValueChange={(value) => setTransactionForm({...transactionForm, account_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map(account => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.bank_name} - {account.account_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="type">Tipo de Movimiento</Label>
                    <Select value={transactionForm.type} onValueChange={(value: 'income' | 'expense' | 'transfer') => setTransactionForm({...transactionForm, type: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Ingreso</SelectItem>
                        <SelectItem value="expense">Egreso</SelectItem>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Monto</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm({...transactionForm, amount: Number(e.target.value)})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="transaction_date">Fecha</Label>
                    <Input
                      id="transaction_date"
                      type="date"
                      value={transactionForm.transaction_date}
                      onChange={(e) => setTransactionForm({...transactionForm, transaction_date: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Descripción</Label>
                  <Input
                    id="description"
                    value={transactionForm.description}
                    onChange={(e) => setTransactionForm({...transactionForm, description: e.target.value})}
                    placeholder="Descripción del movimiento"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="reference_number">Número de Referencia</Label>
                  <Input
                    id="reference_number"
                    value={transactionForm.reference_number}
                    onChange={(e) => setTransactionForm({...transactionForm, reference_number: e.target.value})}
                    placeholder="Número de referencia (opcional)"
                  />
                </div>

                <Button type="submit">Registrar Movimiento</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Account Form Dialog */}
      <Dialog open={showAccountForm} onOpenChange={setShowAccountForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Editar Cuenta' : 'Agregar Nueva Cuenta'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAccountSubmit} className="space-y-4">
            <div>
              <Label htmlFor="bank_name">Nombre del Banco *</Label>
              <Input
                id="bank_name"
                value={accountForm.bank_name}
                onChange={(e) => setAccountForm({...accountForm, bank_name: e.target.value})}
                placeholder="Ej: Banco Popular"
                required
              />
            </div>
            
            <div>
              <Label htmlFor="account_type">Tipo de Cuenta *</Label>
              <Select value={accountForm.account_type} onValueChange={(value) => setAccountForm({...accountForm, account_type: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Cuenta Corriente</SelectItem>
                  <SelectItem value="savings">Cuenta de Ahorros</SelectItem>
                  <SelectItem value="business">Cuenta Empresarial</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="account_number">Número de Cuenta *</Label>
              <Input
                id="account_number"
                value={accountForm.account_number}
                onChange={(e) => setAccountForm({...accountForm, account_number: e.target.value})}
                placeholder="1234567890"
                required
              />
            </div>

            <div>
              <Label htmlFor="balance">Saldo Inicial</Label>
              <Input
                id="balance"
                type="number"
                step="0.01"
                value={accountForm.balance}
                onChange={(e) => setAccountForm({...accountForm, balance: Number(e.target.value)})}
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={accountForm.description}
                onChange={(e) => setAccountForm({...accountForm, description: e.target.value})}
                placeholder="Descripción de la cuenta..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowAccountForm(false);
                setEditingAccount(null);
                resetAccountForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingAccount ? 'Actualizar' : 'Agregar'} Cuenta
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BanksModule;
