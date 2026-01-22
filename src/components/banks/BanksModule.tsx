
import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';
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
  CreditCard,
  ArrowRightLeft,
  CheckCircle2,
  XCircle,
  Calendar,
  FileText,
  Printer,
  Download,
  BarChart3
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
  currency?: string;
  last_reconciled_date?: string;
  last_reconciled_balance?: number;
}

interface Transaction {
  id: string;
  account_id: string;
  to_account_id?: string | null;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description: string;
  reference_number: string | null;
  transaction_date: string;
  created_at: string;
  is_reconciled?: boolean;
  reconciled_at?: string | null;
  category?: string | null;
  payment_method?: string | null;
  created_by?: string | null;
  bank_accounts?: {
    bank_name: string;
    account_number: string;
  };
  to_account?: {
    bank_name: string;
    account_number: string;
  };
}

interface Reconciliation {
  id: string;
  account_id: string;
  reconciliation_date: string;
  system_balance: number;
  bank_balance: number;
  difference: number;
  notes: string | null;
  created_at: string;
  created_by: string;
}

const BanksModule = () => {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('cuentas');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showReconciliationForm, setShowReconciliationForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [transactionToPrint, setTransactionToPrint] = useState<Transaction | null>(null);
  const [printFormat, setPrintFormat] = useState<string>('POS80');
  const { user, companyId } = useAuth();

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);

  // Formularios
  const [accountForm, setAccountForm] = useState({
    bank_name: '',
    account_type: '',
    account_number: '',
    balance: 0,
    description: '',
    currency: 'DOP'
  });

  const [transactionForm, setTransactionForm] = useState({
    account_id: '',
    to_account_id: '',
    type: 'income' as 'income' | 'expense' | 'transfer',
    amount: 0,
    description: '',
    reference_number: '',
    transaction_date: new Date().toISOString().split('T')[0],
    category: 'none',
    payment_method: 'transfer'
  });

  const [reconciliationForm, setReconciliationForm] = useState({
    account_id: '',
    bank_balance: 0,
    notes: ''
  });

  useEffect(() => {
    if (user && companyId) {
      fetchAccounts();
      fetchTransactions();
      fetchReconciliations();
      fetchCompanySettings();
    }
  }, [user, companyId]);

  const fetchCompanySettings = async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching company settings:', error);
        return;
      }

      if (data) {
        setCompanySettings(data);
      }
    } catch (error) {
      console.error('Error in fetchCompanySettings:', error);
    }
  };

  const fetchAccounts = async () => {
    if (!companyId) return;
    
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('bank_accounts')
        .select('*')
        .eq('company_owner_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching accounts:', error);
        toast.error('Error al cargar cuentas bancarias');
        return;
      }

      const mappedAccounts: BankAccount[] = (data || []).map(acc => ({
        id: acc.id,
        user_id: acc.company_owner_id,
        bank_name: acc.bank_name,
        account_type: acc.account_type,
        account_number: acc.account_number,
        balance: Number(acc.balance),
        description: acc.description,
        status: acc.status,
        created_at: acc.created_at,
        updated_at: acc.updated_at,
        currency: acc.currency || 'DOP',
        last_reconciled_date: acc.last_reconciled_date,
        last_reconciled_balance: acc.last_reconciled_balance ? Number(acc.last_reconciled_balance) : undefined
      }));

      setAccounts(mappedAccounts);
    } catch (error) {
      console.error('Error fetching accounts:', error);
      toast.error('Error al cargar cuentas bancarias');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    if (!companyId) return;
    
    try {
      // Primero obtener las transacciones sin las relaciones anidadas
      const { data: transactionsData, error: transactionsError } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('company_owner_id', companyId)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (transactionsError) {
        console.error('Error fetching transactions:', transactionsError);
        toast.error('Error al cargar transacciones');
        return;
      }

      // Luego obtener las cuentas relacionadas
      const accountIds = new Set<string>();
      transactionsData?.forEach(trans => {
        accountIds.add(trans.account_id);
        if (trans.to_account_id) {
          accountIds.add(trans.to_account_id);
        }
      });

      const { data: accountsData } = await supabase
        .from('bank_accounts')
        .select('id, bank_name, account_number')
        .in('id', Array.from(accountIds));

      // Crear un mapa de cuentas para acceso rápido
      const accountsMap = new Map(
        (accountsData || []).map(acc => [acc.id, acc])
      );

      // Combinar los datos
      const data = transactionsData?.map(trans => ({
        ...trans,
        bank_accounts: accountsMap.get(trans.account_id),
        to_account: trans.to_account_id ? accountsMap.get(trans.to_account_id) : null
      })) || [];

      const mappedTransactions: Transaction[] = data.map(trans => ({
        id: trans.id,
        account_id: trans.account_id,
        to_account_id: trans.to_account_id,
        type: trans.type as 'income' | 'expense' | 'transfer',
        amount: Number(trans.amount),
        description: trans.description,
        reference_number: trans.reference_number,
        transaction_date: trans.transaction_date,
        created_at: trans.created_at,
        is_reconciled: trans.is_reconciled || false,
        reconciled_at: trans.reconciled_at || null,
        category: trans.category,
        payment_method: trans.payment_method,
        created_by: trans.created_by,
        bank_accounts: trans.bank_accounts,
        to_account: trans.to_account
      }));

      setTransactions(mappedTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('Error al cargar transacciones');
    }
  };

  const fetchReconciliations = async () => {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('bank_reconciliations')
        .select('*')
        .eq('company_owner_id', companyId)
        .order('reconciliation_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReconciliations((data as Reconciliation[]) || []);
    } catch (error) {
      console.error('Error fetching reconciliations:', error);
    }
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    try {
      if (editingAccount) {
        const { error } = await supabase
          .from('bank_accounts')
          .update({
            bank_name: accountForm.bank_name,
            account_type: accountForm.account_type,
            account_number: accountForm.account_number,
            balance: accountForm.balance,
            description: accountForm.description || null,
            currency: accountForm.currency,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingAccount.id)
          .eq('company_owner_id', companyId);

        if (error) throw error;
        toast.success('Cuenta actualizada exitosamente');
      } else {
        const { data, error } = await supabase
          .from('bank_accounts')
          .insert([{
            company_owner_id: companyId,
            bank_name: accountForm.bank_name,
            account_type: accountForm.account_type,
            account_number: accountForm.account_number,
            balance: accountForm.balance,
            description: accountForm.description || null,
            currency: accountForm.currency,
            status: 'active'
          }])
          .select()
          .single();

        if (error) throw error;
        toast.success('Cuenta agregada exitosamente');
      }

      setShowAccountForm(false);
      setEditingAccount(null);
      resetAccountForm();
      fetchAccounts();
    } catch (error: any) {
      console.error('Error saving account:', error);
      toast.error(error.message || 'Error al guardar cuenta');
    }
  };

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId || !user) {
      toast.error('No se pudo identificar la empresa o usuario');
      return;
    }

    if (transactionForm.type === 'transfer' && !transactionForm.to_account_id) {
      toast.error('Debe seleccionar una cuenta destino para la transferencia');
      return;
    }

    if (transactionForm.type === 'transfer' && transactionForm.account_id === transactionForm.to_account_id) {
      toast.error('No puede transferir a la misma cuenta');
      return;
    }

    try {
      if (editingTransaction) {
        // Para editar, primero revertir el balance anterior
        const oldTransaction = transactions.find(t => t.id === editingTransaction.id);
        if (oldTransaction) {
          // Revertir balances
          await revertTransactionBalances(oldTransaction);
        }

        // Actualizar transacción
        const { error } = await supabase
          .from('bank_transactions')
          .update({
            account_id: transactionForm.account_id,
            to_account_id: transactionForm.type === 'transfer' ? transactionForm.to_account_id : null,
            type: transactionForm.type,
            amount: transactionForm.amount,
            description: transactionForm.description,
            reference_number: transactionForm.reference_number || null,
            transaction_date: transactionForm.transaction_date,
            category: transactionForm.category && transactionForm.category !== 'none' ? transactionForm.category : null,
            payment_method: transactionForm.payment_method
          })
          .eq('id', editingTransaction.id);

        if (error) throw error;

        // Aplicar nuevos balances
        await applyTransactionBalances({
          ...transactionForm,
          id: editingTransaction.id
        });

        toast.success('Transacción actualizada exitosamente');
      } else {
        // Crear nueva transacción (el trigger actualizará el balance automáticamente)
        const { error } = await supabase
          .from('bank_transactions')
          .insert([{
            account_id: transactionForm.account_id,
            to_account_id: transactionForm.type === 'transfer' ? transactionForm.to_account_id : null,
            company_owner_id: companyId,
            type: transactionForm.type,
            amount: transactionForm.amount,
            description: transactionForm.description,
            reference_number: transactionForm.reference_number || null,
            transaction_date: transactionForm.transaction_date,
            category: transactionForm.category && transactionForm.category !== 'none' ? transactionForm.category : null,
            payment_method: transactionForm.payment_method,
            created_by: user.id
          }]);

        if (error) throw error;
        toast.success('Transacción registrada exitosamente');
        
        // Auto-imprimir el nuevo movimiento
        const { data: newTransaction } = await supabase
          .from('bank_transactions')
          .select('*')
          .eq('account_id', transactionForm.account_id)
          .eq('description', transactionForm.description)
          .eq('amount', transactionForm.amount)
          .eq('transaction_date', transactionForm.transaction_date)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (newTransaction) {
          // Obtener datos de la cuenta para el recibo
          const accountData = accounts.find(acc => acc.id === transactionForm.account_id);
          const transactionWithAccount: Transaction = {
            ...newTransaction,
            bank_accounts: accountData ? {
              bank_name: accountData.bank_name,
              account_number: accountData.account_number
            } : undefined,
            to_account: transactionForm.to_account_id ? accounts.find(acc => acc.id === transactionForm.to_account_id) ? {
              bank_name: accounts.find(acc => acc.id === transactionForm.to_account_id)!.bank_name,
              account_number: accounts.find(acc => acc.id === transactionForm.to_account_id)!.account_number
            } : undefined : undefined
          };
          
          // Esperar un momento para que se actualice el estado
          setTimeout(() => {
            printTransaction(transactionWithAccount, 'POS80');
          }, 500);
        }
      }

      setShowTransactionForm(false);
      setEditingTransaction(null);
      resetTransactionForm();
      fetchAccounts();
      fetchTransactions();
    } catch (error: any) {
      console.error('Error saving transaction:', error);
      toast.error(error.message || 'Error al registrar transacción');
    }
  };

  const revertTransactionBalances = async (transaction: Transaction) => {
    const account = accounts.find(acc => acc.id === transaction.account_id);
    if (!account) return;

    let newBalance = account.balance;
    if (transaction.type === 'income') {
      newBalance -= transaction.amount;
    } else if (transaction.type === 'expense') {
      newBalance += transaction.amount;
    } else if (transaction.type === 'transfer' && transaction.to_account_id) {
      newBalance += transaction.amount;
      const toAccount = accounts.find(acc => acc.id === transaction.to_account_id);
      if (toAccount) {
        await supabase
          .from('bank_accounts')
          .update({ balance: toAccount.balance - transaction.amount })
          .eq('id', transaction.to_account_id);
      }
    }

    await supabase
      .from('bank_accounts')
      .update({ balance: newBalance })
      .eq('id', transaction.account_id);
  };

  const applyTransactionBalances = async (transaction: any) => {
    const account = accounts.find(acc => acc.id === transaction.account_id);
    if (!account) return;

    let newBalance = account.balance;
    if (transaction.type === 'income') {
      newBalance += transaction.amount;
    } else if (transaction.type === 'expense') {
      newBalance -= transaction.amount;
    } else if (transaction.type === 'transfer' && transaction.to_account_id) {
      newBalance -= transaction.amount;
      const toAccount = accounts.find(acc => acc.id === transaction.to_account_id);
      if (toAccount) {
        await supabase
          .from('bank_accounts')
          .update({ balance: toAccount.balance + transaction.amount })
          .eq('id', transaction.to_account_id);
      }
    }

    await supabase
      .from('bank_accounts')
      .update({ balance: newBalance })
      .eq('id', transaction.account_id);
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    setTransactionToDelete(transaction);
    setShowPasswordVerification(true);
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    try {
      // El trigger revertirá el balance automáticamente
      const { error } = await supabase
        .from('bank_transactions')
        .delete()
        .eq('id', transactionToDelete.id);

      if (error) throw error;

      toast.success('Transacción eliminada exitosamente');
      fetchAccounts();
      fetchTransactions();
      setTransactionToDelete(null);
    } catch (error: any) {
      console.error('Error deleting transaction:', error);
      toast.error(error.message || 'Error al eliminar transacción');
      setTransactionToDelete(null);
    }
  };

  const handleReconciliation = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!companyId || !user) {
      toast.error('No se pudo identificar la empresa o usuario');
      return;
    }

    const account = accounts.find(acc => acc.id === reconciliationForm.account_id);
    if (!account) {
      toast.error('Cuenta no encontrada');
      return;
    }

    const systemBalance = account.balance;
    const bankBalance = reconciliationForm.bank_balance;
    const difference = bankBalance - systemBalance;

    try {
      // Crear registro de conciliación
      const { error: reconciliationError } = await supabase
        .from('bank_reconciliations')
        .insert([{
          account_id: reconciliationForm.account_id,
          company_owner_id: companyId,
          reconciliation_date: new Date().toISOString().split('T')[0],
          system_balance: systemBalance,
          bank_balance: bankBalance,
          difference: difference,
          notes: reconciliationForm.notes || null,
          created_by: user.id
        }]);

      if (reconciliationError) throw reconciliationError;

      // Actualizar cuenta con fecha de última conciliación
      const { error: accountError } = await supabase
        .from('bank_accounts')
        .update({
          last_reconciled_date: new Date().toISOString().split('T')[0],
          last_reconciled_balance: bankBalance
        })
        .eq('id', reconciliationForm.account_id);

      if (accountError) throw accountError;

      toast.success('Conciliación registrada exitosamente');
      setShowReconciliationForm(false);
      resetReconciliationForm();
      fetchAccounts();
      fetchReconciliations();
    } catch (error: any) {
      console.error('Error saving reconciliation:', error);
      toast.error(error.message || 'Error al registrar conciliación');
    }
  };

  const resetAccountForm = () => {
    setAccountForm({
      bank_name: '',
      account_type: '',
      account_number: '',
      balance: 0,
      description: '',
      currency: 'DOP'
    });
  };

  const resetTransactionForm = () => {
    setTransactionForm({
      account_id: '',
      to_account_id: '',
      type: 'income',
      amount: 0,
      description: '',
      reference_number: '',
      transaction_date: new Date().toISOString().split('T')[0],
      category: 'none',
      payment_method: 'transfer'
    });
  };

  const resetReconciliationForm = () => {
    setReconciliationForm({
      account_id: '',
      bank_balance: 0,
      notes: ''
    });
  };

  // Filtrado de transacciones
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const matchesSearch = searchTerm === '' || 
        transaction.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.bank_accounts?.bank_name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesType = filterType === 'all' || transaction.type === filterType;
      const matchesAccount = filterAccount === 'all' || transaction.account_id === filterAccount;
      
      const transactionDate = new Date(transaction.transaction_date);
      const matchesDateFrom = !filterDateFrom || transactionDate >= new Date(filterDateFrom);
      const matchesDateTo = !filterDateTo || transactionDate <= new Date(filterDateTo);

      return matchesSearch && matchesType && matchesAccount && matchesDateFrom && matchesDateTo;
    });
  }, [transactions, searchTerm, filterType, filterAccount, filterDateFrom, filterDateTo]);

  // Cálculos
  const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  
  const monthlyIncome = transactions
    .filter(t => {
      const date = new Date(t.transaction_date);
      return t.type === 'income' && 
             date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear;
    })
    .reduce((sum, t) => sum + t.amount, 0);
    
  const monthlyExpenses = transactions
    .filter(t => {
      const date = new Date(t.transaction_date);
      return t.type === 'expense' && 
             date.getMonth() === currentMonth && 
             date.getFullYear() === currentYear;
    })
    .reduce((sum, t) => sum + t.amount, 0);

  const pendingReconciliation = transactions.filter(t => !t.is_reconciled).length;

  const getAccountTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      checking: 'Cuenta Corriente',
      savings: 'Cuenta de Ahorros',
      business: 'Cuenta Empresarial'
    };
    return types[type] || type;
  };

  const getCategoryLabel = (category: string | null) => {
    if (!category) return 'Sin categoría';
    const categories: Record<string, string> = {
      payroll: 'Nómina',
      services: 'Servicios',
      loans: 'Préstamos',
      sales: 'Ventas',
      expenses: 'Gastos',
      transfers: 'Transferencias',
      other: 'Otros'
    };
    return categories[category] || category;
  };

  const getPaymentMethodLabel = (method: string | null) => {
    if (!method) return 'No especificado';
    const methods: Record<string, string> = {
      transfer: 'Transferencia',
      cash: 'Efectivo',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'Online',
      other: 'Otro'
    };
    return methods[method] || method;
  };

  const generateTransactionReceiptHTML = (transaction: Transaction, format: string) => {
    const account = accounts.find(acc => acc.id === transaction.account_id);
    const toAccount = transaction.to_account_id ? accounts.find(acc => acc.id === transaction.to_account_id) : null;
    
    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
              width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 5px !important;
            }
            .header { text-align: center; margin-bottom: 10px; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .info-row { margin-bottom: 3px; font-size: 10px; }
            .amount-section { margin: 10px 0; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; }
            @media print { 
              * { box-sizing: border-box; }
              body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
              .receipt-container { border: none; width: 100% !important; margin: 0 !important; }
              @page { margin: 0 !important; size: auto !important; }
            }
          `;
        case 'POS80':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 14px;
              line-height: 1.3;
              color: #000;
              width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 8px !important;
            }
            .header { text-align: center; margin-bottom: 15px; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .info-row { margin-bottom: 4px; font-size: 12px; }
            .amount-section { margin: 15px 0; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; }
            @media print { 
              * { box-sizing: border-box; }
              body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
              .receipt-container { border: none; width: 100% !important; margin: 0 !important; }
              @page { margin: 0 !important; size: auto !important; }
            }
          `;
        case 'A4':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 210mm;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 210mm; }
            }
          `;
        default:
          return '';
      }
    };

    const companyName = companySettings?.company_name || 'Empresa';
    const companyAddress = companySettings?.address || '';
    const companyPhone = companySettings?.phone || '';
    const transactionTypeLabel = transaction.type === 'income' ? 'INGRESO' : 
                                  transaction.type === 'expense' ? 'EGRESO' : 'TRANSFERENCIA';
    const transactionTypeColor = transaction.type === 'income' ? '#28a745' : 
                                  transaction.type === 'expense' ? '#dc3545' : '#007bff';

    return `
      <html>
        <head>
          <title>Comprobante Bancario - ${transactionTypeLabel}</title>
          <style>
            ${getFormatStyles(format)}
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div class="receipt-title">${companyName}</div>
              ${companyAddress ? `<div class="info-row">${companyAddress}</div>` : ''}
              ${companyPhone ? `<div class="info-row">Tel: ${companyPhone}</div>` : ''}
              <div style="margin-top: 10px; font-weight: bold; color: ${transactionTypeColor};">
                COMPROBANTE DE ${transactionTypeLabel}
              </div>
            </div>
            
            <div style="margin-bottom: 15px;">
              <div class="info-row">
                <span><strong>Fecha:</strong></span>
                <span>${new Date(transaction.transaction_date).toLocaleDateString('es-DO')}</span>
              </div>
              <div class="info-row">
                <span><strong>Descripción:</strong></span>
                <span>${transaction.description}</span>
              </div>
              ${transaction.reference_number ? `
              <div class="info-row">
                <span><strong>Referencia:</strong></span>
                <span>${transaction.reference_number}</span>
              </div>
              ` : ''}
              <div class="info-row">
                <span><strong>Cuenta:</strong></span>
                <span>${account?.bank_name || 'N/A'} - ${account?.account_number || 'N/A'}</span>
              </div>
              ${transaction.type === 'transfer' && toAccount ? `
              <div class="info-row">
                <span><strong>Cuenta Destino:</strong></span>
                <span>${toAccount.bank_name} - ${toAccount.account_number}</span>
              </div>
              ` : ''}
              ${transaction.category ? `
              <div class="info-row">
                <span><strong>Categoría:</strong></span>
                <span>${getCategoryLabel(transaction.category)}</span>
              </div>
              ` : ''}
              ${transaction.payment_method ? `
              <div class="info-row">
                <span><strong>Método de Pago:</strong></span>
                <span>${getPaymentMethodLabel(transaction.payment_method)}</span>
              </div>
              ` : ''}
            </div>

            <div class="amount-section">
              <div class="total-amount" style="color: ${transactionTypeColor};">
                ${transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '↔'} 
                $${transaction.amount.toLocaleString()}
              </div>
            </div>

            <div class="footer">
              <div>Comprobante generado el ${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO')}</div>
              <div style="margin-top: 5px;">ID: ${transaction.id.substring(0, 8)}</div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printTransaction = (transaction: Transaction, format: string = 'POS80') => {
    const html = generateTransactionReceiptHTML(transaction, format);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión Bancaria</h1>
        <Button onClick={() => setShowAccountForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cuenta
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 sm:gap-2">
          <TabsTrigger value="cuentas" className="text-xs sm:text-sm">Cuentas Bancarias</TabsTrigger>
          <TabsTrigger value="movimientos" className="text-xs sm:text-sm">Movimientos</TabsTrigger>
          <TabsTrigger value="conciliacion" className="text-xs sm:text-sm">Conciliación</TabsTrigger>
          <TabsTrigger value="transferencias" className="text-xs sm:text-sm">Transferencias</TabsTrigger>
          <TabsTrigger value="reportes" className="text-xs sm:text-sm">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="cuentas" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
                <p className="text-xs text-muted-foreground">Este mes</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Egresos del Mes</CardTitle>
                <ArrowUpDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">${monthlyExpenses.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Este mes</p>
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
                    <div key={account.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-3">
                            <Building2 className="h-5 w-5 text-blue-600" />
                            <h3 className="font-semibold text-lg">{account.bank_name}</h3>
                            <Badge variant={account.status === 'active' ? 'default' : 'secondary'}>
                              {account.status === 'active' ? 'Activa' : 'Inactiva'}
                            </Badge>
                            <Badge variant="outline">{getAccountTypeLabel(account.account_type)}</Badge>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Cuenta:</span> {account.account_number}
                            </div>
                            <div>
                              <span className="font-medium">Saldo:</span>{' '}
                              <span className="font-bold text-lg text-green-600">
                                ${account.balance.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium">Moneda:</span> {account.currency || 'DOP'}
                            </div>
                          </div>
                          {account.description && (
                            <p className="text-sm text-gray-600">{account.description}</p>
                          )}
                          {account.last_reconciled_date && (
                            <p className="text-xs text-gray-500">
                              Última conciliación: {new Date(account.last_reconciled_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedAccount(account.id);
                              setActiveTab('movimientos');
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setEditingAccount(account);
                              setAccountForm({
                                bank_name: account.bank_name,
                                account_type: account.account_type,
                                account_number: account.account_number,
                                balance: account.balance,
                                description: account.description || '',
                                currency: account.currency || 'DOP'
                              });
                              setShowAccountForm(true);
                            }}
                          >
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Movimientos Bancarios</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Registro de todas las transacciones bancarias (ingresos, egresos y transferencias)
                  </p>
                </div>
                <Button onClick={() => {
                  setShowTransactionForm(true);
                  setEditingTransaction(null);
                  resetTransactionForm();
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Movimiento
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar movimientos..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>
              </div>

              {showFilters && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="income">Ingresos</SelectItem>
                        <SelectItem value="expense">Egresos</SelectItem>
                        <SelectItem value="transfer">Transferencias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Cuenta</Label>
                    <Select value={filterAccount} onValueChange={setFilterAccount}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {accounts.map(acc => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.bank_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Desde</Label>
                    <Input 
                      type="date" 
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Hasta</Label>
                    <Input 
                      type="date" 
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-3">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay movimientos registrados</p>
                  </div>
                ) : (
                  filteredTransactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{transaction.description}</span>
                            {transaction.is_reconciled && (
                              <Badge variant="outline" className="text-xs">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Conciliado
                              </Badge>
                            )}
                            {transaction.category && (
                              <Badge variant="secondary" className="text-xs">
                                {getCategoryLabel(transaction.category)}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center gap-4 flex-wrap">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(transaction.transaction_date).toLocaleDateString()}
                            </span>
                            {transaction.reference_number && (
                              <span>Ref: {transaction.reference_number}</span>
                            )}
                            <span>
                              {transaction.bank_accounts?.bank_name || 'Cuenta desconocida'}
                            </span>
                            {transaction.type === 'transfer' && transaction.to_account && (
                              <span className="flex items-center gap-1">
                                <ArrowRightLeft className="h-3 w-3" />
                                {transaction.to_account.bank_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className={`text-lg font-bold ${
                            transaction.type === 'income' ? 'text-green-600' : 
                            transaction.type === 'expense' ? 'text-red-600' : 
                            'text-blue-600'
                          }`}>
                            {transaction.type === 'income' ? '+' : 
                             transaction.type === 'expense' ? '-' : '↔'}
                            ${transaction.amount.toLocaleString()}
                          </div>
                          <div className="flex gap-2 mt-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setTransactionToPrint(transaction);
                                setPrintFormat('POS80');
                                setShowPrintDialog(true);
                              }}
                              title="Imprimir"
                            >
                              <Printer className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingTransaction(transaction);
                                setTransactionForm({
                                  account_id: transaction.account_id,
                                  to_account_id: transaction.to_account_id || '',
                                  type: transaction.type,
                                  amount: transaction.amount,
                                  description: transaction.description,
                                  reference_number: transaction.reference_number || '',
                                  transaction_date: transaction.transaction_date,
                                  category: transaction.category || 'none',
                                  payment_method: transaction.payment_method || 'transfer'
                                });
                                setShowTransactionForm(true);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeleteTransaction(transaction)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
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

        <TabsContent value="reportes" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Reportes Bancarios</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Análisis y reportes de movimientos bancarios
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Ingresos</p>
                        <p className="text-2xl font-bold text-green-600">
                          ${transactions
                            .filter(t => t.type === 'income')
                            .reduce((sum, t) => sum + t.amount, 0)
                            .toLocaleString()}
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-600 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Total Egresos</p>
                        <p className="text-2xl font-bold text-red-600">
                          ${transactions
                            .filter(t => t.type === 'expense')
                            .reduce((sum, t) => sum + t.amount, 0)
                            .toLocaleString()}
                        </p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-red-600 opacity-50 rotate-180" />
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-600">Balance Total</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ${totalBalance.toLocaleString()}
                        </p>
                      </div>
                      <DollarSign className="h-8 w-8 text-blue-600 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-3">Movimientos por Categoría</h3>
                  <div className="space-y-2">
                    {['payroll', 'services', 'loans', 'sales', 'expenses', 'transfers', 'other'].map(category => {
                      const categoryTransactions = transactions.filter(t => t.category === category);
                      const total = categoryTransactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
                      if (categoryTransactions.length === 0) return null;
                      return (
                        <div key={category} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                          <span className="font-medium">{getCategoryLabel(category)}</span>
                          <div className="text-right">
                            <div className="font-semibold">{categoryTransactions.length} movimientos</div>
                            <div className={`text-sm ${total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              ${Math.abs(total).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold mb-3">Movimientos por Cuenta</h3>
                  <div className="space-y-2">
                    {accounts.map(account => {
                      const accountTransactions = transactions.filter(t => t.account_id === account.id);
                      const income = accountTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                      const expense = accountTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                      if (accountTransactions.length === 0) return null;
                      return (
                        <div key={account.id} className="p-3 bg-gray-50 rounded-lg">
                          <div className="font-medium mb-2">{account.bank_name} - {account.account_number}</div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                              <div className="text-gray-600">Ingresos</div>
                              <div className="font-semibold text-green-600">${income.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Egresos</div>
                              <div className="font-semibold text-red-600">${expense.toLocaleString()}</div>
                            </div>
                            <div>
                              <div className="text-gray-600">Balance</div>
                              <div className="font-semibold">${account.balance.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="conciliacion" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <CardTitle>Conciliación Bancaria</CardTitle>
                  <p className="text-sm text-gray-500 mt-1">
                    Compara el saldo del sistema con el estado de cuenta del banco para identificar diferencias
                  </p>
                </div>
                <Button onClick={() => {
                  if (accounts.length === 0) {
                    toast.error('Debe crear al menos una cuenta bancaria');
                    return;
                  }
                  setShowReconciliationForm(true);
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Conciliación
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {accounts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay cuentas bancarias para conciliar</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {accounts.map((account) => {
                    const accountTransactions = transactions.filter(t => t.account_id === account.id);
                    const unreconciledTransactions = accountTransactions.filter(t => !t.is_reconciled);
                    const reconciledTransactions = accountTransactions.filter(t => t.is_reconciled);
                    const systemBalance = account.balance;
                    
                    return (
                      <div key={account.id} className="border rounded-lg p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{account.bank_name}</h3>
                            <p className="text-sm text-gray-600">Cuenta: {account.account_number}</p>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={unreconciledTransactions.length > 0 ? 'destructive' : 'default'}>
                              {unreconciledTransactions.length} pendientes
                            </Badge>
                            <Badge variant="outline">
                              {reconciledTransactions.length} conciliadas
                            </Badge>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <Label className="text-xs text-gray-600 mb-1 block">Saldo en Sistema</Label>
                            <div className="text-2xl font-bold text-blue-600">
                              ${systemBalance.toLocaleString()}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Calculado automáticamente
                            </p>
                          </div>
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <Label className="text-xs text-gray-600 mb-1 block">Última Conciliación</Label>
                            {account.last_reconciled_date ? (
                              <>
                                <div className="text-lg font-semibold">
                                  {new Date(account.last_reconciled_date).toLocaleDateString()}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                  Saldo: ${account.last_reconciled_balance?.toLocaleString() || '0'}
                                </p>
                              </>
                            ) : (
                              <div className="text-sm text-gray-400">Sin conciliar</div>
                            )}
                          </div>
                          <div className="bg-yellow-50 p-4 rounded-lg">
                            <Label className="text-xs text-gray-600 mb-1 block">Transacciones Pendientes</Label>
                            <div className="text-lg font-semibold">
                              {unreconciledTransactions.length}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              Por conciliar
                            </p>
                          </div>
                        </div>

                        {unreconciledTransactions.length > 0 && (
                          <div className="mt-4">
                            <div className="flex items-center justify-between mb-3">
                              <Label className="font-medium">Transacciones Pendientes de Conciliar</Label>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                  // Marcar todas como conciliadas
                                  const transIds = unreconciledTransactions.map(t => t.id);
                                  const { error } = await supabase
                                    .from('bank_transactions')
                                    .update({ 
                                      is_reconciled: true,
                                      reconciled_at: new Date().toISOString(),
                                      reconciled_by: user?.id || null
                                    })
                                    .in('id', transIds);
                                  
                                  if (error) {
                                    toast.error('Error al marcar transacciones');
                                  } else {
                                    toast.success(`${transIds.length} transacciones marcadas como conciliadas`);
                                    fetchTransactions();
                                  }
                                }}
                              >
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Marcar todas como conciliadas
                              </Button>
                            </div>
                            <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                              {unreconciledTransactions.map((trans) => (
                                <div key={trans.id} className="flex justify-between items-center text-sm p-2 bg-white hover:bg-gray-50 rounded border">
                                  <div className="flex-1">
                                    <div className="font-medium">{trans.description}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(trans.transaction_date).toLocaleDateString()}
                                      {trans.reference_number && (
                                        <>
                                          <span>•</span>
                                          <span>Ref: {trans.reference_number}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className={`font-semibold ${
                                      trans.type === 'income' ? 'text-green-600' : 
                                      trans.type === 'expense' ? 'text-red-600' : 
                                      'text-blue-600'
                                    }`}>
                                      {trans.type === 'income' ? '+' : 
                                       trans.type === 'expense' ? '-' : '↔'}
                                      ${trans.amount.toLocaleString()}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={async () => {
                                        const { error } = await supabase
                                          .from('bank_transactions')
                                          .update({ 
                                            is_reconciled: true,
                                            reconciled_at: new Date().toISOString(),
                                            reconciled_by: user?.id || null
                                          })
                                          .eq('id', trans.id);
                                        
                                        if (error) {
                                          toast.error('Error al marcar transacción');
                                        } else {
                                          toast.success('Transacción marcada como conciliada');
                                          fetchTransactions();
                                        }
                                      }}
                                    >
                                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {unreconciledTransactions.length === 0 && accountTransactions.length > 0 && (
                          <div className="text-center py-4 bg-green-50 rounded-lg">
                            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                            <p className="text-sm font-medium text-green-700">
                              Todas las transacciones están conciliadas
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Historial de Conciliaciones */}
                  {reconciliations.length > 0 && (
                    <div className="mt-8 border-t pt-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold">Historial de Conciliaciones</h3>
                        <Badge variant="outline">{reconciliations.length} registros</Badge>
                      </div>
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {reconciliations.map((recon) => {
                          const account = accounts.find(acc => acc.id === recon.account_id);
                          // Obtener transacciones conciliadas en esta fecha o antes
                          const reconciledOnDate = transactions.filter(t => 
                            t.account_id === recon.account_id && 
                            t.is_reconciled &&
                            t.reconciled_at &&
                            new Date(t.reconciled_at).toISOString().split('T')[0] <= recon.reconciliation_date
                          );
                          
                          return (
                            <div key={recon.id} className="border rounded-lg p-4 bg-white">
                              <div className="flex items-start justify-between mb-2">
                                <div>
                                  <div className="font-semibold">
                                    {account?.bank_name || 'Cuenta eliminada'} - {account?.account_number || 'N/A'}
                                  </div>
                                  <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                                    <Calendar className="h-3 w-3" />
                                    {new Date(recon.reconciliation_date).toLocaleDateString()}
                                  </div>
                                </div>
                                <Badge variant={recon.difference === 0 ? 'default' : 'destructive'}>
                                  {recon.difference === 0 ? 'Coincide' : `Diferencia: ${recon.difference >= 0 ? '+' : ''}$${Math.abs(recon.difference).toLocaleString()}`}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                                <div>
                                  <span className="text-gray-600">Saldo Sistema:</span>
                                  <span className="ml-2 font-semibold text-blue-600">
                                    ${recon.system_balance.toLocaleString()}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-600">Saldo Banco:</span>
                                  <span className="ml-2 font-semibold">
                                    ${recon.bank_balance.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              {reconciledOnDate.length > 0 && (
                                <div className="mt-3 pt-3 border-t">
                                  <div className="text-xs text-gray-600 mb-2">
                                    <strong>Transacciones conciliadas ({reconciledOnDate.length}):</strong>
                                  </div>
                                  <div className="space-y-1 max-h-32 overflow-y-auto">
                                    {reconciledOnDate.slice(0, 5).map(trans => (
                                      <div key={trans.id} className="text-xs flex justify-between items-center p-1 bg-gray-50 rounded">
                                        <span className="truncate flex-1">{trans.description}</span>
                                        <span className={`ml-2 font-semibold ${
                                          trans.type === 'income' ? 'text-green-600' : 
                                          trans.type === 'expense' ? 'text-red-600' : 
                                          'text-blue-600'
                                        }`}>
                                          {trans.type === 'income' ? '+' : trans.type === 'expense' ? '-' : '↔'}
                                          ${trans.amount.toLocaleString()}
                                        </span>
                                      </div>
                                    ))}
                                    {reconciledOnDate.length > 5 && (
                                      <div className="text-xs text-gray-500 text-center">
                                        Y {reconciledOnDate.length - 5} más...
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                              {recon.notes && (
                                <div className="mt-2 text-sm text-gray-600">
                                  <span className="font-medium">Notas:</span> {recon.notes}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                    <Label htmlFor="account_id">Cuenta *</Label>
                    <Select 
                      value={transactionForm.account_id} 
                      onValueChange={(value) => setTransactionForm({...transactionForm, account_id: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.filter(acc => acc.status === 'active').map(account => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.bank_name} - {account.account_number}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="type">Tipo de Movimiento *</Label>
                    <Select 
                      value={transactionForm.type} 
                      onValueChange={(value: 'income' | 'expense' | 'transfer') => 
                        setTransactionForm({...transactionForm, type: value, to_account_id: ''})
                      }
                      required
                    >
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

                {transactionForm.type === 'transfer' && (
                  <div>
                    <Label htmlFor="to_account_id">Cuenta Destino *</Label>
                    <Select 
                      value={transactionForm.to_account_id} 
                      onValueChange={(value) => setTransactionForm({...transactionForm, to_account_id: value})}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cuenta destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts
                          .filter(acc => acc.id !== transactionForm.account_id && acc.status === 'active')
                          .map(account => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.bank_name} - {account.account_number}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="amount">Monto *</Label>
                    <NumberInput
                      id="amount"
                      step="0.01"
                      min="0.01"
                      value={transactionForm.amount}
                      onChange={(e) => setTransactionForm({...transactionForm, amount: Number(e.target.value)})}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="transaction_date">Fecha *</Label>
                    <Input
                      id="transaction_date"
                      type="date"
                      value={transactionForm.transaction_date}
                      onChange={(e) => setTransactionForm({...transactionForm, transaction_date: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Categoría</Label>
                    <Select 
                      value={transactionForm.category || 'none'} 
                      onValueChange={(value) => setTransactionForm({...transactionForm, category: value === 'none' ? '' : value})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin categoría</SelectItem>
                        <SelectItem value="payroll">Nómina</SelectItem>
                        <SelectItem value="services">Servicios</SelectItem>
                        <SelectItem value="loans">Préstamos</SelectItem>
                        <SelectItem value="sales">Ventas</SelectItem>
                        <SelectItem value="expenses">Gastos</SelectItem>
                        <SelectItem value="transfers">Transferencias</SelectItem>
                        <SelectItem value="other">Otros</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="payment_method">Método de Pago</Label>
                    <Select 
                      value={transactionForm.payment_method} 
                      onValueChange={(value) => setTransactionForm({...transactionForm, payment_method: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="check">Cheque</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="other">Otro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Descripción *</Label>
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

                <div className="flex justify-end gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setShowTransactionForm(false);
                      setEditingTransaction(null);
                      resetTransactionForm();
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingTransaction ? 'Actualizar' : 'Registrar'} Movimiento
                  </Button>
                </div>
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
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="account_type">Tipo de Cuenta *</Label>
                <Select 
                  value={accountForm.account_type} 
                  onValueChange={(value) => setAccountForm({...accountForm, account_type: value})}
                  required
                >
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
                <Label htmlFor="currency">Moneda</Label>
                <Select 
                  value={accountForm.currency} 
                  onValueChange={(value) => setAccountForm({...accountForm, currency: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DOP">DOP</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
              <NumberInput
                id="balance"
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

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? 'Editar Movimiento' : 'Registrar Movimiento'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleTransactionSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dialog_account_id">Cuenta *</Label>
                <Select 
                  value={transactionForm.account_id} 
                  onValueChange={(value) => setTransactionForm({...transactionForm, account_id: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(acc => acc.status === 'active').map(account => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank_name} - {account.account_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dialog_type">Tipo de Movimiento *</Label>
                <Select 
                  value={transactionForm.type} 
                  onValueChange={(value: 'income' | 'expense' | 'transfer') => 
                    setTransactionForm({...transactionForm, type: value, to_account_id: ''})
                  }
                  required
                >
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

            {transactionForm.type === 'transfer' && (
              <div>
                <Label htmlFor="dialog_to_account_id">Cuenta Destino *</Label>
                <Select 
                  value={transactionForm.to_account_id} 
                  onValueChange={(value) => setTransactionForm({...transactionForm, to_account_id: value})}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter(acc => acc.id !== transactionForm.account_id && acc.status === 'active')
                      .map(account => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.bank_name} - {account.account_number}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dialog_amount">Monto *</Label>
                <NumberInput
                  id="dialog_amount"
                  step="0.01"
                  min="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({...transactionForm, amount: Number(e.target.value)})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="dialog_transaction_date">Fecha *</Label>
                <Input
                  id="dialog_transaction_date"
                  type="date"
                  value={transactionForm.transaction_date}
                  onChange={(e) => setTransactionForm({...transactionForm, transaction_date: e.target.value})}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dialog_category">Categoría</Label>
                <Select 
                  value={transactionForm.category || 'none'} 
                  onValueChange={(value) => setTransactionForm({...transactionForm, category: value === 'none' ? '' : value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin categoría</SelectItem>
                    <SelectItem value="payroll">Nómina</SelectItem>
                    <SelectItem value="services">Servicios</SelectItem>
                    <SelectItem value="loans">Préstamos</SelectItem>
                    <SelectItem value="sales">Ventas</SelectItem>
                    <SelectItem value="expenses">Gastos</SelectItem>
                    <SelectItem value="transfers">Transferencias</SelectItem>
                    <SelectItem value="other">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dialog_payment_method">Método de Pago</Label>
                <Select 
                  value={transactionForm.payment_method} 
                  onValueChange={(value) => setTransactionForm({...transactionForm, payment_method: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="dialog_description">Descripción *</Label>
              <Input
                id="dialog_description"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({...transactionForm, description: e.target.value})}
                placeholder="Descripción del movimiento"
                required
              />
            </div>

            <div>
              <Label htmlFor="dialog_reference_number">Número de Referencia</Label>
              <Input
                id="dialog_reference_number"
                value={transactionForm.reference_number}
                onChange={(e) => setTransactionForm({...transactionForm, reference_number: e.target.value})}
                placeholder="Número de referencia (opcional)"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowTransactionForm(false);
                  setEditingTransaction(null);
                  resetTransactionForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">
                {editingTransaction ? 'Actualizar' : 'Registrar'} Movimiento
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reconciliation Form Dialog */}
      <Dialog open={showReconciliationForm} onOpenChange={setShowReconciliationForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Conciliación Bancaria</DialogTitle>
            <div className="text-sm text-gray-600 mt-2 space-y-2">
              <p>
                Compara el saldo del sistema con el estado de cuenta del banco para identificar diferencias y transacciones pendientes.
              </p>
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                <p className="font-semibold text-blue-900 mb-1">¿Qué registra este botón?</p>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>Guarda un <strong>historial</strong> de la conciliación (fecha, saldos, diferencia)</li>
                  <li>Actualiza la fecha de última conciliación en la cuenta</li>
                  <li><strong>NO marca</strong> automáticamente las transacciones como conciliadas</li>
                  <li>Para marcar transacciones, use los botones en la pestaña de Conciliación</li>
                </ul>
              </div>
            </div>
          </DialogHeader>
          <form onSubmit={handleReconciliation} className="space-y-4">
            <div>
              <Label htmlFor="reconciliation_account_id">Cuenta *</Label>
              <Select 
                value={reconciliationForm.account_id} 
                onValueChange={(value) => {
                  const account = accounts.find(acc => acc.id === value);
                  setReconciliationForm({
                    ...reconciliationForm, 
                    account_id: value,
                    bank_balance: account?.balance || 0
                  });
                }}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cuenta" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter(acc => acc.status === 'active').map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.bank_name} - {account.account_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {reconciliationForm.account_id && (() => {
              const account = accounts.find(acc => acc.id === reconciliationForm.account_id);
              const accountTransactions = transactions.filter(t => t.account_id === reconciliationForm.account_id);
              const unreconciledTransactions = accountTransactions.filter(t => !t.is_reconciled);
              const systemBalance = account?.balance || 0;
              const difference = reconciliationForm.bank_balance - systemBalance;
              
              return (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <Label className="text-xs text-gray-600 mb-1 block">Saldo en Sistema</Label>
                      <div className="text-2xl font-bold text-blue-600">
                        ${systemBalance.toLocaleString()}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Calculado automáticamente desde las transacciones registradas
                      </p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <Label htmlFor="bank_balance" className="text-xs text-gray-600 mb-1 block">
                        Saldo en Estado de Cuenta del Banco *
                      </Label>
                      <NumberInput
                        id="bank_balance"
                        step="0.01"
                        value={reconciliationForm.bank_balance}
                        onChange={(e) => setReconciliationForm({...reconciliationForm, bank_balance: Number(e.target.value)})}
                        placeholder="Ingrese saldo del banco"
                        className="text-lg font-semibold"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Ingrese el saldo que aparece en el estado de cuenta del banco
                      </p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${
                    difference === 0 ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <Label className="text-xs text-gray-600 mb-1 block">Diferencia</Label>
                    <div className={`text-2xl font-bold ${
                      difference === 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {difference >= 0 ? '+' : ''}${difference.toLocaleString()}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {difference === 0 
                        ? 'Los saldos coinciden perfectamente' 
                        : difference > 0
                        ? 'El banco reporta más dinero del que tiene el sistema'
                        : 'El sistema tiene más dinero del que reporta el banco'}
                    </p>
                  </div>

                  {unreconciledTransactions.length > 0 && (
                    <div className="border rounded-lg p-4">
                      <Label className="font-medium mb-3 block">
                        Transacciones Pendientes de Conciliar ({unreconciledTransactions.length})
                      </Label>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {unreconciledTransactions.map((trans) => (
                          <div key={trans.id} className="flex justify-between items-center text-sm p-2 bg-gray-50 rounded">
                            <div>
                              <span className="font-medium">{trans.description}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                {new Date(trans.transaction_date).toLocaleDateString()}
                              </span>
                            </div>
                            <span className={`font-semibold ${
                              trans.type === 'income' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {trans.type === 'income' ? '+' : '-'}${trans.amount.toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        💡 Puede marcar estas transacciones como conciliadas desde la pestaña de Conciliación
                      </p>
                    </div>
                  )}
                </>
              );
            })()}

            <div>
              <Label htmlFor="reconciliation_notes">Notas</Label>
              <Textarea
                id="reconciliation_notes"
                value={reconciliationForm.notes}
                onChange={(e) => setReconciliationForm({...reconciliationForm, notes: e.target.value})}
                placeholder="Notas sobre la conciliación (ej: cheques pendientes, depósitos en tránsito, etc.)"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowReconciliationForm(false);
                  resetReconciliationForm();
                }}
              >
                Cancelar
              </Button>
              <Button type="submit">
                Registrar Conciliación
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Print Dialog */}
      <Dialog open={showPrintDialog} onOpenChange={setShowPrintDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Imprimir Comprobante</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Formato de Impresión</Label>
              <Select value={printFormat} onValueChange={setPrintFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POS58">POS 58mm</SelectItem>
                  <SelectItem value="POS80">POS 80mm</SelectItem>
                  <SelectItem value="A4">A4</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {transactionToPrint && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm space-y-1">
                  <div><strong>Descripción:</strong> {transactionToPrint.description}</div>
                  <div><strong>Monto:</strong> ${transactionToPrint.amount.toLocaleString()}</div>
                  <div><strong>Fecha:</strong> {new Date(transactionToPrint.transaction_date).toLocaleDateString()}</div>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => setShowPrintDialog(false)}
              >
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (transactionToPrint) {
                    printTransaction(transactionToPrint, printFormat);
                    setShowPrintDialog(false);
                  }
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => {
          setShowPasswordVerification(false);
          setTransactionToDelete(null);
        }}
        onVerify={() => {
          setShowPasswordVerification(false);
          confirmDeleteTransaction();
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación de la transacción bancaria."
        entityName="transacción bancaria"
      />
    </div>
  );
};

export default BanksModule;
