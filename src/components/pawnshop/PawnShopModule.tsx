import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generatePawnPaymentReceipt, openWhatsApp } from '@/utils/whatsappReceipt';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatDateTimeWithOffset, calculateDueDateInSantoDomingo, getCurrentDateStringForSantoDomingo, formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { 
  DollarSign, 
  Plus, 
  PlusCircle,
  TrendingUp,
  Search, 
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Package,
  User,
  Calendar,
  History,
  Receipt,
  Printer,
  Download,
  Eye,
  Edit,
  X
} from 'lucide-react';

interface PawnTransaction {
  id: string;
  client_id: string;
  product_id: string | null;
  product_name: string;
  product_description: string | null;
  estimated_value: number;
  loan_amount: number;
  interest_rate: number;
  interest_rate_type: 'monthly' | 'annual' | 'daily' | 'weekly' | 'biweekly' | 'quarterly' | 'yearly';
  period_days: number;
  start_date: string;
  due_date: string;
  status: 'active' | 'redeemed' | 'forfeited' | 'deleted';
  notes: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_reason?: string | null;
  item_category?: string | null;
  item_brand?: string | null;
  item_model?: string | null;
  item_condition?: string | null;
  clients?: {
    id: string;
    full_name: string;
    phone: string;
  };
  products?: {
    id: string;
    name: string;
  };
}

interface PawnPayment {
  id: string;
  pawn_transaction_id: string;
  amount: number;
  payment_date: string;
  payment_type: 'partial' | 'full' | 'interest' | 'extension';
  notes: string | null;
  interest_payment?: number | null;
  principal_payment?: number | null;
  remaining_balance?: number | null;
  remaining_interest?: number | null;
}

interface Client {
  id: string;
  full_name: string;
  phone: string;
}

interface Product {
  id: string;
  name: string;
  current_stock: number;
}

interface PaymentFormContentProps {
  transaction: PawnTransaction;
  paymentData: {
    amount: number;
    payment_method: 'cash' | 'transfer' | 'card' | 'check' | 'other';
    notes: string;
    reference_number?: string;
  };
  setPaymentData: (data: any) => void;
  onCancel: () => void;
  onSubmit: (e: React.FormEvent) => void;
  getCurrentRemainingPrincipal: (transactionId: string, initialLoanAmount: number) => Promise<number>;
  calculateAccumulatedInterest: (transaction: PawnTransaction, currentDate: string, interestPayments?: number) => Promise<number>;
}

const PaymentFormContent: React.FC<PaymentFormContentProps> = ({
  transaction,
  paymentData,
  setPaymentData,
  onCancel,
  onSubmit,
  getCurrentRemainingPrincipal,
  calculateAccumulatedInterest
}) => {
  const [loading, setLoading] = useState(true);
  const [currentPrincipal, setCurrentPrincipal] = useState(0);
  const [accumulatedInterest, setAccumulatedInterest] = useState(0);
  const [paymentBreakdown, setPaymentBreakdown] = useState({
    interestPayment: 0,
    principalPayment: 0,
    newBalance: 0
  });

  useEffect(() => {
    const calculatePaymentInfo = async () => {
      setLoading(true);
      try {
        // Obtener ambos datos en paralelo para optimizar
        const [principal, totalInterestPaid] = await Promise.all([
          getCurrentRemainingPrincipal(transaction.id, Number(transaction.loan_amount)),
          // Obtener total de pagos de interés para optimizar
          (async () => {
            try {
              const { data: payments } = await supabase
                .from('pawn_payments')
                .select('interest_payment')
                .eq('pawn_transaction_id', transaction.id)
                .not('interest_payment', 'is', null);
              
              return payments?.reduce((sum, p) => sum + Number(p.interest_payment || 0), 0) || 0;
            } catch (error) {
              console.error('Error obteniendo pagos de interés:', error);
              return 0;
            }
          })()
        ]);
        
        setCurrentPrincipal(principal);
        
        // Usar la misma función que las estadísticas: desde start_date hasta hoy
        const today = new Date().toISOString().split('T')[0];
        const interest = await calculateAccumulatedInterest(transaction, today, totalInterestPaid);
        setAccumulatedInterest(interest);
      } catch (error) {
        console.error('Error calculating payment info:', error);
      } finally {
        setLoading(false);
      }
    };

    calculatePaymentInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  // Calcular desglose cuando cambie el monto del pago
  useEffect(() => {
    if (paymentData.amount > 0 && currentPrincipal > 0 && accumulatedInterest >= 0) {
      const interestPayment = Math.min(paymentData.amount, accumulatedInterest);
      const principalPayment = Math.max(0, paymentData.amount - interestPayment);
      const newBalance = Math.max(0, currentPrincipal - principalPayment);
      
      setPaymentBreakdown({
        interestPayment,
        principalPayment,
        newBalance
      });
    } else {
      setPaymentBreakdown({
        interestPayment: 0,
        principalPayment: 0,
        newBalance: currentPrincipal
      });
    }
  }, [paymentData.amount, currentPrincipal, accumulatedInterest]);

  const totalDue = currentPrincipal + accumulatedInterest;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Información de la transacción */}
      <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-2">
        <p><strong>Artículo:</strong> {transaction.product_name}</p>
        <p><strong>Cliente:</strong> {transaction.clients?.full_name}</p>
        <p><strong>Monto prestado inicial:</strong> ${Number(transaction.loan_amount).toLocaleString()}</p>
      </div>

      {loading ? (
        <div className="text-center py-4">Cargando información...</div>
      ) : (
        <>
          {/* Resumen de deuda */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen de Deuda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Capital Pendiente:</span>
                <span className="font-semibold">${currentPrincipal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Interés Acumulado:</span>
                <span className="font-semibold text-orange-600">${accumulatedInterest.toFixed(2)}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-bold text-lg">Total Adeudado:</span>
                <span className="font-bold text-lg text-red-600">${totalDue.toFixed(2)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Monto del pago */}
          <div>
            <Label htmlFor="amount">Monto del Pago *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={paymentData.amount || ''}
              onChange={(e) => {
                const amount = parseFloat(e.target.value) || 0;
                setPaymentData({...paymentData, amount});
              }}
              required
            />
          </div>

          {/* Desglose del pago */}
          {paymentData.amount > 0 && (
            <Card className="bg-blue-50">
              <CardHeader>
                <CardTitle className="text-lg">Desglose del Pago</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Aplicado a Interés:</span>
                  <span className="font-semibold">${paymentBreakdown.interestPayment.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Aplicado a Capital:</span>
                  <span className="font-semibold">${paymentBreakdown.principalPayment.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-semibold">Nuevo Capital Pendiente:</span>
                  <span className="font-semibold text-blue-600">${paymentBreakdown.newBalance.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Método de pago */}
          <div>
            <Label htmlFor="payment_method">Método de Pago *</Label>
            <Select 
              value={paymentData.payment_method} 
              onValueChange={(value: 'cash' | 'transfer' | 'card' | 'check' | 'other') => 
                setPaymentData({...paymentData, payment_method: value})
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="check">Cheque</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notas */}
          <div>
            <Label htmlFor="payment_notes">Notas</Label>
            <Textarea
              id="payment_notes"
              value={paymentData.notes}
              onChange={(e) => setPaymentData({...paymentData, notes: e.target.value})}
              placeholder="Notas del pago..."
              rows={2}
            />
          </div>

          {/* Botones */}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button type="submit">Registrar Pago</Button>
          </div>
        </>
      )}
    </form>
  );
};

export const PawnShopModule = () => {
  const [transactions, setTransactions] = useState<PawnTransaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [soldProductsCache, setSoldProductsCache] = useState<Map<string, boolean>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [showRateUpdateForm, setShowRateUpdateForm] = useState(false);
  const [showQuickUpdate, setShowQuickUpdate] = useState(false);
  const [showInterestPreview, setShowInterestPreview] = useState(false);
  const [showExtendForm, setShowExtendForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAddChargeForm, setShowAddChargeForm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [extendDays, setExtendDays] = useState<number>(30);
  const [chargeFormData, setChargeFormData] = useState({
    amount: 0,
    charge_date: getCurrentDateStringForSantoDomingo(),
    reference_number: '',
    reason: '',
    notes: ''
  });
  const [selectedTransaction, setSelectedTransaction] = useState<PawnTransaction | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PawnPayment[]>([]);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PawnPayment | null>(null);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [lastPaymentData, setLastPaymentData] = useState<any>(null);
  const [interestPreviewData, setInterestPreviewData] = useState<{
    principal: number;
    rate: number;
    days: number;
    startDate: string;
    dailyBreakdown: Array<{
      day: number;
      date: string;
      dailyInterest: number;
      accumulatedInterest: number;
      totalAmount: number;
    }>;
  } | null>(null);
  const { user, companySettings } = useAuth();

  const [formData, setFormData] = useState({
    client_id: '',
    product_name: '',
    product_description: '',
    item_category: '',
    item_condition: 'excellent',
    item_brand: '',
    item_model: '',
    estimated_value: 0,
    loan_amount: 0,
    interest_rate: 20.0,
    interest_rate_type: 'monthly' as 'monthly' | 'annual' | 'daily' | 'weekly' | 'biweekly' | 'quarterly' | 'yearly',
    period_days: 90,
    start_date: new Date().toISOString().split('T')[0],
    due_date: '',
    notes: ''
  });

  // Estados para autocompletado de categoría
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  
  // Estados para autocompletado de marca
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState('');
  
  // Estados para autocompletado de modelo
  const [showModelSuggestions, setShowModelSuggestions] = useState(false);
  const [modelSuggestions, setModelSuggestions] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_method: 'cash' as 'cash' | 'transfer' | 'card' | 'check' | 'other',
    notes: ''
  });

  const [detailsSummary, setDetailsSummary] = useState({
    capitalPending: 0,
    interestAccrued: 0,
    totalPaid: 0,
    totalPrincipalPaid: 0,
    totalInterestPaid: 0,
    loading: true
  });

  const [rateUpdateData, setRateUpdateData] = useState({
    new_rate: 0,
    reason: '',
    effective_date: ''
  });
  const [hasManualPawnPeriod, setHasManualPawnPeriod] = useState(false);
  
  // Estados para búsqueda en cascada de clientes
  const [clientSearch, setClientSearch] = useState('');
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Escuchar evento para recargar historial cuando se agrega un cargo
  useEffect(() => {
    const handleHistoryRefresh = async (event: CustomEvent) => {
      const { transactionId } = event.detail;
      if (transactionId && selectedTransaction?.id === transactionId) {
        await fetchPaymentHistory(transactionId);
      }
    };

    window.addEventListener('pawnHistoryRefresh', handleHistoryRefresh as EventListener);
    return () => {
      window.removeEventListener('pawnHistoryRefresh', handleHistoryRefresh as EventListener);
    };
  }, [selectedTransaction]);

  // Inicializar fecha de vencimiento cuando se abre el formulario
  useEffect(() => {
    if (showTransactionForm && formData.start_date && !formData.due_date) {
      const dueDate = calculateDueDate(formData.start_date, formData.period_days);
      setFormData(prev => ({
        ...prev,
        due_date: dueDate
      }));
    }
  }, [showTransactionForm, formData.start_date, formData.period_days]);


  // Función para búsqueda en cascada de clientes
  const handleClientSearch = (searchTerm: string) => {
    setClientSearch(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredClients([]);
      setShowClientDropdown(false);
      setSelectedClient(null);
      setFormData({...formData, client_id: ''});
      return;
    }

    const filtered = clients.filter(client =>
      client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone.includes(searchTerm)
    );
    
    setFilteredClients(filtered);
    setShowClientDropdown(filtered.length > 0);
  };

  // Función para seleccionar cliente
  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.full_name);
    setFormData({...formData, client_id: client.id});
    setShowClientDropdown(false);
  };

  // Función para verificar si un producto de transacción perdida fue vendido
  const checkIfProductWasSold = async (transactionId: string): Promise<boolean> => {
    try {
      // Buscar el producto del inventario relacionado con esta transacción
      const { data: inventoryProducts } = await supabase
        .from('products')
        .select('id')
        .eq('user_id', user.id)
        .eq('original_transaction_id', transactionId)
        .eq('source', 'pawn_forfeited');

      if (!inventoryProducts || inventoryProducts.length === 0) {
        return false; // No hay producto en inventario, no se puede vender
      }

      // Verificar si alguno de estos productos fue vendido
      for (const product of inventoryProducts) {
        // Verificar en sale_details (esquema nuevo)
        const { data: saleDetails } = await supabase
          .from('sale_details')
          .select('id')
          .eq('product_id', product.id)
          .limit(1);
        
        if (saleDetails && saleDetails.length > 0) {
          return true; // Producto fue vendido
        }
        
        // Verificar en sales (esquema simple)
        const { data: sales } = await supabase
          .from('sales')
          .select('id')
          .eq('product_id', product.id)
          .limit(1);
        
        if (sales && sales.length > 0) {
          return true; // Producto fue vendido
        }
      }

      return false; // No fue vendido
    } catch (error) {
      console.error('Error checking if product was sold:', error);
      return false; // En caso de error, permitir intentar recuperar
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [transactionsRes, clientsRes, productsRes, allProductsRes, allTransactionsRes] = await Promise.all([
         supabase
           .from('pawn_transactions')
           .select(`
             *,
             clients(id, full_name, phone),
             products!pawn_transactions_product_id_fkey(id, name)
           `)
           .eq('user_id', user.id)
           .order('created_at', { ascending: false }),
         supabase
           .from('clients')
           .select('id, full_name, phone')
           .eq('user_id', user.id)
           .order('full_name'),
         supabase
           .from('products')
           .select('id, name, current_stock')
           .eq('user_id', user.id)
           .eq('status', 'active')
           .order('name'),
         supabase
           .from('products')
           .select('category, brand')
           .eq('user_id', user.id),
         supabase
           .from('pawn_transactions')
           .select('item_brand, item_model')
           .eq('user_id', user.id)
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (productsRes.error) throw productsRes.error;

      setTransactions(transactionsRes.data || []);
      setClients(clientsRes.data || []);
      setProducts(productsRes.data || []);
      setAllProducts(allProductsRes.data || []);
      setAllTransactions(allTransactionsRes.data || []);
      
      // Verificar qué productos de transacciones perdidas fueron vendidos
      const forfeitedTransactions = (transactionsRes.data || []).filter(t => t.status === 'forfeited');
      const soldStatusMap = new Map<string, boolean>();
      
      for (const transaction of forfeitedTransactions) {
        const wasSold = await checkIfProductWasSold(transaction.id);
        soldStatusMap.set(transaction.id, wasSold);
      }
      
      setSoldProductsCache(soldStatusMap);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Obtener categorías únicas de productos existentes
  const getAllCategories = () => {
    const uniqueCategories = [...new Set(allProducts.map(p => p.category).filter(Boolean))] as string[];
    return uniqueCategories.sort();
  };

  // Manejar búsqueda de categoría con cascada (exacto, empieza con, contiene)
  const handleCategorySearch = (searchTerm: string) => {
    setCategorySearch(searchTerm);
    setFormData({...formData, item_category: searchTerm});
    
    if (searchTerm.trim() === '') {
      setCategorySuggestions([]);
      setShowCategorySuggestions(false);
      return;
    }

    const allCategories = getAllCategories();
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Búsqueda en cascada: primero coincidencias exactas, luego que empiezan con, luego que contienen
    const exactMatches = allCategories.filter(cat => 
      cat.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allCategories.filter(cat => 
      cat.toLowerCase().startsWith(searchLower) && cat.toLowerCase() !== searchLower
    );
    
    const containsMatches = allCategories.filter(cat => 
      cat.toLowerCase().includes(searchLower) && !cat.toLowerCase().startsWith(searchLower)
    );
    
    // Combinar resultados en orden de prioridad
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setCategorySuggestions(filtered);
    setShowCategorySuggestions(filtered.length > 0);
  };

  // Seleccionar categoría de sugerencias
  const selectCategory = (category: string) => {
    setCategorySearch(category);
    setFormData({...formData, item_category: category});
    setShowCategorySuggestions(false);
    setCategorySuggestions([]);
  };

  // Obtener marcas únicas de productos y transacciones
  const getAllBrands = () => {
    const productBrands = allProducts.map(p => p.brand).filter(Boolean);
    const transactionBrands = allTransactions.map(t => t.item_brand).filter(Boolean);
    const uniqueBrands = [...new Set([...productBrands, ...transactionBrands])] as string[];
    return uniqueBrands.sort();
  };

  // Manejar búsqueda de marca con cascada
  const handleBrandSearch = (searchTerm: string) => {
    setBrandSearch(searchTerm);
    setFormData({...formData, item_brand: searchTerm});
    
    if (searchTerm.trim() === '') {
      setBrandSuggestions([]);
      setShowBrandSuggestions(false);
      return;
    }

    const allBrands = getAllBrands();
    const searchLower = searchTerm.toLowerCase().trim();
    
    const exactMatches = allBrands.filter(brand => 
      brand.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allBrands.filter(brand => 
      brand.toLowerCase().startsWith(searchLower) && brand.toLowerCase() !== searchLower
    );
    
    const containsMatches = allBrands.filter(brand => 
      brand.toLowerCase().includes(searchLower) && !brand.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  // Seleccionar marca de sugerencias
  const selectBrand = (brand: string) => {
    setBrandSearch(brand);
    setFormData({...formData, item_brand: brand});
    setShowBrandSuggestions(false);
    setBrandSuggestions([]);
  };

  // Obtener modelos únicos de transacciones (filtrados por marca si hay)
  const getAllModels = (filterByBrand?: string) => {
    let transactionModels = allTransactions.map(t => t.item_model).filter(Boolean);
    
    // Si hay una marca seleccionada, filtrar modelos por esa marca
    if (filterByBrand && filterByBrand.trim()) {
      transactionModels = allTransactions
        .filter(t => t.item_brand && t.item_brand.toLowerCase() === filterByBrand.toLowerCase())
        .map(t => t.item_model)
        .filter(Boolean);
    }
    
    const uniqueModels = [...new Set(transactionModels)] as string[];
    return uniqueModels.sort();
  };

  // Manejar búsqueda de modelo con cascada
  const handleModelSearch = (searchTerm: string) => {
    setModelSearch(searchTerm);
    setFormData({...formData, item_model: searchTerm});
    
    if (searchTerm.trim() === '') {
      setModelSuggestions([]);
      setShowModelSuggestions(false);
      return;
    }

    const allModels = getAllModels(formData.item_brand);
    const searchLower = searchTerm.toLowerCase().trim();
    
    const exactMatches = allModels.filter(model => 
      model.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allModels.filter(model => 
      model.toLowerCase().startsWith(searchLower) && model.toLowerCase() !== searchLower
    );
    
    const containsMatches = allModels.filter(model => 
      model.toLowerCase().includes(searchLower) && !model.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setModelSuggestions(filtered);
    setShowModelSuggestions(filtered.length > 0);
  };

  // Seleccionar modelo de sugerencias
  const selectModel = (model: string) => {
    setModelSearch(model);
    setFormData({...formData, item_model: model});
    setShowModelSuggestions(false);
    setModelSuggestions([]);
  };

  // Función para generar recibo de creación de empeño
  const generatePawnReceiptHTML = (transaction: any, client: any, format: string = 'LETTER') => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP'
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Empeño</title>
        <style>
          @page {
            size: ${format};
            margin: 0.5in;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .company-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .receipt-title {
            font-size: 16px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
            text-decoration: underline;
          }
          .info-section {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: bold;
          }
          .transaction-details {
            border: 1px solid #333;
            padding: 10px;
            margin: 15px 0;
          }
          .amount-section {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            border: 2px solid #333;
            background-color: #f9f9f9;
          }
          .amount {
            font-size: 20px;
            font-weight: bold;
            color: #2c5aa0;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: #666;
          }
          .signature-section {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            width: 200px;
            text-align: center;
            border-top: 1px solid #333;
            padding-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">CASA DE EMPEÑO</div>
          <div>Recibo de Empeño</div>
        </div>

        <div class="receipt-title">RECIBO DE EMPEÑO</div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Fecha:</span>
            <span>${formatDate(transaction.start_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Número de Transacción:</span>
            <span>${transaction.id.slice(0, 8).toUpperCase()}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span>${client?.full_name || 'N/A'}</span>
          </div>
          ${client?.phone ? `
          <div class="info-row">
            <span class="info-label">Teléfono:</span>
            <span>${client.phone}</span>
          </div>
          ` : ''}
        </div>

        <div class="transaction-details">
          <div class="info-row">
            <span class="info-label">Artículo:</span>
            <span>${transaction.product_name}</span>
          </div>
          ${transaction.product_description ? `
          <div class="info-row">
            <span class="info-label">Descripción:</span>
            <span>${transaction.product_description}</span>
          </div>
          ` : ''}
          <div class="info-row">
            <span class="info-label">Monto del Préstamo:</span>
            <span>${formatCurrency(Number(transaction.loan_amount))}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tasa de Interés:</span>
            <span>${transaction.interest_rate}% ${transaction.interest_rate_type === 'monthly' ? 'Mensual' : transaction.interest_rate_type}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Período:</span>
            <span>${transaction.period_days} días</span>
          </div>
          <div class="info-row">
            <span class="info-label">Fecha de Vencimiento:</span>
            <span>${formatDate(transaction.due_date)}</span>
          </div>
        </div>

        <div class="amount-section">
          <div class="amount">Monto Prestado: ${formatCurrency(Number(transaction.loan_amount))}</div>
        </div>

        ${transaction.notes ? `
        <div class="info-section">
          <div class="info-label">Notas:</div>
          <div>${transaction.notes}</div>
        </div>
        ` : ''}

        <div class="footer">
          <p>Este documento es un recibo de empeño. Guarde este documento para futuras referencias.</p>
          <p>Generado el ${formatDate(new Date().toISOString())}</p>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <div>Cliente</div>
          </div>
          <div class="signature-box">
            <div>Casa de Empeño</div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const printPawnReceipt = (transaction: any, client: any) => {
    const receiptHTML = generatePawnReceiptHTML(transaction, client);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Obtener datos del cliente
      const selectedClient = clients.find(c => c.id === formData.client_id);
      
      // Convertir fecha de inicio a formato con zona horaria UTC-4 (Santo Domingo)
      // Esto evita que se guarde un día antes debido a la zona horaria
      const startDateStr = formData.start_date;
      const startDateWithTimezone = `${startDateStr}T00:00:00-04:00`;
      
      // Convertir fecha de vencimiento a formato con zona horaria UTC-4
      const dueDateStr = formData.due_date;
      const dueDateWithTimezone = `${dueDateStr}T23:59:59-04:00`;

      const transactionData = {
        user_id: user.id,
        client_id: formData.client_id,
        product_name: formData.product_name,
        product_description: formData.product_description,
        item_category: categorySearch.trim() || formData.item_category.trim(),
        item_brand: brandSearch.trim() || formData.item_brand.trim(),
        item_model: modelSearch.trim() || formData.item_model.trim(),
        item_condition: formData.item_condition,
        estimated_value: formData.estimated_value,
        loan_amount: formData.loan_amount,
        interest_rate: formData.interest_rate,
        interest_rate_type: formData.interest_rate_type,
        period_days: formData.period_days,
        start_date: startDateWithTimezone,
        due_date: dueDateWithTimezone,
        notes: formData.notes,
        status: 'active'
      };

      const { data: insertedTransaction, error } = await supabase
        .from('pawn_transactions')
        .insert([transactionData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Transacción creada exitosamente');
      
      // Cerrar formulario y resetear antes de imprimir
      setShowTransactionForm(false);
      resetForm();
      
      // Generar y mostrar recibo después de cerrar el formulario
      if (insertedTransaction && selectedClient) {
        // Usar setTimeout para asegurar que el formulario se cierre primero
        setTimeout(() => {
          printPawnReceipt(insertedTransaction, selectedClient);
        }, 100);
      }
      
      fetchData();
    } catch (error) {
      console.error('Error creating transaction:', error);
      toast.error('Error al crear transacción');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;

    try {
      // Obtener la fecha actual en la zona horaria de Santo Domingo (UTC-4)
      // Usar toLocaleString para obtener la fecha/hora en Santo Domingo
      const now = new Date();
      const santoDomingoString = now.toLocaleString('en-US', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      // Parsear la fecha formateada (MM/DD/YYYY, HH:mm:ss)
      const [datePart, timePart] = santoDomingoString.split(', ');
      const [month, day, year] = datePart.split('/');
      const [hours, minutes, seconds] = timePart.split(':');
      
      // Formatear como YYYY-MM-DDTHH:mm:ss-04:00
      const paymentDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}-04:00`;
      
      const paymentBreakdown = await processPayment(selectedTransaction, paymentData.amount, paymentDate);
      
      // Construir las notas incluyendo el método de pago
      const paymentMethodLabel = {
        'cash': 'Efectivo',
        'transfer': 'Transferencia',
        'card': 'Tarjeta',
        'check': 'Cheque',
        'other': 'Otro'
      }[paymentData.payment_method] || 'N/A';
      
      const notesWithMethod = paymentData.notes 
        ? `Método: ${paymentMethodLabel}. ${paymentData.notes}`
        : `Método: ${paymentMethodLabel}`;

      const payment = {
        pawn_transaction_id: selectedTransaction.id,
        amount: paymentData.amount,
        payment_type: paymentBreakdown.remainingBalance <= 0 ? 'full' : 'partial',
        payment_date: paymentDate,
        interest_payment: paymentBreakdown.interestPayment,
        principal_payment: paymentBreakdown.principalPayment,
        remaining_balance: paymentBreakdown.remainingBalance,
        remaining_interest: paymentBreakdown.accumulatedInterest, // Interés pendiente ANTES del pago (valor histórico)
        notes: notesWithMethod
      };

      const { error: paymentError } = await supabase
        .from('pawn_payments')
        .insert([payment]);

      if (paymentError) throw paymentError;

      // NO actualizar start_date - el interés se calcula siempre desde la fecha original
      // y se resta lo que ya se ha pagado
      const updateData: any = {};
      
      // Update transaction status if full payment (balance is 0)
      if (paymentBreakdown.remainingBalance <= 0) {
        updateData.status = 'redeemed';
      }

      // Solo actualizar si hay cambios
      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('pawn_transactions')
          .update(updateData)
          .eq('id', selectedTransaction.id);

        if (updateError) throw updateError;
      }

      toast.success('Pago registrado exitosamente');
      
      // Guardar datos del pago para el diálogo de WhatsApp
      const selectedClient = clients.find(c => c.id === selectedTransaction.client_id);
      setLastPaymentData({
        payment,
        transaction: selectedTransaction,
        client: selectedClient,
        paymentDate: formatDateStringForSantoDomingo(paymentDate.split('T')[0]),
        principalPayment: paymentBreakdown.principalPayment,
        interestPayment: paymentBreakdown.interestPayment,
        remainingBalance: paymentBreakdown.remainingBalance,
        paymentMethod: paymentData.payment_method,
        referenceNumber: (paymentData as any).reference_number || undefined
      });
      
      // Mostrar diálogo de WhatsApp
      setShowWhatsAppDialog(true);
      
      // No cerrar el formulario todavía, esperar a que el usuario decida sobre WhatsApp
    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Error al procesar pago');
    }
  };

  const handleStatusChange = async (transactionId: string, newStatus: string) => {
    try {
      // Si se marca como perdido, agregar el producto al inventario
      if (newStatus === 'forfeited') {
        const transaction = transactions.find(t => t.id === transactionId);
        if (transaction && transaction.product_name) {
          // Crear un nuevo producto en el inventario
          // Generar SKU único evitando duplicados con retry
          let nextSku: string | undefined = undefined;
          let attempts = 0;
          const maxAttempts = 10;
          
          while (!nextSku && attempts < maxAttempts) {
            try {
              // Obtener todos los SKUs existentes del usuario
              const { data: existingProducts } = await supabase
                .from('products')
                .select('sku')
                .eq('user_id', user.id)
                .not('sku', 'is', null);
              
              if (existingProducts) {
                // Convertir SKUs a números y encontrar el máximo
                const skuNumbers = existingProducts
                  .map(p => {
                    if (!p.sku) return 0;
                    // Intentar parsear como número
                    const num = parseInt(p.sku);
                    return isNaN(num) ? 0 : num;
                  })
                  .filter(num => num > 0);
                
                const maxSku = skuNumbers.length > 0 ? Math.max(...skuNumbers) : 0;
                // Generar el siguiente SKU disponible (con intento para evitar concurrencia)
                const candidateSku = String(maxSku + 1 + attempts).padStart(5, '0');
                
                // Verificar que el SKU no exista
                const { data: existingSku } = await supabase
                  .from('products')
                  .select('id')
                  .eq('user_id', user.id)
                  .eq('sku', candidateSku)
                  .maybeSingle();
                
                if (!existingSku) {
                  nextSku = candidateSku;
                } else {
                  attempts++;
                }
              } else {
                // Si no hay productos, empezar con 00001
                nextSku = '00001';
              }
            } catch (error) {
              console.error('Error generating SKU:', error);
              attempts++;
              if (attempts >= maxAttempts) {
                // Fallback: usar timestamp como SKU único (últimos 8 dígitos)
                nextSku = String(Date.now()).slice(-8).padStart(5, '0');
              }
            }
          }
          
          // Si aún no hay SKU, usar un UUID corto
          if (!nextSku) {
            nextSku = `PF${Date.now().toString(36).toUpperCase().slice(-5)}`;
          }

          // Calcular precio de venta con ITBIS (18%)
          // El valor estimado será el precio de venta CON ITBIS
          const ITBIS_RATE = 0.18;
          const estimatedValue = Number(transaction.estimated_value || 0);
          // Precio de venta sin ITBIS (para guardar en BD, como en InventoryModule)
          const sellingPriceNoTax = estimatedValue / (1 + ITBIS_RATE);
          // Precio de venta con ITBIS (el valor estimado)
          const sellingPriceWithTax = estimatedValue;

          const inventoryProduct = {
            user_id: user.id,
            name: transaction.product_name,
            description: transaction.product_description || '',
            category: transaction.item_category || null,
            brand: transaction.item_brand || null,
            current_stock: 1,
            status: 'active',
            sku: nextSku,
            selling_price: sellingPriceNoTax, // Guardar sin ITBIS en BD (como en InventoryModule)
            purchase_price: 0, // No hay precio de compra para empeños perdidos
            source: 'pawn_forfeited',
            original_transaction_id: transactionId
          } as any;

          // Intentar insertar con retry en caso de SKU duplicado
          let insertSuccess = false;
          let retryCount = 0;
          const maxRetries = 3;
          
          while (!insertSuccess && retryCount < maxRetries) {
            const { error: inventoryError } = await supabase
              .from('products')
              .insert([inventoryProduct]);

            if (inventoryError) {
              // Si es error de SKU duplicado, generar uno nuevo
              if (inventoryError.code === '23505' && inventoryError.message.includes('sku')) {
                retryCount++;
                // Generar nuevo SKU único
                const timestamp = Date.now();
                inventoryProduct.sku = `PF${timestamp.toString(36).toUpperCase().slice(-5)}${retryCount}`;
                console.warn(`SKU duplicado detectado, intentando con nuevo SKU: ${inventoryProduct.sku}`);
              } else {
                console.error('Error adding to inventory:', inventoryError);
                toast.error(`Error al agregar producto al inventario: ${inventoryError.message}`);
                return;
              }
            } else {
              insertSuccess = true;
              toast.success(`Producto agregado al inventario. Precio de venta: $${sellingPriceWithTax.toLocaleString('es-DO', { minimumFractionDigits: 2 })} (con ITBIS)`);
            }
          }
          
          if (!insertSuccess) {
            toast.error('Error al agregar producto al inventario después de varios intentos');
            return;
          }
        }
      }

      const { error } = await supabase
        .from('pawn_transactions')
        .update({ status: newStatus })
        .eq('id', transactionId);

      if (error) throw error;
      toast.success('Estado actualizado exitosamente');
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Error al actualizar estado');
    }
  };

  const handleExtendDays = async (transaction: PawnTransaction, daysToAdd: number) => {
    try {
      const baseDate = transaction.due_date ? new Date(transaction.due_date) : new Date();
      const newDue = new Date(baseDate);
      newDue.setDate(baseDate.getDate() + Math.max(1, daysToAdd));
      const newDueStr = newDue.toISOString().split('T')[0];
      const newPeriod = (transaction.period_days || 0) + Math.max(1, daysToAdd);

      // Update transaction
      const { error: updateError } = await supabase
        .from('pawn_transactions')
        .update({
          due_date: newDueStr,
          period_days: newPeriod,
          // Mantener activo: solo se extiende el plazo
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', transaction.id);

      if (updateError) throw updateError;

      // Create a payment record for the extension in history
      // Try to insert the extension record, but don't fail if the constraint doesn't allow it yet
      const { error: paymentError } = await supabase
        .from('pawn_payments')
        .insert([{
          pawn_transaction_id: transaction.id,
          amount: 0, // Extensions don't have a monetary amount
          payment_date: new Date().toISOString(),
          payment_type: 'extension',
          notes: `Plazo extendido ${daysToAdd} día(s). Nueva fecha de vencimiento: ${newDueStr}`
        }]);

      // If payment insertion fails due to constraint, log it but don't fail the extension
      if (paymentError) {
        console.warn('Could not create extension history record. The migration may not have been applied yet:', paymentError);
        // Don't throw - the extension itself was successful
      }

      toast.success(`Plazo extendido ${daysToAdd} día(s). Nueva fecha: ${newDueStr}`);
      setShowExtendForm(false);
      setSelectedTransaction(null);
      fetchData();
    } catch (e) {
      console.error('Error extending term:', e);
      toast.error('Error al extender el plazo');
    }
  };

  const handleAddCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;

    try {
      if (!chargeFormData.amount || chargeFormData.amount <= 0) {
        toast.error('El monto del cargo debe ser mayor a 0');
        return;
      }

      // Obtener companyId usando get_user_company_id() o user.id
      const companyId = user?.id || '';

      // Asegurar que la fecha del cargo se guarde correctamente en zona horaria de Santo Domingo
      // Usar directamente la fecha seleccionada sin conversiones que puedan causar problemas de zona horaria
      // El input type="date" ya devuelve la fecha en formato YYYY-MM-DD según la zona horaria local del navegador
      const chargeDateString = chargeFormData.charge_date;

      // Calcular fecha de vencimiento (un día después de la fecha del cargo)
      // Parsear la fecha como fecha local para evitar problemas de zona horaria
      const [year, month, day] = chargeDateString.split('-').map(Number);
      const chargeDateLocal = new Date(year, month - 1, day); // month es 0-indexado, crear como fecha local
      const dueDate = new Date(chargeDateLocal);
      dueDate.setDate(dueDate.getDate() + 1);
      const dueDateString = `${dueDate.getFullYear()}-${String(dueDate.getMonth() + 1).padStart(2, '0')}-${String(dueDate.getDate()).padStart(2, '0')}`;

      // Registrar en historial
      const historyData = {
        pawn_transaction_id: selectedTransaction.id,
        change_type: 'add_charge',
        old_values: {
          loan_amount: selectedTransaction.loan_amount
        },
        new_values: {
          loan_amount: selectedTransaction.loan_amount + chargeFormData.amount
        },
        reason: chargeFormData.reason || '',
        amount: chargeFormData.amount,
        charge_date: chargeDateString,
        reference_number: chargeFormData.reference_number || null,
        notes: chargeFormData.notes || null,
        created_by: companyId
      };

      const { data: insertedHistory, error: historyInsertError } = await supabase
        .from('pawn_history')
        .insert([historyData])
        .select();

      if (historyInsertError) {
        console.error('❌ Error insertando en historial:', historyInsertError);
        console.error('📋 Datos que se intentaron insertar:', historyData);
        toast.error(`Error al guardar en historial: ${historyInsertError.message}`);
        return;
      }

      console.log('✅ Historial guardado exitosamente:', insertedHistory);

      // Actualizar el monto del préstamo en la transacción
      const { error: updateError } = await supabase
        .from('pawn_transactions')
        .update({
          loan_amount: selectedTransaction.loan_amount + chargeFormData.amount,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedTransaction.id);

      if (updateError) throw updateError;

      toast.success(`Cargo de $${chargeFormData.amount.toLocaleString()} agregado exitosamente`);
      
      // Disparar evento para recargar el historial si está abierto
      window.dispatchEvent(new CustomEvent('pawnHistoryRefresh', { 
        detail: { transactionId: selectedTransaction.id } 
      }));

      // Resetear formulario
      setChargeFormData({
        amount: 0,
        charge_date: getCurrentDateStringForSantoDomingo(),
        reference_number: '',
        reason: '',
        notes: ''
      });
      
      setShowAddChargeForm(false);
      setSelectedTransaction(null);
      fetchData();
      
      // Recargar historial de pagos si está abierto
      if (showPaymentHistory && selectedTransaction) {
        await fetchPaymentHistory(selectedTransaction.id);
      }
    } catch (error: any) {
      console.error('Error adding charge:', error);
      toast.error(`Error al agregar cargo: ${error.message || 'Error desconocido'}`);
    }
  };

  const getDefaultPawnPeriod = () => companySettings?.default_pawn_period_days ?? 90;

  const resetForm = () => {
    const today = new Date().toISOString().split('T')[0];
    // Usar la función helper que maneja correctamente la zona horaria de Santo Domingo
    const dueDateString = calculateDueDateInSantoDomingo(today, getDefaultPawnPeriod());
    
    setFormData({
      client_id: '',
      product_name: '',
      product_description: '',
      item_category: '',
      item_condition: 'excellent',
      item_brand: '',
      item_model: '',
      estimated_value: 0,
      loan_amount: 0,
      interest_rate: 20.0,
      interest_rate_type: 'monthly',
      period_days: getDefaultPawnPeriod(),
      start_date: today,
      due_date: dueDateString,
      notes: ''
    });
    setHasManualPawnPeriod(false);
    setClientSearch('');
    setSelectedClient(null);
    setCategorySearch('');
    setShowCategorySuggestions(false);
    setCategorySuggestions([]);
    setBrandSearch('');
    setShowBrandSuggestions(false);
    setBrandSuggestions([]);
    setModelSearch('');
    setShowModelSuggestions(false);
    setModelSuggestions([]);
    setShowClientDropdown(false);
  };

  const calculateDueDate = (startDate: string, periodDays: number) => {
    if (!startDate) return '';
    // Usar la función helper que maneja correctamente la zona horaria de Santo Domingo
    return calculateDueDateInSantoDomingo(startDate, periodDays);
  };

  const calculateDaysDifference = (startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 0;
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
      const diffTime = end.getTime() - start.getTime();
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return days > 0 ? days : 0;
    } catch (error) {
      console.error('Error calculando diferencia de días:', error);
      return 0;
    }
  };

  const handlePeriodChange = (periodDays: number) => {
    setHasManualPawnPeriod(true);
    const newDueDate = calculateDueDate(formData.start_date, periodDays);
    setFormData(prev => ({
      ...prev,
      period_days: periodDays,
      due_date: newDueDate
    }));
  };

  useEffect(() => {
    if (!companySettings || hasManualPawnPeriod) return;
    setFormData(prev => {
      const period = companySettings.default_pawn_period_days ?? prev.period_days;
      return {
        ...prev,
        period_days: period,
        due_date: calculateDueDate(prev.start_date, period)
      };
    });
  }, [companySettings?.default_pawn_period_days, hasManualPawnPeriod]);

  const handleStartDateChange = (startDate: string) => {
    const newDueDate = calculateDueDate(startDate, formData.period_days);
    setFormData({
      ...formData,
      start_date: startDate,
      due_date: newDueDate
    });
  };

  const handleDueDateChange = (dueDate: string) => {
    const daysDiff = calculateDaysDifference(formData.start_date, dueDate);
    setFormData({
      ...formData,
      due_date: dueDate,
      period_days: daysDiff
    });
  };

  // Previsualización desde una transacción existente (Detalles)
  const previewInterestFromTransaction = async (transaction: PawnTransaction) => {
    if (!transaction) {
      toast.error('No hay transacción seleccionada');
      return;
    }
    
    const initialPrincipal = Number(transaction.loan_amount || 0);
    const monthlyRate = Number(transaction.interest_rate || 0);
    const startDate = transaction.start_date;
    const dueDate = transaction.due_date;
    
    // Validaciones más específicas
    if (!startDate) {
      toast.error('La transacción no tiene fecha de inicio');
      return;
    }
    if (!dueDate) {
      toast.error('La transacción no tiene fecha de vencimiento');
      return;
    }
    if (initialPrincipal <= 0) {
      toast.error('El monto del préstamo debe ser mayor a 0');
      return;
    }
    if (monthlyRate <= 0) {
      toast.error('La tasa de interés debe ser mayor a 0');
      return;
    }
    
    try {
      // Obtener el capital pendiente actual
      const currentPrincipal = await getCurrentRemainingPrincipal(transaction.id, initialPrincipal);
      
      // Obtener la fecha de inicio correcta (última fecha de pago de capital o fecha de inicio)
      let effectiveStartDate = await getLastPaymentDate(transaction.id, startDate);
      
      // Extraer solo la parte de fecha (YYYY-MM-DD) si viene como timestamp
      // Esto asegura que no haya problemas con la zona horaria
      // IMPORTANTE: Extraer la fecha ANTES de cualquier conversión para mantener la fecha original
      let dateOnly: string;
      if (effectiveStartDate.includes('T')) {
        // Si tiene 'T', extraer solo la parte antes de 'T'
        dateOnly = effectiveStartDate.split('T')[0];
      } else if (effectiveStartDate.includes(' ')) {
        // Si tiene espacio, extraer solo la parte antes del espacio
        dateOnly = effectiveStartDate.split(' ')[0];
      } else {
        // Ya es solo fecha
        dateOnly = effectiveStartDate;
      }
      
      // Validar formato YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
        console.error('Formato de fecha inválido después de extracción:', dateOnly, 'Original:', effectiveStartDate);
        toast.error('Error: Formato de fecha inválido');
        return;
      }
      
      effectiveStartDate = dateOnly;
      
      // Debug: verificar que la fecha extraída sea correcta
      const beforeExtraction = await getLastPaymentDate(transaction.id, startDate);
      console.log('🔍 Fecha de inicio extraída para previsualización:', effectiveStartDate, 'Original startDate:', startDate, 'effectiveStartDate antes de extraer:', beforeExtraction);
      
      // También normalizar la fecha de vencimiento
      let normalizedDueDate = dueDate;
      if (normalizedDueDate.includes('T') || normalizedDueDate.includes(' ')) {
        normalizedDueDate = normalizedDueDate.split('T')[0].split(' ')[0];
      }
      
      // Calcular días desde la fecha efectiva hasta la fecha de vencimiento
      const days = calculateDaysDifference(effectiveStartDate, normalizedDueDate);
      
      if (days <= 0) {
        toast.error('La fecha de vencimiento debe ser posterior a la fecha de inicio efectiva');
        return;
      }
      
      // Usar el capital pendiente actual para la previsualización
      const preview = generateInterestPreview(currentPrincipal, monthlyRate, days, effectiveStartDate);
      setInterestPreviewData(preview);
      setShowInterestPreview(true);
    } catch (error) {
      console.error('Error generando previsualización:', error);
      toast.error('Error al generar la previsualización de interés');
    }
  };

  // Función para calcular interés diario
  const calculateDailyInterest = (principal: number, monthlyRate: number, days: number) => {
    const dailyRate = monthlyRate / 30; // Convertir tasa mensual a diaria
    return principal * (dailyRate / 100) * days;
  };

  // Función para calcular el interés acumulado hasta una fecha específica
  // Resta los pagos de interés ya realizados
  const calculateAccumulatedInterest = async (transaction: PawnTransaction, currentDate: string, interestPayments?: number) => {
    const startDate = new Date(transaction.start_date);
    const endDate = new Date(currentDate);
    // Asegurar que la fecha de inicio sea la base del cálculo
    const daysDiff = Math.max(0, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    
    // Calcular interés total desde la fecha original
    const totalInterest = calculateDailyInterest(
      Number(transaction.loan_amount), 
      Number(transaction.interest_rate), 
      daysDiff
    );
    
    // Si no se proporciona el total de pagos de interés, obtenerlo de la base de datos
    let totalInterestPaid = interestPayments;
    if (totalInterestPaid === undefined) {
      try {
        const { data: payments } = await supabase
          .from('pawn_payments')
          .select('interest_payment')
          .eq('pawn_transaction_id', transaction.id)
          .not('interest_payment', 'is', null);
        
        totalInterestPaid = payments?.reduce((sum, p) => sum + Number(p.interest_payment || 0), 0) || 0;
      } catch (error) {
        console.error('Error obteniendo pagos de interés:', error);
        totalInterestPaid = 0;
      }
    }
    
    // Restar los pagos de interés ya realizados
    return Math.max(0, totalInterest - totalInterestPaid);
  };

  // Función auxiliar para calcular interés acumulado desde datos del formulario
  const calculateAccumulatedInterestFromForm = (loanAmount: number, interestRate: number, startDate: string, endDate: string) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    
    return calculateDailyInterest(loanAmount, interestRate, daysDiff);
  };

  // Función para generar previsualización de interés diario
  const generateInterestPreview = (principal: number, monthlyRate: number, days: number, startDate: string) => {
    // Validar parámetros
    if (!principal || principal <= 0) {
      throw new Error('El capital debe ser mayor a 0');
    }
    if (!monthlyRate || monthlyRate <= 0) {
      throw new Error('La tasa de interés debe ser mayor a 0');
    }
    if (!days || days <= 0) {
      throw new Error('El número de días debe ser mayor a 0');
    }
    if (!startDate) {
      throw new Error('La fecha de inicio es requerida');
    }
    
    // Normalizar la fecha: extraer solo la parte de fecha (YYYY-MM-DD) si viene como timestamp
    let effectiveStartDate: string;
    try {
      // Si la fecha viene como timestamp completo, extraer solo la fecha
      if (startDate.includes('T') || startDate.includes(' ')) {
        // Es un timestamp, extraer solo la parte de fecha
        const datePart = startDate.split('T')[0].split(' ')[0];
        effectiveStartDate = datePart;
      } else {
        // Ya es solo fecha
        effectiveStartDate = startDate;
      }
      
      // Validar que tenga el formato correcto (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(effectiveStartDate)) {
        throw new Error('Formato de fecha inválido');
      }
    } catch (error) {
      console.error('Error procesando fecha:', error, 'Fecha recibida:', startDate);
      throw new Error('La fecha de inicio no tiene un formato válido');
    }
    
    const dailyRate = monthlyRate / 30;
    const dailyBreakdown = [];
    let accumulatedInterest = 0;
    
    // Usar la fecha de inicio proporcionada como base del cálculo
    // Trabajar directamente con fechas en formato YYYY-MM-DD para evitar problemas de zona horaria
    // Parsear la fecha manualmente
    let year: number, month: number, day: number;
    try {
      const dateParts = effectiveStartDate.split('-').map(Number);
      if (dateParts.length !== 3) {
        throw new Error('Formato de fecha inválido');
      }
      [year, month, day] = dateParts;
      
      // Validar que los valores sean válidos
      if (isNaN(year) || isNaN(month) || isNaN(day)) {
        throw new Error('Valores de fecha inválidos');
      }
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new Error('Valores de fecha fuera de rango');
      }
    } catch (error) {
      console.error('Error parseando fecha:', error, 'Fecha procesada:', effectiveStartDate);
      throw new Error(`La fecha de inicio no es válida: ${effectiveStartDate}`);
    }
    
    // Función auxiliar para sumar días a una fecha trabajando directamente con strings
    // Esto evita completamente problemas de zona horaria
    const addDaysToString = (dateStr: string, daysToAdd: number): string => {
      if (daysToAdd === 0) {
        // Si no hay días que sumar, devolver la fecha original directamente
        return dateStr;
      }
      
      // Parsear la fecha
      const [y, m, d] = dateStr.split('-').map(Number);
      
      // Crear un objeto Date en UTC para sumar días
      // Usar UTC para evitar desplazamientos por zona horaria
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() + daysToAdd);
      
      // Formatear de vuelta a YYYY-MM-DD usando UTC
      const newYear = date.getUTCFullYear();
      const newMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
      const newDay = String(date.getUTCDate()).padStart(2, '0');
      return `${newYear}-${newMonth}-${newDay}`;
    };
    
    // Crear la fecha de inicio como string en formato YYYY-MM-DD
    // IMPORTANTE: Usar directamente la fecha extraída sin modificarla
    const startDateStr = effectiveStartDate; // Ya está en formato YYYY-MM-DD
    
    console.log('🔍 Fecha de inicio para cálculo:', startDateStr, 'Año:', year, 'Mes:', month, 'Día:', day, 'effectiveStartDate recibido:', effectiveStartDate);
    
    // Validar que startDateStr coincida con los valores parseados
    const [expectedYear, expectedMonth, expectedDay] = startDateStr.split('-').map(Number);
    if (expectedYear !== year || expectedMonth !== month || expectedDay !== day) {
      console.warn('⚠️ Discrepancia en fecha parseada:', { expectedYear, expectedMonth, expectedDay, year, month, day });
      // Usar los valores de la fecha string en lugar de los parseados
      const correctedDateStr = `${expectedYear}-${String(expectedMonth).padStart(2, '0')}-${String(expectedDay).padStart(2, '0')}`;
      console.log('🔍 Usando fecha corregida:', correctedDateStr);
      
      for (let dayIndex = 1; dayIndex <= days; dayIndex++) {
        // Calcular la fecha para este día
        // Día 1 = fecha de inicio + 1 día (el interés comienza al día siguiente)
        // Día 2 = fecha de inicio + 2 días
        // Día 3 = fecha de inicio + 3 días, etc.
        const currentDateStr = addDaysToString(correctedDateStr, dayIndex);
        console.log(`🔍 Día ${dayIndex}: fecha calculada = ${currentDateStr}, correctedDateStr = ${correctedDateStr}`);
        
        const dailyInterest = principal * (dailyRate / 100);
        accumulatedInterest += dailyInterest;
        const totalAmount = principal + accumulatedInterest;
        
        dailyBreakdown.push({
          day: dayIndex,
          date: currentDateStr,
          dailyInterest,
          accumulatedInterest,
          totalAmount
        });
      }
    } else {
      for (let dayIndex = 1; dayIndex <= days; dayIndex++) {
        // Calcular la fecha para este día
        // Día 1 = fecha de inicio + 1 día (el interés comienza al día siguiente)
        // Día 2 = fecha de inicio + 2 días
        // Día 3 = fecha de inicio + 3 días, etc.
        const currentDateStr = addDaysToString(startDateStr, dayIndex);
        
        console.log(`🔍 Día ${dayIndex}: fecha calculada = ${currentDateStr}, startDateStr = ${startDateStr}`);
        
        const dailyInterest = principal * (dailyRate / 100);
        accumulatedInterest += dailyInterest;
        const totalAmount = principal + accumulatedInterest;
        
        dailyBreakdown.push({
          day: dayIndex,
          date: currentDateStr,
          dailyInterest,
          accumulatedInterest,
          totalAmount
        });
      }
    }
    
    return {
      principal,
      rate: monthlyRate,
      days,
      startDate: effectiveStartDate, // Guardar la fecha de inicio usada
      dailyBreakdown
    };
  };

  const handleShowInterestPreview = () => {
    if (formData.loan_amount > 0 && formData.interest_rate > 0 && formData.period_days > 0 && formData.start_date) {
      try {
        const preview = generateInterestPreview(
          formData.loan_amount,
          formData.interest_rate,
          formData.period_days,
          formData.start_date
        );
        setInterestPreviewData(preview);
        setShowInterestPreview(true);
      } catch (error: any) {
        console.error('Error generando previsualización:', error);
        toast.error(error?.message || 'Error al generar la previsualización de interés');
      }
    } else {
      toast.error('Por favor completa todos los campos requeridos para ver la previsualización');
    }
  };

  // Función para obtener el capital pendiente actual de una transacción
  const getCurrentRemainingPrincipal = async (transactionId: string, initialLoanAmount: number): Promise<number> => {
    try {
      const { data: payments } = await supabase
        .from('pawn_payments')
        .select('principal_payment')
        .eq('pawn_transaction_id', transactionId)
        .not('principal_payment', 'is', null);
      
      if (!payments) return initialLoanAmount;
      
      const totalPrincipalPaid = payments.reduce((sum, p) => sum + Number(p.principal_payment || 0), 0);
      return Math.max(0, initialLoanAmount - totalPrincipalPaid);
    } catch (error) {
      console.error('Error calculating remaining principal:', error);
      return initialLoanAmount;
    }
  };

  // Función para obtener la última fecha de pago de capital o la fecha de inicio
  const getLastPaymentDate = async (transactionId: string, startDate: string): Promise<string> => {
    try {
      const { data: lastPayment } = await supabase
        .from('pawn_payments')
        .select('payment_date, principal_payment')
        .eq('pawn_transaction_id', transactionId)
        .not('principal_payment', 'is', null)
        .gt('principal_payment', 0)
        .order('payment_date', { ascending: false })
        .limit(1)
        .single();
      
      // Si hay un pago de capital, usar esa fecha; si no, usar la fecha de inicio
      return lastPayment?.payment_date || startDate;
    } catch (error) {
      return startDate;
    }
  };

  // Función para calcular interés acumulado desde una fecha base hasta otra fecha
  const calculateInterestFromDate = (
    principal: number, 
    monthlyRate: number, 
    startDate: string, 
    endDate: string
  ): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    return calculateDailyInterest(principal, monthlyRate, daysDiff);
  };

  // Función para procesar pagos con lógica de interés primero, luego capital
  const processPayment = async (
    transaction: PawnTransaction, 
    paymentAmount: number, 
    paymentDate: string
  ) => {
    // Obtener el capital pendiente actual
    const currentPrincipal = await getCurrentRemainingPrincipal(
      transaction.id, 
      Number(transaction.loan_amount)
    );
    
    // Obtener total de pagos de interés para optimizar el cálculo
    let totalInterestPaid = 0;
    try {
      const { data: payments } = await supabase
        .from('pawn_payments')
        .select('interest_payment')
        .eq('pawn_transaction_id', transaction.id)
        .not('interest_payment', 'is', null);
      
      totalInterestPaid = payments?.reduce((sum, p) => sum + Number(p.interest_payment || 0), 0) || 0;
    } catch (error) {
      console.error('Error obteniendo pagos de interés:', error);
    }
    
    // Usar la misma función que las estadísticas: calcular desde start_date hasta la fecha del pago
    // Extraer solo la fecha (sin hora) para el cálculo
    const paymentDateOnly = paymentDate.split('T')[0];
    const accumulatedInterest = await calculateAccumulatedInterest(transaction, paymentDateOnly, totalInterestPaid);
    
    // Primero pagar interés, luego el resto va al capital
    const interestPayment = Math.min(paymentAmount, accumulatedInterest);
    const principalPayment = Math.max(0, paymentAmount - interestPayment);
    const newRemainingBalance = Math.max(0, currentPrincipal - principalPayment);
    
    return {
      interestPayment,
      principalPayment,
      remainingBalance: newRemainingBalance,
      currentPrincipal,
      accumulatedInterest
    };
  };

  const resetPaymentForm = () => {
    setPaymentData({
      amount: 0,
      payment_method: 'cash',
      notes: ''
    });
  };

  const resetRateUpdateForm = () => {
    setRateUpdateData({
      new_rate: 0,
      reason: '',
      effective_date: ''
    });
  };

  // Función para eliminar transacción
  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      const { error } = await supabase
        .from('pawn_transactions')
        .update({ 
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          deleted_reason: deleteReason.trim() || null
        } as any)
        .eq('id', transactionId);

      if (error) throw error;

      toast.success('Transacción eliminada exitosamente (recuperable)');
      setShowTransactionDetails(false);
      setShowDeleteDialog(false);
      setDeleteReason('');
      setSelectedTransaction(null);
      fetchData();
    } catch (error) {
      console.error('Error deleting transaction:', error);
      toast.error('Error al eliminar transacción');
    }
  };

  // Función para recuperar transacción
  const handleRecoverTransaction = async (transactionId: string) => {
    try {
      // Save current selected transaction state before recovery
      const wasDetailsOpen = showTransactionDetails && selectedTransaction?.id === transactionId;
      
      const { error } = await supabase
        .from('pawn_transactions')
        .update({ 
          status: 'active',
          deleted_at: null,
          deleted_reason: null
        } as any)
        .eq('id', transactionId);

      if (error) throw error;

      // Refresh data to ensure we have the latest transaction data
      await fetchData();
      
      // If details dialog was open, refresh the selected transaction with fresh data
      if (wasDetailsOpen) {
        const { data: refreshedTransaction, error: refreshError } = await supabase
          .from('pawn_transactions')
          .select(`
            *,
            clients(id, full_name, phone),
            products!pawn_transactions_product_id_fkey(id, name)
          `)
          .eq('id', transactionId)
          .single();
        
        if (!refreshError && refreshedTransaction) {
          setSelectedTransaction(refreshedTransaction as PawnTransaction);
          // Refresh payment history as well
          fetchPaymentHistory(transactionId);
        } else {
          // If refresh failed, close dialog
          setShowTransactionDetails(false);
          setSelectedTransaction(null);
        }
      } else {
        setShowTransactionDetails(false);
        setSelectedTransaction(null);
      }

      toast.success('Transacción recuperada exitosamente');
    } catch (error) {
      console.error('Error recovering transaction:', error);
      toast.error('Error al recuperar transacción');
      setShowTransactionDetails(false);
      setSelectedTransaction(null);
    }
  };

  // Función para recuperar transacción perdida (forfeited)
  const handleRecoverForfeitedTransaction = async (transactionId: string) => {
    try {
      // Save current selected transaction state before recovery
      const wasDetailsOpen = showTransactionDetails && selectedTransaction?.id === transactionId;
      
      // Buscar el producto del inventario si existe (creado cuando se marcó como perdido)
      const { data: inventoryProducts } = await supabase
        .from('products')
        .select('id')
        .eq('user_id', user.id)
        .eq('original_transaction_id', transactionId)
        .eq('source', 'pawn_forfeited');

      if (inventoryProducts && inventoryProducts.length > 0) {
        // Verificar si alguno de estos productos fue vendido
        for (const product of inventoryProducts) {
          // Verificar en sale_details (esquema nuevo)
          const { data: saleDetails } = await supabase
            .from('sale_details')
            .select('id, sale_id')
            .eq('product_id', product.id)
            .limit(1);
          
          // Si no se encuentra en sale_details, verificar en sales (esquema simple)
          if (!saleDetails || saleDetails.length === 0) {
            const { data: sales } = await supabase
              .from('sales')
              .select('id')
              .eq('product_id', product.id)
              .limit(1);
            
            if (sales && sales.length > 0) {
              toast.error('No se puede recuperar la transacción porque el producto ya fue vendido');
              return;
            }
          } else {
            toast.error('No se puede recuperar la transacción porque el producto ya fue vendido');
            return;
          }
        }
        
        // Si no fue vendido, eliminar productos del inventario relacionados con esta transacción
        for (const product of inventoryProducts) {
          const { error: deleteError } = await supabase
            .from('products')
            .delete()
            .eq('id', product.id);
          
          if (deleteError) {
            console.warn('Error deleting inventory product:', deleteError);
          }
        }
      }

      // Cambiar el estado de la transacción de 'forfeited' a 'active'
      const { error } = await supabase
        .from('pawn_transactions')
        .update({ 
          status: 'active'
        } as any)
        .eq('id', transactionId);

      if (error) throw error;

      // Refresh data to ensure we have the latest transaction data
      await fetchData();
      
      // If details dialog was open, refresh the selected transaction with fresh data
      if (wasDetailsOpen) {
        const { data: refreshedTransaction, error: refreshError } = await supabase
          .from('pawn_transactions')
          .select(`
            *,
            clients(id, full_name, phone),
            products!pawn_transactions_product_id_fkey(id, name)
          `)
          .eq('id', transactionId)
          .single();
        
        if (!refreshError && refreshedTransaction) {
          setSelectedTransaction(refreshedTransaction as PawnTransaction);
          // Refresh payment history as well
          fetchPaymentHistory(transactionId);
        } else {
          // If refresh failed, close dialog
          setShowTransactionDetails(false);
          setSelectedTransaction(null);
        }
      } else {
        setShowTransactionDetails(false);
        setSelectedTransaction(null);
      }

      toast.success('Transacción recuperada exitosamente. El producto ha sido removido del inventario.');
    } catch (error) {
      console.error('Error recovering forfeited transaction:', error);
      toast.error('Error al recuperar transacción');
      setShowTransactionDetails(false);
      setSelectedTransaction(null);
    }
  };

  const handleRateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransaction) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const effectiveDate = rateUpdateData.effective_date;
      
      // Si la fecha efectiva es hoy o en el pasado, aplicar el cambio inmediatamente
      // Si es en el futuro, solo guardar en historial (se aplicará cuando llegue la fecha)
      const shouldApplyNow = effectiveDate <= today;

      if (shouldApplyNow) {
        // Aplicar el cambio inmediatamente
        const { error } = await supabase
          .from('pawn_transactions')
          .update({ 
            interest_rate: rateUpdateData.new_rate,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedTransaction.id);

        if (error) throw error;
        toast.success('Tasa de interés actualizada exitosamente');
      } else {
        // Si la fecha efectiva es futura, solo guardar en historial
        // El cambio se aplicará cuando llegue la fecha (requiere un job/cron o procesamiento manual)
        toast.success(`Cambio de tasa programado para ${effectiveDate}. Se aplicará automáticamente en esa fecha.`);
      }

      // Registrar el cambio de tasa en el historial (siempre)
      const rateChangeRecord = {
        pawn_transaction_id: selectedTransaction.id,
        old_rate: selectedTransaction.interest_rate,
        new_rate: rateUpdateData.new_rate,
        reason: rateUpdateData.reason,
        effective_date: rateUpdateData.effective_date,
        changed_at: new Date().toISOString(),
        user_id: user?.id
      };

      const { error: historyError } = await supabase
        .from('pawn_rate_changes')
        .insert([rateChangeRecord]);

      if (historyError) {
        console.warn('Error saving rate change history:', historyError);
        // Si falla el historial pero ya se aplicó el cambio, no es crítico
        if (!shouldApplyNow) {
          throw historyError; // Si es futuro, el historial es crítico
        }
      }

      setShowRateUpdateForm(false);
      setSelectedTransaction(null);
      resetRateUpdateForm();
      fetchData();
    } catch (error) {
      console.error('Error updating rate:', error);
      toast.error('Error al actualizar tasa de interés');
    }
  };


  const [pawnHistory, setPawnHistory] = useState<any[]>([]);

  const fetchPaymentHistory = async (transactionId: string) => {
    try {
      setPaymentHistory([]);
      setPawnHistory([]);
      
      const [paymentsRes, historyRes] = await Promise.all([
        supabase
          .from('pawn_payments')
          .select('*')
          .eq('pawn_transaction_id', transactionId)
          .order('payment_date', { ascending: false }),
        supabase
          .from('pawn_history')
          .select('*')
          .eq('pawn_transaction_id', transactionId)
          .in('change_type', ['add_charge'])
          .order('created_at', { ascending: false })
      ]);

      if (paymentsRes.error) throw paymentsRes.error;
      if (historyRes.error) {
        console.warn('Error fetching pawn history (puede que la tabla no exista aún):', historyRes.error);
      }
      
      setPaymentHistory(paymentsRes.data || []);
      setPawnHistory(historyRes.data || []);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      toast.error('Error al cargar historial de pagos');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const computeDetailsSummary = async () => {
      if (!selectedTransaction || !showTransactionDetails) {
        return;
      }

      setDetailsSummary({
        capitalPending: 0,
        interestAccrued: 0,
        totalPaid: 0,
        totalPrincipalPaid: 0,
        totalInterestPaid: 0,
        loading: true
      });

      try {
        // Calcular totales de pagos primero (síncrono, rápido)
        const paymentTotals = paymentHistory.reduce(
          (acc, payment) => {
            const interest = Number(payment.interest_payment || 0);
            const principal = Number(payment.principal_payment || 0);
            const amount = Number(payment.amount || 0);

            return {
              totalPaid: acc.totalPaid + amount,
              totalPrincipalPaid: acc.totalPrincipalPaid + principal,
              totalInterestPaid: acc.totalInterestPaid + interest
            };
          },
          { totalPaid: 0, totalPrincipalPaid: 0, totalInterestPaid: 0 }
        );

        // Calcular capital pendiente e interés en paralelo
        const [capitalPending, interestAccrued] = await Promise.all([
          getCurrentRemainingPrincipal(
            selectedTransaction.id,
            Number(selectedTransaction.loan_amount)
          ),
          (async () => {
            const today = new Date().toISOString().split('T')[0];
            return await calculateAccumulatedInterest(selectedTransaction, today, paymentTotals.totalInterestPaid);
          })()
        ]);

        if (isMounted) {
          setDetailsSummary({
            capitalPending,
            interestAccrued,
            totalPaid: paymentTotals.totalPaid,
            totalPrincipalPaid: paymentTotals.totalPrincipalPaid,
            totalInterestPaid: paymentTotals.totalInterestPaid,
            loading: false
          });
        }
      } catch (error) {
        console.error('Error calculating details summary:', error);
        if (isMounted) {
          setDetailsSummary(prev => ({
            ...prev,
            loading: false
          }));
        }
      }
    };

    // Solo calcular si tenemos la transacción seleccionada y el diálogo está abierto
    if (selectedTransaction && showTransactionDetails) {
      computeDetailsSummary();
    }

    return () => {
      isMounted = false;
    };
  }, [selectedTransaction?.id, showTransactionDetails, paymentHistory.length]);

  const generateReceiptHTML = async (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: 'DOP'
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const getPaymentTypeLabel = (type: string) => {
      const types = {
        partial: 'Pago Parcial',
        full: 'Pago Completo (Redención)',
        interest: 'Solo Interés'
      };
      return types[type as keyof typeof types] || type;
    };

    // Usar los valores históricos guardados en el pago (al momento del recibo)
    // Si no están disponibles, calcularlos como fallback
    let remainingBalance = 0;
    let remainingInterest = 0;
    let totalPending = 0;
    
    try {
      // Usar el capital pendiente guardado en el pago (después del pago)
      if (payment.remaining_balance !== null && payment.remaining_balance !== undefined) {
        remainingBalance = Number(payment.remaining_balance);
      } else {
        // Fallback: calcular dinámicamente si no está guardado
        remainingBalance = await getCurrentRemainingPrincipal(transaction.id, Number(transaction.loan_amount));
      }
      
      // Usar el interés pendiente guardado en el pago (antes del pago) y restar lo pagado
      if (payment.remaining_interest !== null && payment.remaining_interest !== undefined) {
        // El interés pendiente DESPUÉS del pago = interés pendiente ANTES - lo pagado
        const interestPaid = Number(payment.interest_payment || 0);
        remainingInterest = Math.max(0, Number(payment.remaining_interest) - interestPaid);
      } else {
        // Fallback: calcular dinámicamente si no está guardado
        const effectiveStartDate = await getLastPaymentDate(transaction.id, transaction.start_date);
        const today = new Date().toISOString().split('T')[0];
        const daysSinceLastPayment = calculateDaysDifference(effectiveStartDate, today);
        const dailyRate = Number(transaction.interest_rate) / 30;
        const accumulatedInterest = remainingBalance * (dailyRate / 100) * daysSinceLastPayment;
        
        const { data: allPayments } = await supabase
          .from('pawn_payments')
          .select('interest_payment, payment_date')
          .eq('pawn_transaction_id', transaction.id)
          .not('interest_payment', 'is', null)
          .gte('payment_date', effectiveStartDate);
        
        const totalInterestPaid = allPayments?.reduce((sum, p) => sum + Number(p.interest_payment || 0), 0) || 0;
        remainingInterest = Math.max(0, accumulatedInterest - totalInterestPaid);
      }
      
      // El monto total pendiente es capital pendiente + interés pendiente
      totalPending = remainingBalance + remainingInterest;
    } catch (error) {
      console.error('Error calculando monto pendiente:', error);
      // Si hay error, intentar usar valores guardados directamente
      remainingBalance = Number(payment.remaining_balance || 0);
      remainingInterest = Number(payment.remaining_interest || 0) - Number(payment.interest_payment || 0);
      totalPending = remainingBalance + remainingInterest;
    }

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Pago - Casa de Empeño</title>
        <style>
          @page {
            size: ${format};
            margin: 0.5in;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.4;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #333;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .company-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .receipt-title {
            font-size: 16px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
            text-decoration: underline;
          }
          .info-section {
            margin-bottom: 15px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
          }
          .info-label {
            font-weight: bold;
          }
          .payment-details {
            border: 1px solid #333;
            padding: 10px;
            margin: 15px 0;
          }
          .amount-section {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            border: 2px solid #333;
            background-color: #f9f9f9;
          }
          .amount {
            font-size: 20px;
            font-weight: bold;
            color: #2c5aa0;
          }
          .footer {
            margin-top: 30px;
            text-align: center;
            font-size: 10px;
            color: #666;
          }
          .signature-section {
            margin-top: 40px;
            display: flex;
            justify-content: space-between;
          }
          .signature-box {
            width: 200px;
            text-align: center;
            border-top: 1px solid #333;
            padding-top: 5px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">CASA DE EMPEÑO</div>
          <div>Recibo de Pago</div>
        </div>

        <div class="receipt-title">RECIBO DE PAGO</div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Fecha:</span>
            <span>${formatDate(payment.payment_date)}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span>${transaction.clients?.full_name || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Artículo:</span>
            <span>${transaction.product_name}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tipo de Pago:</span>
            <span>${getPaymentTypeLabel(payment.payment_type)}</span>
          </div>
        </div>

        <div class="payment-details">
          <div class="info-row">
            <span class="info-label">Monto del Préstamo:</span>
            <span>${formatCurrency(Number(transaction.loan_amount))}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Tasa de Interés:</span>
            <span>${transaction.interest_rate}%</span>
          </div>
          <div class="info-row">
            <span class="info-label">Fecha de Vencimiento:</span>
            <span>${formatDate(transaction.due_date)}</span>
          </div>
        </div>

        <div class="amount-section">
          <div>MONTO DEL PAGO</div>
          <div class="amount">${formatCurrency(payment.amount)}</div>
          <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
            <div class="info-row" style="justify-content: space-between; margin-bottom: 8px;">
              <span class="info-label">Abono al Capital:</span>
              <span>${formatCurrency(Number(payment.principal_payment || 0))}</span>
            </div>
            <div class="info-row" style="justify-content: space-between; margin-bottom: 15px;">
              <span class="info-label">Abono al Interés:</span>
              <span>${formatCurrency(Number(payment.interest_payment || 0))}</span>
            </div>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
              <div class="info-row" style="justify-content: space-between; margin-bottom: 8px;">
                <span class="info-label">Capital Pendiente:</span>
                <span>${formatCurrency(remainingBalance)}</span>
              </div>
              <div class="info-row" style="justify-content: space-between; margin-bottom: 8px;">
                <span class="info-label">Interés Pendiente:</span>
                <span>${formatCurrency(remainingInterest)}</span>
              </div>
              <div class="info-row" style="justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #999;">
                <span class="info-label" style="font-size: 14px; font-weight: bold;">Monto Total Pendiente:</span>
                <span style="font-size: 16px; font-weight: bold; color: #d32f2f;">${formatCurrency(totalPending)}</span>
              </div>
            </div>
          </div>
        </div>

        ${payment.notes ? `
        <div class="info-section">
          <div class="info-label">Notas:</div>
          <div>${payment.notes}</div>
        </div>
        ` : ''}

        <div class="signature-section">
          <div class="signature-box">
            <div>Firma del Cliente</div>
          </div>
          <div class="signature-box">
            <div>Firma del Empleado</div>
          </div>
        </div>

        <div class="footer">
          <div>Este recibo es válido como comprobante de pago</div>
          <div>Impreso el ${new Date().toLocaleDateString('es-DO')} a las ${new Date().toLocaleTimeString('es-DO')}</div>
        </div>
      </body>
      </html>
    `;
  };

  const printReceipt = async (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = await generateReceiptHTML(payment, transaction, format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = async (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
    const receiptHTML = await generateReceiptHTML(payment, transaction, format);
    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_empeno_${transaction.clients?.full_name?.replace(/\s+/g, '_') || 'cliente'}_${new Date(payment.payment_date).toISOString().split('T')[0]}_${format}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleViewReceipt = (payment: PawnPayment) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };


  const filteredTransactions = transactions.filter(transaction => {
    const matchesSearch = 
      transaction.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      transaction.clients?.full_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeTransactions = transactions.filter(t => t.status === 'active');
  const totalLoanAmount = activeTransactions.reduce((sum, t) => sum + Number(t.loan_amount), 0);
  const totalEstimatedValue = activeTransactions.reduce((sum, t) => sum + Number(t.estimated_value), 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-blue-500"><Clock className="h-3 w-3 mr-1" /> Activo</Badge>;
      case 'redeemed':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" /> Redimido</Badge>;
      case 'forfeited':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Perdido</Badge>;
      case 'deleted':
        return <Badge variant="secondary" className="bg-gray-500"><XCircle className="h-3 w-3 mr-1" /> Eliminado</Badge>;
      // 'extended' ya no se usa - las extensiones mantienen el estado 'active'
      // case 'extended': ya no necesario
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Casa de Empeño</h1>
        <div className="flex gap-2 flex-wrap w-full sm:w-auto">
          <Button onClick={() => setShowTransactionForm(true)} className="w-full sm:w-auto text-sm sm:text-base h-9 sm:h-10">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Transacción
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transacciones Activas</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeTransactions.length}</div>
            <p className="text-xs text-muted-foreground">En proceso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Prestado</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalLoanAmount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Monto activo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Estimado</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">${totalEstimatedValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">En garantía</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transacciones</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transactions.length}</div>
            <p className="text-xs text-muted-foreground">Historial completo</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="activas">
        <TabsList>
          <TabsTrigger value="activas">Activas</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="activas" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Buscar por cliente o artículo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="redeemed">Redimido</SelectItem>
                    <SelectItem value="forfeited">Perdido</SelectItem>
                    <SelectItem value="deleted">Eliminado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Transactions List */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Transacciones ({filteredTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando transacciones...</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transacciones {statusFilter === 'all' ? 'disponibles' : statusFilter === 'deleted' ? 'eliminadas' : 'activas'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-3 sm:p-4">
                      <div className="flex flex-col sm:flex-row items-start justify-between gap-3 mb-3">
                        <div className="flex-1 w-full">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2">
                            <h3 className="font-semibold text-base sm:text-lg">{transaction.product_name}</h3>
                            {getStatusBadge(transaction.status)}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate"><strong>Cliente:</strong> {transaction.clients?.full_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span><strong>Préstamo:</strong> ${Number(transaction.loan_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Package className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span><strong>Valor Estimado:</strong> ${Number(transaction.estimated_value).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                              <span className="truncate"><strong>Vencimiento:</strong> {formatDateTimeWithOffset(transaction.due_date)}</span>
                            </div>
                            <div>
                              <span><strong>Interés:</strong> {transaction.interest_rate}%</span>
                            </div>
                            <div>
                              <span className="truncate"><strong>Inicio:</strong> {formatDateTimeWithOffset(transaction.start_date)}</span>
                            </div>
                          </div>
                          {transaction.product_description && (
                            <p className="text-sm text-gray-500 mt-2">{transaction.product_description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                        {transaction.status === 'deleted' ? (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={async () => {
                              await handleRecoverTransaction(transaction.id);
                            }}
                            className="w-full sm:w-auto text-xs sm:text-sm"
                          >
                            <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                            Recuperar
                          </Button>
                        ) : transaction.status === 'forfeited' ? (
                          <Button
                            size="sm"
                            variant="default"
                            className="w-full sm:w-auto text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={soldProductsCache.get(transaction.id) === true}
                            title={soldProductsCache.get(transaction.id) === true ? 'No se puede recuperar porque el producto ya fue vendido' : 'Recuperar transacción'}
                            onClick={async () => {
                              await handleRecoverForfeitedTransaction(transaction.id);
                            }}
                          >
                            <CheckCircle2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                            Recuperar
                          </Button>
                        ) : (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => {
                                setSelectedTransaction(transaction);
                                setShowPaymentForm(true);
                              }}
                              className="w-full sm:w-auto text-xs sm:text-sm"
                            >
                              Registrar Pago
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={async () => {
                                // Cargar transacción e historial de pagos en paralelo ANTES de abrir el diálogo
                                const [transactionResult, paymentResult] = await Promise.all([
                                  supabase
                                    .from('pawn_transactions')
                                    .select(`
                                      *,
                                      clients(id, full_name, phone),
                                      products!pawn_transactions_product_id_fkey(id, name)
                                    `)
                                    .eq('id', transaction.id)
                                    .single(),
                                  supabase
                                    .from('pawn_payments')
                                    .select('*')
                                    .eq('pawn_transaction_id', transaction.id)
                                    .order('payment_date', { ascending: false })
                                ]);
                                
                                if (transactionResult.error) {
                                  console.error('Error fetching transaction:', transactionResult.error);
                                  toast.error('Error al cargar datos de la transacción');
                                  return;
                                }
                                
                                if (paymentResult.error) {
                                  console.error('Error fetching payment history:', paymentResult.error);
                                  // No bloquear si falla el historial, solo mostrar warning
                                  console.warn('Warning: No se pudo cargar historial de pagos');
                                }
                                
                                if (transactionResult.data) {
                                  setSelectedTransaction(transactionResult.data as PawnTransaction);
                                  setPaymentHistory(paymentResult.data || []);
                                  setShowTransactionDetails(true);
                                }
                              }}
                            >
                              <Package className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                              Detalles
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="w-full sm:w-auto text-xs sm:text-sm"
                              onClick={() => {
                                setSelectedTransaction(transaction);
                                fetchPaymentHistory(transaction.id);
                                setShowPaymentHistory(true);
                              }}
                            >
                              <History className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                              Historial
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto text-xs sm:text-sm"
                              onClick={() => {
                                setSelectedTransaction(transaction);
                                setShowQuickUpdate(true);
                              }}
                            >
                              Actualizar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto text-xs sm:text-sm"
                              onClick={async () => {
                                // Fetch transaction with client data for printing
                                const { data: transactionWithClient, error } = await supabase
                                  .from('pawn_transactions')
                                  .select(`
                                    *,
                                    clients(id, full_name, phone)
                                  `)
                                  .eq('id', transaction.id)
                                  .single();
                                
                                if (error || !transactionWithClient) {
                                  toast.error('Error al cargar datos para imprimir');
                                  return;
                                }
                                
                                const client = transactionWithClient.clients;
                                printPawnReceipt(transactionWithClient, client);
                              }}
                            >
                              <Printer className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-1" />
                              Imprimir
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="todas">
          {/* Filters for Todas */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="h-4 w-4 absolute left-3 top-3 text-gray-400" />
                  <Input
                    placeholder="Buscar por cliente o artículo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="redeemed">Redimido</SelectItem>
                    <SelectItem value="forfeited">Perdido</SelectItem>
                    <SelectItem value="deleted">Eliminado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Todas las Transacciones ({filteredTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando transacciones...</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transacciones registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{transaction.product_name}</h3>
                            {getStatusBadge(transaction.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                            <div><strong>Cliente:</strong> {transaction.clients?.full_name || 'N/A'}</div>
                            <div><strong>Préstamo:</strong> ${Number(transaction.loan_amount).toLocaleString()}</div>
                            <div><strong>Valor:</strong> ${Number(transaction.estimated_value).toLocaleString()}</div>
                            <div><strong>Vence:</strong> {formatDateTimeWithOffset(transaction.due_date)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {transaction.status === 'deleted' ? (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={async () => {
                                await handleRecoverTransaction(transaction.id);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Recuperar
                            </Button>
                          ) : transaction.status === 'forfeited' ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={soldProductsCache.get(transaction.id) === true}
                              title={soldProductsCache.get(transaction.id) === true ? 'No se puede recuperar porque el producto ya fue vendido' : 'Recuperar transacción'}
                              onClick={async () => {
                                await handleRecoverForfeitedTransaction(transaction.id);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Recuperar
                            </Button>
                          ) : (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={async () => {
                                // Cargar transacción e historial de pagos en paralelo ANTES de abrir el diálogo
                                const [transactionResult, paymentResult] = await Promise.all([
                                  supabase
                                    .from('pawn_transactions')
                                    .select(`
                                      *,
                                      clients(id, full_name, phone),
                                      products!pawn_transactions_product_id_fkey(id, name)
                                    `)
                                    .eq('id', transaction.id)
                                    .single(),
                                  supabase
                                    .from('pawn_payments')
                                    .select('*')
                                    .eq('pawn_transaction_id', transaction.id)
                                    .order('payment_date', { ascending: false })
                                ]);
                                
                                if (transactionResult.error) {
                                  console.error('Error fetching transaction:', transactionResult.error);
                                  toast.error('Error al cargar datos de la transacción');
                                  return;
                                }
                                
                                if (paymentResult.error) {
                                  console.error('Error fetching payment history:', paymentResult.error);
                                  // No bloquear si falla el historial, solo mostrar warning
                                  console.warn('Warning: No se pudo cargar historial de pagos');
                                }
                                
                                if (transactionResult.data) {
                                  setSelectedTransaction(transactionResult.data as PawnTransaction);
                                  setPaymentHistory(paymentResult.data || []);
                                  setShowTransactionDetails(true);
                                }
                              }}
                            >
                              <Package className="h-4 w-4 mr-1" />
                              Detalles
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <div className="space-y-6">
            {/* Resumen General Mejorado */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Resumen General</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Transacciones activas:</span>
                      <span className="font-semibold">{activeTransactions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total prestado (activo):</span>
                      <span className="font-semibold">${totalLoanAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor en garantía:</span>
                      <span className="font-semibold">${totalEstimatedValue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total transacciones:</span>
                      <span className="font-semibold">{transactions.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Promedio de préstamo:</span>
                      <span className="font-semibold">
                        ${transactions.length > 0 
                          ? Math.round(transactions.reduce((sum, t) => sum + Number(t.loan_amount), 0) / transactions.length).toLocaleString()
                          : '0'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Préstamo más alto:</span>
                      <span className="font-semibold text-green-600">
                        ${transactions.length > 0 
                          ? Math.max(...transactions.map(t => Number(t.loan_amount))).toLocaleString()
                          : '0'}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Por Estado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Activas:</span>
                      <span className="font-semibold text-blue-600">
                        {transactions.filter(t => t.status === 'active').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Redimidas:</span>
                      <span className="font-semibold text-green-600">
                        {transactions.filter(t => t.status === 'redeemed').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Perdidas:</span>
                      <span className="font-semibold text-red-600">
                        {transactions.filter(t => t.status === 'forfeited').length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Eliminadas:</span>
                      <span className="font-semibold text-gray-600">
                        {transactions.filter(t => t.status === 'deleted').length}
                      </span>
                    </div>
                    {transactions.length > 0 && (
                      <>
                        <div className="border-t pt-2 mt-2">
                          <div className="flex justify-between">
                            <span>Tasa de redención:</span>
                            <span className="font-semibold">
                              {Math.round((transactions.filter(t => t.status === 'redeemed').length / transactions.filter(t => t.status !== 'deleted').length) * 100)}%
                            </span>
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span>Tasa de pérdida:</span>
                          <span className="font-semibold text-red-600">
                            {Math.round((transactions.filter(t => t.status === 'forfeited').length / transactions.filter(t => t.status !== 'deleted').length) * 100)}%
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Estadísticas Financieras</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Total prestado (histórico):</span>
                      <span className="font-semibold">
                        ${transactions.filter(t => t.status !== 'deleted').reduce((sum, t) => sum + Number(t.loan_amount), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor recuperado (redimidas):</span>
                      <span className="font-semibold text-green-600">
                        ${transactions.filter(t => t.status === 'redeemed').reduce((sum, t) => sum + Number(t.loan_amount), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor en pérdidas:</span>
                      <span className="font-semibold text-red-600">
                        ${transactions.filter(t => t.status === 'forfeited').reduce((sum, t) => sum + Number(t.loan_amount), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valor garantía recuperada:</span>
                      <span className="font-semibold text-blue-600">
                        ${transactions.filter(t => t.status === 'forfeited').reduce((sum, t) => sum + Number(t.estimated_value), 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex justify-between">
                        <span>Ganancia estimada (garantías):</span>
                        <span className="font-semibold text-green-600">
                          ${transactions.filter(t => t.status === 'forfeited').reduce((sum, t) => sum + (Number(t.estimated_value) - Number(t.loan_amount)), 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Vencimientos y Alertas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-600" />
                    Transacciones Vencidas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const now = new Date();
                    const expired = activeTransactions.filter(t => {
                      const dueDate = new Date(t.due_date);
                      return dueDate < now;
                    });
                    return (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold">Total vencidas:</span>
                          <span className="text-2xl font-bold text-red-600">{expired.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Monto total vencido:</span>
                          <span className="font-semibold text-red-600">
                            ${expired.reduce((sum, t) => sum + Number(t.loan_amount), 0).toLocaleString()}
                          </span>
                        </div>
                        {expired.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-gray-600 mb-2">Últimas 5 vencidas:</p>
                            <div className="space-y-2">
                              {expired.slice(0, 5).map((t) => (
                                <div key={t.id} className="flex justify-between text-sm">
                                  <span className="truncate">{t.product_name}</span>
                                  <span className="font-semibold">${Number(t.loan_amount).toLocaleString()}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-yellow-600" />
                    Próximos Vencimientos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const now = new Date();
                    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    const upcoming = activeTransactions.filter(t => {
                      const dueDate = new Date(t.due_date);
                      return dueDate >= now && dueDate <= nextWeek;
                    }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
                    return (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <span className="text-lg font-semibold">Esta semana:</span>
                          <span className="text-2xl font-bold text-yellow-600">{upcoming.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Monto a vencer:</span>
                          <span className="font-semibold text-yellow-600">
                            ${upcoming.reduce((sum, t) => sum + Number(t.loan_amount), 0).toLocaleString()}
                          </span>
                        </div>
                        {upcoming.length > 0 && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-gray-600 mb-2">Próximas 5:</p>
                            <div className="space-y-2">
                              {upcoming.slice(0, 5).map((t) => (
                                <div key={t.id} className="flex justify-between text-sm">
                                  <span className="truncate">{t.product_name}</span>
                                  <span className="text-xs text-gray-500">
                                    {formatDateTimeWithOffset(t.due_date).split(',')[0]}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* Estadísticas por Categoría y Top Clientes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Estadísticas por Categoría</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const categoryStats: Record<string, { count: number; totalLoan: number; totalValue: number }> = {};
                    transactions.filter(t => t.status !== 'deleted' && t.item_category).forEach(t => {
                      const cat = t.item_category || 'Sin categoría';
                      if (!categoryStats[cat]) {
                        categoryStats[cat] = { count: 0, totalLoan: 0, totalValue: 0 };
                      }
                      categoryStats[cat].count++;
                      categoryStats[cat].totalLoan += Number(t.loan_amount);
                      categoryStats[cat].totalValue += Number(t.estimated_value);
                    });
                    const sortedCategories = Object.entries(categoryStats)
                      .sort((a, b) => b[1].count - a[1].count)
                      .slice(0, 5);
                    return (
                      <div className="space-y-4">
                        {sortedCategories.length > 0 ? (
                          sortedCategories.map(([category, stats]) => (
                            <div key={category} className="border-b pb-3 last:border-b-0">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold">{category}</span>
                                <span className="text-sm text-gray-600">{stats.count} transacciones</span>
                              </div>
                              <div className="flex justify-between text-sm text-gray-600">
                                <span>Total prestado: ${stats.totalLoan.toLocaleString()}</span>
                                <span>Valor: ${stats.totalValue.toLocaleString()}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 text-center py-4">No hay categorías registradas</p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Clientes</CardTitle>
                </CardHeader>
                <CardContent>
                  {(() => {
                    const clientStats: Record<string, { name: string; count: number; totalLoan: number }> = {};
                    transactions.filter(t => t.status !== 'deleted' && t.clients).forEach(t => {
                      const clientId = t.client_id;
                      const clientName = t.clients?.full_name || 'Sin nombre';
                      if (!clientStats[clientId]) {
                        clientStats[clientId] = { name: clientName, count: 0, totalLoan: 0 };
                      }
                      clientStats[clientId].count++;
                      clientStats[clientId].totalLoan += Number(t.loan_amount);
                    });
                    const sortedClients = Object.entries(clientStats)
                      .sort((a, b) => b[1].count - a[1].count)
                      .slice(0, 5);
                    return (
                      <div className="space-y-4">
                        {sortedClients.length > 0 ? (
                          sortedClients.map(([clientId, stats]) => (
                            <div key={clientId} className="border-b pb-3 last:border-b-0">
                              <div className="flex justify-between items-center mb-1">
                                <span className="font-semibold truncate">{stats.name}</span>
                                <span className="text-sm text-gray-600">{stats.count} transacciones</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                Total prestado: ${stats.totalLoan.toLocaleString()}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-gray-500 text-center py-4">No hay datos de clientes</p>
                        )}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

      </Tabs>

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Transacción de Empeño</DialogTitle>
            <DialogDescription>
              Completa el formulario para crear una nueva transacción de empeño
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="client_id">Cliente *</Label>
                <div className="relative">
                  <Input
                    placeholder="Buscar cliente por nombre, teléfono o email..."
                    value={clientSearch}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    className="w-full"
                  />
                  
                  {showClientDropdown && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                      {filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                          onClick={() => selectClient(client)}
                        >
                          <div className="font-medium">{client.full_name}</div>
                          <div className="text-sm text-gray-600">{client.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>


              <div className="md:col-span-2">
                <Label htmlFor="product_name">Nombre del Artículo *</Label>
                <Input
                  id="product_name"
                  value={formData.product_name}
                  onChange={(e) => setFormData({...formData, product_name: e.target.value})}
                  placeholder="Ej: Laptop Dell XPS 15"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="product_description">Descripción del Artículo</Label>
                <Textarea
                  id="product_description"
                  value={formData.product_description}
                  onChange={(e) => setFormData({...formData, product_description: e.target.value})}
                  placeholder="Detalles, marca, modelo, estado, etc."
                  rows={3}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="item_category">Categoría del Artículo</Label>
                <div className="relative">
                  <Input
                    id="item_category"
                    placeholder="Buscar o escribir categoría..."
                    value={categorySearch}
                    onChange={(e) => handleCategorySearch(e.target.value)}
                    onFocus={() => {
                      if (categorySearch.trim()) {
                        handleCategorySearch(categorySearch);
                      } else {
                        // Si está vacío, mostrar todas las categorías disponibles
                        const allCategories = getAllCategories();
                        setCategorySuggestions(allCategories);
                        setShowCategorySuggestions(allCategories.length > 0);
                      }
                    }}
                    onBlur={() => {
                      // Delay para permitir que el click en la sugerencia funcione
                      setTimeout(() => setShowCategorySuggestions(false), 200);
                    }}
                  />
                  {showCategorySuggestions && categorySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      {categorySuggestions.map((category, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault(); // Prevenir blur del input
                            selectCategory(category);
                          }}
                        >
                          <div className="font-medium">{category}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="item_condition">Estado del Artículo</Label>
                <Select 
                  value={formData.item_condition} 
                  onValueChange={(value) => setFormData({...formData, item_condition: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excelente</SelectItem>
                    <SelectItem value="good">Bueno</SelectItem>
                    <SelectItem value="fair">Regular</SelectItem>
                    <SelectItem value="poor">Malo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="item_brand">Marca del Artículo</Label>
                <div className="relative">
                  <Input
                    id="item_brand"
                    placeholder="Buscar o escribir marca..."
                    value={brandSearch}
                    onChange={(e) => handleBrandSearch(e.target.value)}
                    onFocus={() => {
                      if (brandSearch.trim()) {
                        handleBrandSearch(brandSearch);
                      } else {
                        const allBrands = getAllBrands();
                        setBrandSuggestions(allBrands);
                        setShowBrandSuggestions(allBrands.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowBrandSuggestions(false), 200);
                    }}
                  />
                  {showBrandSuggestions && brandSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      {brandSuggestions.map((brand, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectBrand(brand);
                          }}
                        >
                          <div className="font-medium">{brand}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="item_model">Modelo del Artículo</Label>
                <div className="relative">
                  <Input
                    id="item_model"
                    placeholder="Buscar o escribir modelo..."
                    value={modelSearch}
                    onChange={(e) => handleModelSearch(e.target.value)}
                    onFocus={() => {
                      if (modelSearch.trim()) {
                        handleModelSearch(modelSearch);
                      } else {
                        const allModels = getAllModels(formData.item_brand);
                        setModelSuggestions(allModels);
                        setShowModelSuggestions(allModels.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowModelSuggestions(false), 200);
                    }}
                  />
                  {showModelSuggestions && modelSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      {modelSuggestions.map((model, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectModel(model);
                          }}
                        >
                          <div className="font-medium">{model}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="estimated_value">Valor Estimado *</Label>
                <Input
                  id="estimated_value"
                  type="number"
                  step="0.01"
                  value={formData.estimated_value}
                  onChange={(e) => setFormData({...formData, estimated_value: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="loan_amount">Monto del Préstamo *</Label>
                <Input
                  id="loan_amount"
                  type="number"
                  step="0.01"
                  value={formData.loan_amount}
                  onChange={(e) => setFormData({...formData, loan_amount: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="interest_rate">Tasa de Interés Mensual (%) *</Label>
                <Input
                  id="interest_rate"
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({...formData, interest_rate: parseFloat(e.target.value)})}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  El interés se cobra diariamente
                </p>
              </div>

              <div>
                <Label htmlFor="interest_rate_type">Tipo de Tasa *</Label>
                <Select 
                  value={formData.interest_rate_type} 
                  onValueChange={(value: 'monthly' | 'annual' | 'daily' | 'weekly' | 'biweekly' | 'quarterly' | 'yearly') => 
                    setFormData({...formData, interest_rate_type: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diario</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="period_days">Período (días) *</Label>
                <Input
                  id="period_days"
                  type="number"
                  min="1"
                  value={formData.period_days}
                  onChange={(e) => handlePeriodChange(parseInt(e.target.value) || 0)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se actualiza automáticamente al cambiar las fechas
                </p>
              </div>

              <div>
                <Label htmlFor="start_date">Fecha de Inicio *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Fecha desde la cual se calcula el interés
                </p>
              </div>

              <div>
                <Label htmlFor="due_date">Fecha de Vencimiento *</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleDueDateChange(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se calcula automáticamente según el período seleccionado
                </p>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Notas adicionales..."
                  rows={2}
                />
              </div>

              <div className="md:col-span-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleShowInterestPreview}
                  className="w-full"
                >
                  📊 Ver Previsualización de Interés Diario
                </Button>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Ve cómo aumenta el monto día a día según la tasa de interés
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowTransactionForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Crear Transacción</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Extend Term Dialog */}
      <Dialog open={showExtendForm} onOpenChange={setShowExtendForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extender Plazo</DialogTitle>
            <DialogDescription>
              Agrega días adicionales al plazo de vencimiento de esta transacción
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm">Artículo: <strong>{selectedTransaction.product_name}</strong></div>
                <div className="text-sm">Vence: <strong>{formatDateTimeWithOffset(selectedTransaction.due_date)}</strong></div>
              </div>
              <div>
                <Label>Días a agregar</Label>
                <Input
                  type="number"
                  min="1"
                  value={extendDays}
                  onChange={(e) => setExtendDays(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowExtendForm(false)}>Cancelar</Button>
                <Button onClick={() => handleExtendDays(selectedTransaction, extendDays)}>Extender</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Charge Dialog */}
      <Dialog open={showAddChargeForm} onOpenChange={setShowAddChargeForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5" />
              Agregar Cargo
            </DialogTitle>
            <DialogDescription>
              Agrega un cargo adicional a esta transacción de compra venta
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <form onSubmit={handleAddCharge} className="space-y-4">
              <div className="p-3 bg-gray-50 rounded">
                <div className="text-sm">Artículo: <strong>{selectedTransaction.product_name}</strong></div>
                <div className="text-sm">Cliente: <strong>{selectedTransaction.clients?.full_name || 'N/A'}</strong></div>
                <div className="text-sm">Monto Actual: <strong>${Number(selectedTransaction.loan_amount).toLocaleString()}</strong></div>
              </div>
              
              <div>
                <Label htmlFor="charge_amount">Monto del Cargo *</Label>
                <Input
                  id="charge_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={chargeFormData.amount || ''}
                  onChange={(e) => setChargeFormData({...chargeFormData, amount: parseFloat(e.target.value) || 0})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="charge_date">Fecha del Cargo *</Label>
                <Input
                  id="charge_date"
                  type="date"
                  value={chargeFormData.charge_date}
                  onChange={(e) => setChargeFormData({...chargeFormData, charge_date: e.target.value})}
                  max={getCurrentDateStringForSantoDomingo()}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  La fecha de vencimiento será un día después de esta fecha
                </p>
              </div>

              <div>
                <Label htmlFor="charge_reference">Número de Referencia</Label>
                <Input
                  id="charge_reference"
                  value={chargeFormData.reference_number}
                  onChange={(e) => setChargeFormData({...chargeFormData, reference_number: e.target.value})}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <Label htmlFor="charge_reason">Razón del Cargo</Label>
                <Textarea
                  id="charge_reason"
                  value={chargeFormData.reason}
                  onChange={(e) => setChargeFormData({...chargeFormData, reason: e.target.value})}
                  placeholder="Explique la razón del cargo..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="charge_notes">Notas Adicionales</Label>
                <Textarea
                  id="charge_notes"
                  value={chargeFormData.notes}
                  onChange={(e) => setChargeFormData({...chargeFormData, notes: e.target.value})}
                  placeholder="Notas adicionales sobre el cargo..."
                  rows={2}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => {
                  setShowAddChargeForm(false);
                  setChargeFormData({
                    amount: 0,
                    charge_date: getCurrentDateStringForSantoDomingo(),
                    reference_number: '',
                    reason: '',
                    notes: ''
                  });
                }}>
                  Cancelar
                </Button>
                <Button type="submit">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Agregar Cargo
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Form Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
            <DialogDescription>
              Registra un pago para esta transacción de empeño
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && <PaymentFormContent 
            transaction={selectedTransaction}
            paymentData={paymentData}
            setPaymentData={setPaymentData}
            onCancel={() => setShowPaymentForm(false)}
            onSubmit={handlePayment}
            getCurrentRemainingPrincipal={getCurrentRemainingPrincipal}
            calculateAccumulatedInterest={calculateAccumulatedInterest}
          />}
        </DialogContent>
      </Dialog>

      {/* Payment History Dialog */}
      <Dialog open={showPaymentHistory} onOpenChange={setShowPaymentHistory}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Pagos
            </DialogTitle>
            <DialogDescription>
              Visualiza el historial completo de pagos y extensiones de esta transacción
            </DialogDescription>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-4">
              {/* Transaction Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información de la Transacción</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p><strong>Cliente:</strong> {selectedTransaction.clients?.full_name || 'N/A'}</p>
                      <p><strong>Artículo:</strong> {selectedTransaction.product_name}</p>
                    </div>
                    <div>
                      <p><strong>Préstamo:</strong> ${Number(selectedTransaction.loan_amount).toLocaleString()}</p>
                      <p><strong>Valor Estimado:</strong> ${Number(selectedTransaction.estimated_value).toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment History */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Movimientos ({paymentHistory.length + pawnHistory.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentHistory.length === 0 && pawnHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No hay movimientos registrados</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Combinar pagos y cargos, ordenados por fecha */}
                      {(() => {
                        const movements: Array<{
                          id: string;
                          type: 'payment' | 'charge';
                          date: Date;
                          data: any;
                        }> = [];

                        // Agregar pagos
                        paymentHistory.forEach(payment => {
                          movements.push({
                            id: payment.id,
                            type: 'payment',
                            date: new Date(payment.payment_date),
                            data: payment
                          });
                        });

                        // Agregar cargos del historial
                        pawnHistory.forEach(entry => {
                          if (entry.change_type === 'add_charge') {
                            movements.push({
                              id: entry.id,
                              type: 'charge',
                              date: new Date(entry.created_at),
                              data: entry
                            });
                          }
                        });

                        // Ordenar por fecha (más reciente primero)
                        movements.sort((a, b) => b.date.getTime() - a.date.getTime());

                        return movements.map((movement) => {
                          if (movement.type === 'charge') {
                            const charge = movement.data;
                            return (
                              <div key={charge.id} className="border rounded-lg p-4 bg-blue-50">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <TrendingUp className="h-5 w-5 text-blue-600" />
                                      <h3 className="font-semibold text-lg">
                                        ${Number(charge.amount || 0).toLocaleString()}
                                      </h3>
                                      <Badge className="bg-blue-500">Cargo</Badge>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                                      <div><strong>Fecha:</strong> {new Date(charge.created_at).toLocaleString('es-DO', {
                                        timeZone: 'America/Santo_Domingo',
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                      })}</div>
                                      {charge.charge_date && (
                                        <div><strong>Fecha del Cargo:</strong> {formatDateStringForSantoDomingo(charge.charge_date)}</div>
                                      )}
                                      {charge.reference_number && (
                                        <div><strong>Referencia:</strong> {charge.reference_number}</div>
                                      )}
                                      {charge.reason && (
                                        <div className="md:col-span-2">
                                          <strong>Razón:</strong> {charge.reason}
                                        </div>
                                      )}
                                      {charge.notes && (
                                        <div className="md:col-span-2">
                                          <strong>Notas:</strong> {charge.notes}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          } else {
                            const payment = movement.data;
                            return (
                              <div key={payment.id} className="border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      {payment.payment_type === 'extension' ? (
                                        <h3 className="font-semibold text-lg">
                                          Extensión de Plazo
                                        </h3>
                                      ) : (
                                        <h3 className="font-semibold text-lg">
                                          ${Number(payment.amount).toLocaleString()}
                                        </h3>
                                      )}
                                      <Badge className={
                                        payment.payment_type === 'full' ? 'bg-green-500' :
                                        payment.payment_type === 'partial' ? 'bg-blue-500' :
                                        payment.payment_type === 'extension' ? 'bg-purple-500' :
                                        'bg-yellow-500'
                                      }>
                                        {payment.payment_type === 'full' ? 'Completo' :
                                         payment.payment_type === 'partial' ? 'Parcial' :
                                         payment.payment_type === 'extension' ? 'Extensión' : 'Interés'}
                                      </Badge>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                                      <div><strong>Fecha:</strong> {new Date(payment.payment_date).toLocaleString('es-DO', {
                                        timeZone: 'America/Santo_Domingo',
                                        year: 'numeric',
                                        month: '2-digit',
                                        day: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                      })}</div>
                                      <div><strong>Tipo:</strong> {
                                        payment.payment_type === 'extension' ? 'Extensión de Plazo' :
                                        payment.payment_type === 'full' ? 'Pago Completo (Redención)' :
                                        payment.payment_type === 'partial' ? 'Pago Parcial' : 'Solo Interés'
                                      }</div>
                                      {payment.notes && (
                                        <div className="md:col-span-2">
                                          <strong>Notas:</strong> {payment.notes}
                                        </div>
                                      )}
                                    </div>
                                    {payment.payment_type !== 'extension' && (
                                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                                        <div className="p-3 bg-white rounded-lg border">
                                          <div className="text-gray-600 text-xs uppercase">Abono a Interés</div>
                                          <div className="text-base font-semibold text-orange-600">
                                            ${Number(payment.interest_payment || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </div>
                                        </div>
                                        <div className="p-3 bg-white rounded-lg border">
                                          <div className="text-gray-600 text-xs uppercase">Abono a Capital</div>
                                          <div className="text-base font-semibold text-blue-600">
                                            ${Number(payment.principal_payment || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </div>
                                        </div>
                                        {typeof payment.remaining_balance === 'number' && !Number.isNaN(Number(payment.remaining_balance)) && (
                                          <div className="p-3 bg-white rounded-lg border">
                                            <div className="text-gray-600 text-xs uppercase">Capital Pendiente</div>
                                            <div className="text-base font-semibold text-blue-700">
                                              ${Number(payment.remaining_balance || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleViewReceipt(payment)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Ver Recibo
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => printReceipt(payment, selectedTransaction)}
                                  >
                                    <Printer className="h-4 w-4 mr-1" />
                                    Imprimir
                                  </Button>
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => downloadReceipt(payment, selectedTransaction)}
                                  >
                                    <Download className="h-4 w-4 mr-1" />
                                    Descargar
                                  </Button>
                                  {paymentHistory.length > 0 && paymentHistory[0].id === payment.id && (
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="text-red-600 hover:text-red-700"
                                      onClick={async () => {
                                        if (confirm('¿Estás seguro de que quieres eliminar este pago? Esta acción no se puede deshacer.')) {
                                          try {
                                            if (!selectedTransaction) {
                                              toast.error('No hay transacción seleccionada');
                                              return;
                                            }

                                            console.log('🗑️ Iniciando eliminación de pago:', payment.id);

                                            // PASO 1: Obtener el estado actual de la transacción
                                            const { data: currentTransaction, error: transError } = await supabase
                                              .from('pawn_transactions')
                                              .select('status')
                                              .eq('id', selectedTransaction.id)
                                              .single();

                                            if (transError || !currentTransaction) {
                                              console.error('Error obteniendo transacción:', transError);
                                              throw new Error('No se pudo obtener la transacción');
                                            }

                                            // PASO 2: Eliminar el pago
                                            // NO necesitamos restaurar start_date porque nunca lo modificamos
                                            console.log('🗑️ Eliminando pago de la base de datos...');
                                            const { error: deleteError } = await supabase
                                              .from('pawn_payments')
                                              .delete()
                                              .eq('id', payment.id);
                                            
                                            if (deleteError) {
                                              console.error('Error eliminando pago:', deleteError);
                                              throw deleteError;
                                            }

                                            // Verificar que realmente se eliminó consultando de nuevo
                                            const { data: verifyPayment, error: verifyError } = await supabase
                                              .from('pawn_payments')
                                              .select('id')
                                              .eq('id', payment.id)
                                              .maybeSingle();

                                            if (verifyError) {
                                              console.error('Error verificando eliminación:', verifyError);
                                              // No lanzar error aquí, puede ser que simplemente no existe
                                            }

                                            if (verifyPayment) {
                                              throw new Error('El pago aún existe después de intentar eliminarlo. Puede ser un problema de permisos.');
                                            }

                                            console.log('🗑️ Pago eliminado exitosamente');

                                            // PASO 3: Actualizar la transacción si es necesario
                                            // Si el status era 'redeemed' (porque el balance llegó a 0), cambiarlo a 'active'
                                            // El remaining_balance se calcula dinámicamente, no se guarda en la tabla
                                            if (currentTransaction.status === 'redeemed') {
                                              const { error: updateError } = await supabase
                                                .from('pawn_transactions')
                                                .update({ status: 'active' })
                                                .eq('id', selectedTransaction.id);

                                              if (updateError) {
                                                console.error('Error actualizando transacción:', updateError);
                                                throw updateError;
                                              }
                                              console.log('🗑️ Cambiando status de redeemed a active');
                                            }
                                            
                                            toast.success('Pago eliminado exitosamente');
                                            
                                            // Refrescar datos DESPUÉS de que todo se complete
                                            // Esperar un momento para asegurar que la base de datos se actualice
                                            await new Promise(resolve => setTimeout(resolve, 100));
                                            
                                            if (selectedTransaction) {
                                              await fetchPaymentHistory(selectedTransaction.id);
                                              await fetchData(); // Refrescar lista de transacciones
                                            }
                                          } catch (error: any) {
                                            console.error('Error eliminando pago:', error);
                                            toast.error(`Error al eliminar pago: ${error.message || 'Error desconocido'}`);
                                          }
                                        }
                                      }}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Eliminar
                                    </Button>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        });
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Transaction Details Dialog */}
      <Dialog open={showTransactionDetails} onOpenChange={setShowTransactionDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Detalles de la Transacción
            </DialogTitle>
            <DialogDescription>
              Información completa y estadísticas financieras de la transacción
            </DialogDescription>
          </DialogHeader>
          
          {selectedTransaction && (
            <div className="space-y-6">
              {/* Transaction Status and Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Información General</span>
                    {getStatusBadge(selectedTransaction.status)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Cliente</h4>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-gray-500" />
                          <span>{selectedTransaction.clients?.full_name || 'N/A'}</span>
                        </div>
                        {selectedTransaction.clients?.phone && (
                          <p className="text-sm text-gray-500 ml-6">
                            Tel: {selectedTransaction.clients.phone}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Artículo</h4>
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-gray-500" />
                          <span className="font-medium">{selectedTransaction.product_name}</span>
                        </div>
                        {selectedTransaction.product_description && (
                          <p className="text-sm text-gray-500 ml-6 mt-1">
                            {selectedTransaction.product_description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Fechas</h4>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="text-sm">
                              <strong>Inicio:</strong> {formatDateTimeWithOffset(selectedTransaction.start_date)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <span className="text-sm">
                              <strong>Vencimiento:</strong> {formatDateTimeWithOffset(selectedTransaction.due_date)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Detalles Financieros
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-end mb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedTransaction && previewInterestFromTransaction(selectedTransaction)}
                    >
                      📊 Ver Previsualización de Interés
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        ${Number(selectedTransaction.loan_amount).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Monto del Préstamo</div>
                    </div>
                    
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        ${Number(selectedTransaction.estimated_value).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Valor Estimado</div>
                    </div>
                    
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">
                        {selectedTransaction.interest_rate}%
                      </div>
                      <div className="text-sm text-gray-600">
                        Tasa de Interés ({selectedTransaction.interest_rate_type === 'daily' ? 'Diario' :
                                        selectedTransaction.interest_rate_type === 'weekly' ? 'Semanal' :
                                        selectedTransaction.interest_rate_type === 'biweekly' ? 'Quincenal' :
                                        selectedTransaction.interest_rate_type === 'monthly' ? 'Mensual' :
                                        selectedTransaction.interest_rate_type === 'quarterly' ? 'Trimestral' :
                                        selectedTransaction.interest_rate_type === 'yearly' ? 'Anual' : 'Mensual'})
                      </div>
                    </div>
                  </div>
                  
                  {/* Resumen de Pagos e Intereses */}
                  {(() => {
                    const estimatedValue = Number(selectedTransaction.estimated_value || 0);
                    const loanAmount = Number(selectedTransaction.loan_amount || 0);
                    const totalDue = Math.max(0, detailsSummary.capitalPending + detailsSummary.interestAccrued);

                    return (
                      <>
                        <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border-2 border-blue-200">
                          <h4 className="font-semibold text-lg mb-4 text-center">Resumen de Pagos</h4>
                          {detailsSummary.loading ? (
                            <div className="text-center text-sm text-gray-500">
                              Calculando información financiera...
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Capital Pendiente</div>
                                  <div className="text-2xl font-bold text-blue-600">
                                    ${detailsSummary.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Interés Acumulado</div>
                                  <div className="text-2xl font-bold text-orange-600">
                                    ${detailsSummary.interestAccrued.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Monto Pendiente</div>
                                  <div className="text-2xl font-bold text-red-600">
                                    ${totalDue.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Abonado a Capital</div>
                                  <div className="text-2xl font-bold text-blue-700">
                                    ${detailsSummary.totalPrincipalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Abonado a Interés</div>
                                  <div className="text-2xl font-bold text-orange-500">
                                    ${detailsSummary.totalInterestPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                                <div className="text-center p-3 bg-white rounded-lg shadow-sm">
                                  <div className="text-sm font-medium text-gray-600 mb-1">Total Pagado</div>
                                  <div className="text-2xl font-bold text-green-600">
                                    ${detailsSummary.totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <span className="text-sm font-medium text-gray-600">Período:</span>
                              <div className="text-lg font-semibold">
                                {selectedTransaction.period_days} días
                              </div>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-600">Diferencia (Valor - Préstamo):</span>
                              <div className="text-lg font-semibold">
                                ${(estimatedValue - loanAmount).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-600">Margen de Seguridad:</span>
                              <div className="text-lg font-semibold">
                                {estimatedValue > 0 ? ((estimatedValue - loanAmount) / estimatedValue * 100).toFixed(1) : '0.0'}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>

              {/* Additional Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Información Adicional</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {selectedTransaction.notes && (
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Notas de la Transacción</h4>
                        <p className="text-sm bg-gray-50 p-3 rounded-lg">
                          {selectedTransaction.notes}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">Fecha de Creación</h4>
                        <p className="text-sm">
                          {formatDateTimeWithOffset(selectedTransaction.created_at)}
                        </p>
                      </div>
                      
                      <div>
                        <h4 className="font-semibold text-sm text-gray-600 mb-2">ID de Transacción</h4>
                        <p className="text-sm font-mono text-gray-500">
                          {selectedTransaction.id}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Action Buttons */}
              <div className="flex justify-center pt-4 border-t">
                <Button
                  variant="default"
                  size="lg"
                  className="min-w-[120px] bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg transition-all duration-200"
                  onClick={() => {
                    setSelectedTransaction(null);
                    setShowTransactionDetails(false);
                  }}
                >
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rate Update Form Dialog */}
      <Dialog open={showRateUpdateForm} onOpenChange={setShowRateUpdateForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar Tasa de Interés</DialogTitle>
            <DialogDescription>
              Modifica la tasa de interés de esta transacción. Puedes programar el cambio para una fecha futura.
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p><strong>Artículo:</strong> {selectedTransaction.product_name}</p>
              <p><strong>Cliente:</strong> {selectedTransaction.clients?.full_name}</p>
              <p><strong>Tasa Actual:</strong> {selectedTransaction.interest_rate}%</p>
                    </div>
                  )}
          <form onSubmit={handleRateUpdate} className="space-y-4">
              <div>
              <Label htmlFor="new_rate">Nueva Tasa de Interés Mensual (%) *</Label>
                <Input
                id="new_rate"
                  type="number"
                step="0.01"
                value={rateUpdateData.new_rate}
                onChange={(e) => setRateUpdateData({...rateUpdateData, new_rate: parseFloat(e.target.value)})}
                  required
                />
              </div>

              <div>
              <Label htmlFor="effective_date">Fecha Efectiva *</Label>
                <Input
                id="effective_date"
                type="date"
                value={rateUpdateData.effective_date}
                onChange={(e) => setRateUpdateData({...rateUpdateData, effective_date: e.target.value})}
                  required
                  min={selectedTransaction?.start_date ? new Date(selectedTransaction.start_date).toISOString().split('T')[0] : undefined}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Si la fecha es hoy o anterior, el cambio se aplicará inmediatamente. 
                  Si es futura, se programará para aplicarse en esa fecha.
                </p>
              </div>

              <div>
              <Label htmlFor="reason">Razón del Cambio</Label>
                <Textarea
                id="reason"
                value={rateUpdateData.reason}
                onChange={(e) => setRateUpdateData({...rateUpdateData, reason: e.target.value})}
                placeholder="Explique la razón del cambio de tasa..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowRateUpdateForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Actualizar Tasa</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Update Dialog */}
      <Dialog open={showQuickUpdate} onOpenChange={setShowQuickUpdate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actualizar Transacción</DialogTitle>
            <DialogDescription>
              Selecciona una acción para actualizar esta transacción
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowQuickUpdate(false);
                  setShowExtendForm(true);
                }}
              >
                Extender Plazo
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowQuickUpdate(false);
                  setChargeFormData({
                    amount: 0,
                    charge_date: getCurrentDateStringForSantoDomingo(),
                    reference_number: '',
                    reason: '',
                    notes: ''
                  });
                  setShowAddChargeForm(true);
                }}
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                Agregar Cargo
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowQuickUpdate(false);
                  setRateUpdateData({
                    new_rate: selectedTransaction.interest_rate,
                    reason: '',
                    effective_date: new Date().toISOString().split('T')[0]
                  });
                  setShowRateUpdateForm(true);
                }}
              >
                Actualizar Tasa
              </Button>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => {
                  setShowQuickUpdate(false);
                  handleStatusChange(selectedTransaction.id, 'forfeited');
                }}
              >
                Marcar como Perdido
              </Button>
              {selectedTransaction.status !== 'deleted' && (
                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={() => {
                    setShowQuickUpdate(false);
                    setShowDeleteDialog(true);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Eliminar Transacción
                </Button>
              )}
              {selectedTransaction.status === 'deleted' && (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={async () => {
                    setShowQuickUpdate(false);
                    await handleRecoverTransaction(selectedTransaction.id);
                  }}
                >
                  Recuperar Transacción
                </Button>
              )}
              {selectedTransaction.status === 'forfeited' && (
                <Button
                  variant="default"
                  className="w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={soldProductsCache.get(selectedTransaction.id) === true}
                  title={soldProductsCache.get(selectedTransaction.id) === true ? 'No se puede recuperar porque el producto ya fue vendido' : 'Recuperar transacción'}
                  onClick={async () => {
                    setShowQuickUpdate(false);
                    await handleRecoverForfeitedTransaction(selectedTransaction.id);
                  }}
                >
                  Recuperar Transacción
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Transaction Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Eliminar Transacción
            </DialogTitle>
            <DialogDescription>
              Esta acción marcará la transacción como eliminada, pero podrá ser recuperada más tarde
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>¿Estás seguro?</strong> Esta acción marcará la transacción como eliminada, pero podrá ser recuperada más tarde.
              </p>
            </div>
            <div>
              <Label htmlFor="delete_reason">Razón de eliminación (opcional)</Label>
              <Textarea
                id="delete_reason"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Ej: Error en el registro, cancelación por el cliente, etc."
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteReason('');
                }}
              >
                Cancelar
              </Button>
              <Button 
                type="button"
                variant="destructive" 
                onClick={async () => {
                  if (selectedTransaction) {
                    await handleDeleteTransaction(selectedTransaction.id);
                  }
                }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Interest Preview Modal */}
      <Dialog open={showInterestPreview} onOpenChange={setShowInterestPreview}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📊 Previsualización de Interés Diario
            </DialogTitle>
            <DialogDescription>
              Visualiza el desglose diario del cálculo de interés acumulado
            </DialogDescription>
          </DialogHeader>
          
          {interestPreviewData && (
            <div className="space-y-6">
              {/* Resumen */}
              <Card>
                <CardHeader>
                  <CardTitle>Resumen del Cálculo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        ${interestPreviewData.principal.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-600">Capital Pendiente</div>
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {interestPreviewData.rate}%
                      </div>
                      <div className="text-sm text-gray-600">Tasa Mensual</div>
                    </div>
                    
                    <div className="text-center p-4 bg-yellow-50 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">
                        {(interestPreviewData.rate / 30).toFixed(4)}%
                      </div>
                      <div className="text-sm text-gray-600">Tasa Diaria</div>
                    </div>
                    
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">
                        {interestPreviewData.days}
                      </div>
                      <div className="text-sm text-gray-600">Días Totales</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <span className="text-sm font-medium text-gray-600">Interés Total:</span>
                        <div className="text-lg font-semibold text-red-600">
                          ${interestPreviewData.dailyBreakdown[interestPreviewData.dailyBreakdown.length - 1]?.accumulatedInterest.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Monto Final:</span>
                        <div className="text-lg font-semibold text-green-600">
                          ${interestPreviewData.dailyBreakdown[interestPreviewData.dailyBreakdown.length - 1]?.totalAmount.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Interés Diario:</span>
                        <div className="text-lg font-semibold text-blue-600">
                          ${interestPreviewData.dailyBreakdown[0]?.dailyInterest.toFixed(2) || '0.00'}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tabla Detallada */}
              <Card>
                <CardHeader>
                  <CardTitle>Desglose Día por Día</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Día</th>
                          <th className="text-left p-2">Fecha</th>
                          <th className="text-right p-2">Interés Diario</th>
                          <th className="text-right p-2">Interés Acumulado</th>
                          <th className="text-right p-2">Total a Pagar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {interestPreviewData.dailyBreakdown.map((day, index) => (
                          <tr key={day.day} className={`border-b hover:bg-gray-50 ${
                            day.day % 7 === 0 ? 'bg-blue-50' : ''
                          }`}>
                            <td className="p-2 font-medium">
                              Día {day.day}
                              {day.day % 7 === 0 && (
                                <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                  Semana {Math.ceil(day.day / 7)}
                                </span>
                              )}
                            </td>
                            <td className="p-2 text-gray-600">
                              {(() => {
                                // Formatear la fecha directamente desde el string sin crear objeto Date
                                // Esto evita completamente problemas de zona horaria
                                // day.date ya está en formato YYYY-MM-DD
                                const [year, month, dayNum] = day.date.split('-').map(Number);
                                // Formatear directamente como DD/MM/YYYY para mostrar
                                return `${String(dayNum).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
                              })()}
                            </td>
                            <td className="p-2 text-right font-mono">
                              ${day.dailyInterest.toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-mono text-orange-600">
                              ${day.accumulatedInterest.toFixed(2)}
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-green-600">
                              ${day.totalAmount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="mt-4 text-xs text-gray-500">
                    <p>• Las filas azules marcan el final de cada semana</p>
                    <p>• El interés se calcula diariamente sobre el capital pendiente actual</p>
                    <p>• Al final del período, el interés total será exactamente {interestPreviewData.rate}% del capital pendiente</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowInterestPreview(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Recibo */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recibo de Pago - {selectedTransaction?.clients?.full_name || 'Cliente'}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => selectedPayment && selectedTransaction && printReceipt(selectedPayment, selectedTransaction)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button size="sm" variant="outline" onClick={() => selectedPayment && selectedTransaction && downloadReceipt(selectedPayment, selectedTransaction)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReceiptModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {selectedPayment && selectedTransaction && (
            <div className="space-y-6">
              {/* Información del Cliente */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Información del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Nombre:</span>
                      <div className="font-semibold">{selectedTransaction.clients?.full_name || 'N/A'}</div>
                    </div>
                    {selectedTransaction.clients?.phone && (
                      <div>
                        <span className="font-medium text-gray-600">Teléfono:</span>
                        <div className="font-semibold">{selectedTransaction.clients.phone}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Detalles de la Transacción */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Detalles de la Transacción
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Artículo:</span>
                      <div className="font-semibold">{selectedTransaction.product_name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Monto del Préstamo:</span>
                      <div className="font-semibold">RD${Number(selectedTransaction.loan_amount).toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tasa de Interés:</span>
                      <div className="font-semibold">{selectedTransaction.interest_rate}%</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Valor Estimado:</span>
                      <div className="font-semibold">RD${Number(selectedTransaction.estimated_value).toLocaleString()}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Pago */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Detalles del Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="font-medium text-gray-600">Fecha de Pago:</span>
                      <div className="font-semibold">{new Date(selectedPayment.payment_date).toLocaleDateString('es-DO')}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tipo de Pago:</span>
                      <div className="font-semibold">
                        {selectedPayment.payment_type === 'full' ? 'Pago Completo (Redención)' :
                         selectedPayment.payment_type === 'partial' ? 'Pago Parcial' :
                         selectedPayment.payment_type === 'interest' ? 'Solo Interés' :
                         selectedPayment.payment_type}
                      </div>
                    </div>
                  </div>

                  {/* Desglose del Pago */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3">Desglose del Pago</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Interés:</span>
                        <span className="font-semibold">RD${Number(selectedPayment.interest_payment || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Capital:</span>
                        <span className="font-semibold">RD${Number(selectedPayment.principal_payment || 0).toLocaleString()}</span>
                      </div>
                      <hr className="my-2" />
                      <div className="flex justify-between text-lg font-bold text-green-600">
                        <span>TOTAL:</span>
                        <span>RD${Number(selectedPayment.amount).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Montos Pendientes */}
                  {(() => {
                    const remainingBalance = Number(selectedPayment.remaining_balance || 0);
                    const remainingInterest = selectedPayment.remaining_interest 
                      ? Math.max(0, Number(selectedPayment.remaining_interest) - Number(selectedPayment.interest_payment || 0))
                      : 0;
                    const totalPending = remainingBalance + remainingInterest;

                    return (
                      <div className="mt-4 bg-blue-50 p-4 rounded-lg">
                        <h4 className="font-semibold mb-3">Montos Pendientes</h4>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Capital Pendiente:</span>
                            <span className="font-semibold">RD${remainingBalance.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Interés Pendiente:</span>
                            <span className="font-semibold">RD${remainingInterest.toLocaleString()}</span>
                          </div>
                          <hr className="my-2" />
                          <div className="flex justify-between text-lg font-bold text-red-600">
                            <span>Total Pendiente:</span>
                            <span>RD${totalPending.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {selectedPayment.notes && (
                    <div className="mt-4">
                      <span className="font-medium text-gray-600">Notas:</span>
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                        {selectedPayment.notes}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de confirmación de WhatsApp */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar recibo por WhatsApp?</DialogTitle>
            <DialogDescription>
              ¿Deseas enviar el recibo del pago al cliente por WhatsApp?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsAppDialog(false);
                setShowPaymentForm(false);
                setSelectedTransaction(null);
                resetPaymentForm();
                fetchData();
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                // Obtener el teléfono del cliente si no está disponible
                let clientPhone = lastPaymentData?.client?.phone;
                
                if (!clientPhone && lastPaymentData?.client?.id) {
                  try {
                    console.log('🔍 Obteniendo teléfono del cliente desde BD para client:', lastPaymentData.client.id);
                    const { data: clientData, error: clientError } = await supabase
                      .from('clients')
                      .select('phone')
                      .eq('id', lastPaymentData.client.id)
                      .maybeSingle();
                    
                    console.log('🔍 Client data:', clientData, 'Error:', clientError);
                    
                    if (clientData?.phone) {
                      clientPhone = clientData.phone;
                      // Actualizar lastPaymentData con el teléfono
                      setLastPaymentData({
                        ...lastPaymentData,
                        client: {
                          ...lastPaymentData.client,
                          phone: clientPhone
                        }
                      });
                    }
                  } catch (error) {
                    console.error('Error obteniendo teléfono del cliente:', error);
                  }
                }
                
                console.log('🔍 Teléfono final del cliente:', clientPhone);
                
                if (!clientPhone) {
                  toast.error('No se encontró el número de teléfono del cliente. Por favor, verifica que el cliente tenga un número de teléfono registrado.');
                  setShowWhatsAppDialog(false);
                  setShowPaymentForm(false);
                  setSelectedTransaction(null);
                  resetPaymentForm();
                  fetchData();
                  return;
                }

                try {
                  const companyName = companySettings?.company_name || 'LA EMPRESA';
                  const receiptMessage = generatePawnPaymentReceipt({
                    companyName,
                    clientName: lastPaymentData.client.full_name,
                    clientDni: lastPaymentData.client.dni,
                    paymentDate: lastPaymentData.paymentDate,
                    paymentAmount: lastPaymentData.payment.amount,
                    principalAmount: lastPaymentData.principalPayment,
                    interestAmount: lastPaymentData.interestPayment,
                    remainingBalance: lastPaymentData.remainingBalance,
                    paymentMethod: lastPaymentData.paymentMethod,
                    transactionId: lastPaymentData.transaction.id,
                    productName: lastPaymentData.transaction.product_name,
                    loanAmount: lastPaymentData.transaction.loan_amount,
                    interestRate: lastPaymentData.transaction.interest_rate,
                    referenceNumber: lastPaymentData.referenceNumber
                  });

                  openWhatsApp(clientPhone, receiptMessage);
                  toast.success('Abriendo WhatsApp...');
                } catch (error: any) {
                  console.error('Error abriendo WhatsApp:', error);
                  toast.error(error.message || 'Error al abrir WhatsApp');
                }

                setShowWhatsAppDialog(false);
                setShowPaymentForm(false);
                setSelectedTransaction(null);
                resetPaymentForm();
                fetchData();
              }}
            >
              Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PawnShopModule;
