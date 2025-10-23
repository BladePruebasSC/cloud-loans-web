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
import { formatDateTimeWithOffset } from '@/utils/dateUtils';
import { 
  DollarSign, 
  Plus, 
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
  Download
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
  status: 'active' | 'redeemed' | 'forfeited' | 'extended';
  notes: string | null;
  created_at: string;
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
  payment_type: 'partial' | 'full' | 'interest';
  notes: string | null;
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

export const PawnShopModule = () => {
  const [transactions, setTransactions] = useState<PawnTransaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showTransactionDetails, setShowTransactionDetails] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<PawnTransaction | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PawnPayment[]>([]);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    client_id: '',
    product_id: '',
    product_name: '',
    product_description: '',
    estimated_value: 0,
    loan_amount: 0,
    interest_rate: 5.0,
    interest_rate_type: 'monthly' as 'monthly' | 'annual' | 'daily' | 'weekly' | 'biweekly' | 'quarterly' | 'yearly',
    period_days: 60,
    due_date: '',
    notes: ''
  });

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    payment_type: 'partial' as 'partial' | 'full' | 'interest',
    notes: ''
  });

  const [saleData, setSaleData] = useState({
    product_id: '',
    customer_name: 'Cliente General',
    customer_phone: '',
    customer_email: '',
    customer_rnc: '',
    customer_address: '',
    quantity: 1,
    unit_price: 0,
    total_price: 0,
    payment_method: 'cash' as 'cash' | 'card' | 'transfer' | 'check',
    sale_type: 'cash' as 'cash' | 'credit',
    ncf_type: '01' as '01' | '02' | '03' | '04' | '14' | '15',
    ncf_number: '',
    notes: ''
  });

  const [quickSaleMode, setQuickSaleMode] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [saleType, setSaleType] = useState<'cash' | 'credit'>('cash');
  
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

  // Filtrar productos para búsqueda
  useEffect(() => {
    if (productSearchTerm.trim() === '') {
      setFilteredProducts(products.filter(p => p.current_stock > 0));
    } else {
      setFilteredProducts(
        products.filter(p => 
          p.current_stock > 0 && 
          p.name.toLowerCase().includes(productSearchTerm.toLowerCase())
        )
      );
    }
  }, [products, productSearchTerm]);

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

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [transactionsRes, clientsRes, productsRes] = await Promise.all([
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
           .order('name')
      ]);

      if (transactionsRes.error) throw transactionsRes.error;
      if (clientsRes.error) throw clientsRes.error;
      if (productsRes.error) throw productsRes.error;

      setTransactions(transactionsRes.data || []);
      setClients(clientsRes.data || []);
      setProducts(productsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const transactionData = {
        user_id: user.id,
        client_id: formData.client_id,
        product_id: formData.product_id || null,
        product_name: formData.product_name,
        product_description: formData.product_description,
        estimated_value: formData.estimated_value,
        loan_amount: formData.loan_amount,
        interest_rate: formData.interest_rate,
        interest_rate_type: formData.interest_rate_type,
        period_days: formData.period_days,
        due_date: formData.due_date,
        notes: formData.notes,
        status: 'active'
      };

      const { error } = await supabase
        .from('pawn_transactions')
        .insert([transactionData]);

      if (error) throw error;

      toast.success('Transacción creada exitosamente');
      setShowTransactionForm(false);
      resetForm();
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
      const payment = {
        pawn_transaction_id: selectedTransaction.id,
        amount: paymentData.amount,
        payment_type: paymentData.payment_type,
        notes: paymentData.notes
      };

      const { error: paymentError } = await supabase
        .from('pawn_payments')
        .insert([payment]);

      if (paymentError) throw paymentError;

      // Update transaction status if full payment
      if (paymentData.payment_type === 'full') {
        const { error: updateError } = await supabase
          .from('pawn_transactions')
          .update({ status: 'redeemed' })
          .eq('id', selectedTransaction.id);

        if (updateError) throw updateError;
      }

      toast.success('Pago registrado exitosamente');
      setShowPaymentForm(false);
      setSelectedTransaction(null);
      resetPaymentForm();
      fetchData();
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
          const inventoryProduct = {
            user_id: user.id,
            name: transaction.product_name,
            description: transaction.product_description || '',
            current_stock: 1,
            status: 'active',
            source: 'pawn_forfeited',
            original_transaction_id: transactionId
          };

          const { error: inventoryError } = await supabase
            .from('products')
            .insert([inventoryProduct]);

          if (inventoryError) {
            console.error('Error adding to inventory:', inventoryError);
            // Si el error es por columnas faltantes, intentar sin los campos opcionales
            if (inventoryError.code === 'PGRST204') {
              const basicInventoryProduct = {
                user_id: user.id,
                name: transaction.product_name,
                description: transaction.product_description || '',
                current_stock: 1,
                status: 'active'
              };
              
              const { error: basicError } = await supabase
                .from('products')
                .insert([basicInventoryProduct]);
                
              if (basicError) {
                console.error('Error adding basic product to inventory:', basicError);
                toast.error('Error al agregar producto al inventario');
                return;
              }
              
              toast.success('Producto agregado al inventario (sin campos adicionales)');
            } else {
              toast.error('Error al agregar producto al inventario');
              return;
            }
          } else {
            toast.success('Producto agregado al inventario como perdido');
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

  const resetForm = () => {
    setFormData({
      client_id: '',
      product_id: '',
      product_name: '',
      product_description: '',
      estimated_value: 0,
      loan_amount: 0,
      interest_rate: 5.0,
      interest_rate_type: 'monthly',
      period_days: 60,
      due_date: '',
      notes: ''
    });
    setClientSearch('');
    setSelectedClient(null);
    setShowClientDropdown(false);
  };

  const calculateDueDate = (periodDays: number) => {
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(today.getDate() + periodDays);
    return dueDate.toISOString().split('T')[0];
  };

  const handlePeriodChange = (periodDays: number) => {
    const newDueDate = calculateDueDate(periodDays);
    setFormData({
      ...formData,
      period_days: periodDays,
      due_date: newDueDate
    });
  };

  const resetPaymentForm = () => {
    setPaymentData({
      amount: 0,
      payment_type: 'partial',
      notes: ''
    });
  };

  const resetSaleForm = () => {
    setSaleData({
      product_id: '',
      customer_name: 'Cliente General',
      customer_phone: '',
      customer_email: '',
      customer_rnc: '',
      customer_address: '',
      quantity: 1,
      unit_price: 0,
      total_price: 0,
      payment_method: 'cash',
      sale_type: 'cash',
      ncf_type: '01',
      ncf_number: '',
      notes: ''
    });
    setSelectedProduct(null);
    setQuickSaleMode(false);
    setSaleType('cash');
    setProductSearchTerm('');
  };

  const handleQuickSale = (product: Product) => {
    setSelectedProduct(product);
    setSaleData({
      ...saleData,
      product_id: product.id,
      unit_price: 0, // Usuario puede ingresar precio
      total_price: 0
    });
    setQuickSaleMode(true);
    setSaleType('cash'); // Por defecto venta al contado
  };

  const handleQuickSaleSubmit = async () => {
    if (!selectedProduct || !user) return;

    try {
      const saleRecord = {
        user_id: user.id,
        product_id: selectedProduct.id,
        customer_name: saleData.customer_name,
        customer_phone: saleData.customer_phone || '',
        customer_email: saleData.customer_email || '',
        customer_rnc: saleData.customer_rnc || '',
        customer_address: saleData.customer_address || '',
        quantity: saleData.quantity,
        unit_price: saleData.unit_price,
        total_price: saleData.total_price,
        payment_method: saleData.payment_method,
        sale_type: saleType,
        notes: saleData.notes,
        sale_date: new Date().toISOString()
      };

      const { error: saleError } = await supabase
        .from('sales')
        .insert([saleRecord]);

      if (saleError) {
        console.error('Error creating sale:', saleError);
        if (saleError.code === 'PGRST204' || saleError.message.includes('relation "sales" does not exist')) {
          toast.error('La tabla de ventas no está disponible. Ejecute las migraciones primero.');
          return;
        }
        throw saleError;
      }

      // Actualizar stock
      const { error: stockError } = await supabase
        .from('products')
        .update({ 
          current_stock: selectedProduct.current_stock - saleData.quantity 
        })
        .eq('id', selectedProduct.id);

      if (stockError) throw stockError;

      toast.success(`Venta registrada: ${selectedProduct.name} x${saleData.quantity}`);
      resetSaleForm();
      fetchData();
    } catch (error) {
      console.error('Error creating quick sale:', error);
      toast.error('Error al registrar venta');
    }
  };

  const handleSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Crear el registro de venta
      const saleRecord = {
        user_id: user.id,
        product_id: saleData.product_id,
        customer_name: saleData.customer_name,
        customer_phone: saleData.customer_phone,
        customer_email: saleData.customer_email,
        customer_rnc: saleData.customer_rnc || '',
        customer_address: saleData.customer_address || '',
        quantity: saleData.quantity,
        unit_price: saleData.unit_price,
        total_price: saleData.total_price,
        payment_method: saleData.payment_method,
        sale_type: saleData.sale_type,
        ncf_type: saleData.ncf_type,
        ncf_number: saleData.ncf_number,
        notes: saleData.notes,
        sale_date: new Date().toISOString()
      };

      const { error: saleError } = await supabase
        .from('sales')
        .insert([saleRecord]);

      if (saleError) {
        console.error('Error creating sale:', saleError);
        // Si la tabla sales no existe, mostrar mensaje informativo
        if (saleError.code === 'PGRST204' || saleError.message.includes('relation "sales" does not exist')) {
          toast.error('La tabla de ventas no está disponible. Ejecute las migraciones primero.');
          return;
        }
        throw saleError;
      }

      // Actualizar el stock del producto
      const { error: stockError } = await supabase
        .from('products')
        .update({ 
          current_stock: products.find(p => p.id === saleData.product_id)?.current_stock - saleData.quantity 
        })
        .eq('id', saleData.product_id);

      if (stockError) throw stockError;

      toast.success('Venta registrada exitosamente');
      setShowSaleForm(false);
      resetSaleForm();
      fetchData();
    } catch (error) {
      console.error('Error creating sale:', error);
      toast.error('Error al registrar venta');
    }
  };

  const fetchPaymentHistory = async (transactionId: string) => {
    try {
      const { data, error } = await supabase
        .from('pawn_payments')
        .select('*')
        .eq('pawn_transaction_id', transactionId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setPaymentHistory(data || []);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      toast.error('Error al cargar historial de pagos');
    }
  };

  const generateReceiptHTML = (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
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
            <span class="info-label">Valor Estimado:</span>
            <span>${formatCurrency(Number(transaction.estimated_value))}</span>
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

  const printReceipt = (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = generateReceiptHTML(payment, transaction, format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = (payment: PawnPayment, transaction: PawnTransaction, format: string = 'LETTER') => {
    const receiptHTML = generateReceiptHTML(payment, transaction, format);
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
      case 'extended':
        return <Badge className="bg-yellow-500"><AlertCircle className="h-3 w-3 mr-1" /> Extendido</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Casa de Empeño</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setShowTransactionForm(true)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Transacción
          </Button>
          <Button onClick={() => setShowSaleForm(true)} variant="outline" className="w-full sm:w-auto">
            <DollarSign className="h-4 w-4 mr-2" />
            Punto de Venta
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
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
          <TabsTrigger value="ventas">Punto de Venta</TabsTrigger>
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
                    <SelectItem value="extended">Extendido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Transactions List */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Transacciones ({filteredTransactions.filter(t => t.status === 'active').length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando transacciones...</div>
              ) : filteredTransactions.filter(t => t.status === 'active').length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay transacciones activas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredTransactions.filter(t => t.status === 'active').map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{transaction.product_name}</h3>
                            {getStatusBadge(transaction.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span><strong>Cliente:</strong> {transaction.clients?.full_name || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <DollarSign className="h-4 w-4" />
                              <span><strong>Préstamo:</strong> ${Number(transaction.loan_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              <span><strong>Valor Estimado:</strong> ${Number(transaction.estimated_value).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span><strong>Vencimiento:</strong> {formatDateTimeWithOffset(transaction.due_date)}</span>
                            </div>
                            <div>
                              <span><strong>Interés:</strong> {transaction.interest_rate}%</span>
                            </div>
                            <div>
                              <span><strong>Inicio:</strong> {formatDateTimeWithOffset(transaction.start_date)}</span>
                            </div>
                          </div>
                          {transaction.product_description && (
                            <p className="text-sm text-gray-500 mt-2">{transaction.product_description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setShowPaymentForm(true);
                          }}
                        >
                          Registrar Pago
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            setShowTransactionDetails(true);
                          }}
                        >
                          <Package className="h-4 w-4 mr-1" />
                          Detalles
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedTransaction(transaction);
                            fetchPaymentHistory(transaction.id);
                            setShowPaymentHistory(true);
                          }}
                        >
                          <History className="h-4 w-4 mr-1" />
                          Historial
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleStatusChange(transaction.id, 'extended')}
                        >
                          Extender
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => handleStatusChange(transaction.id, 'forfeited')}
                        >
                          Marcar como Perdido
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="todas">
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <span>Extendidas:</span>
                    <span className="font-semibold text-yellow-600">
                      {transactions.filter(t => t.status === 'extended').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ventas">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Punto de Venta - República Dominicana
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Barra de búsqueda */}
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Buscar producto por nombre..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {productSearchTerm && (
                  <p className="text-sm text-gray-600 mt-2">
                    {filteredProducts.length} producto(s) encontrado(s)
                  </p>
                )}
              </div>

              {loading ? (
                <div className="text-center py-8">Cargando productos...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    {productSearchTerm 
                      ? `No se encontraron productos que coincidan con "${productSearchTerm}"`
                      : "No hay productos disponibles para la venta"
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1 line-clamp-2">{product.name}</h3>
                          <p className="text-sm text-gray-600">Stock: {product.current_stock}</p>
                        </div>
                        <Badge className="bg-green-500 text-white">Disponible</Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          onClick={() => handleQuickSale(product)}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          <DollarSign className="h-4 w-4 mr-1" />
                          Vender
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction Form Dialog */}
      <Dialog open={showTransactionForm} onOpenChange={setShowTransactionForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Transacción de Empeño</DialogTitle>
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
                <Label htmlFor="product_id">Producto del Inventario (Opcional)</Label>
                <Select value={formData.product_id || "none"} onValueChange={(value) => {
                  if (value === "none") {
                    setFormData({
                      ...formData, 
                      product_id: '',
                      product_name: ''
                    });
                  } else {
                    const product = products.find(p => p.id === value);
                    setFormData({
                      ...formData, 
                      product_id: value,
                      product_name: product?.name || ''
                    });
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar producto (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguno</SelectItem>
                    {products.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} (Stock: {product.current_stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <Label htmlFor="interest_rate">Tasa de Interés (%) *</Label>
                <Input
                  id="interest_rate"
                  type="number"
                  step="0.01"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({...formData, interest_rate: parseFloat(e.target.value)})}
                  required
                />
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
                <Select 
                  value={formData.period_days.toString()} 
                  onValueChange={(value) => handlePeriodChange(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 días</SelectItem>
                    <SelectItem value="60">60 días</SelectItem>
                    <SelectItem value="90">90 días</SelectItem>
                    <SelectItem value="120">120 días</SelectItem>
                    <SelectItem value="180">180 días</SelectItem>
                    <SelectItem value="365">365 días</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="due_date">Fecha de Vencimiento *</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
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

      {/* Payment Form Dialog */}
      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          {selectedTransaction && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <p><strong>Artículo:</strong> {selectedTransaction.product_name}</p>
              <p><strong>Cliente:</strong> {selectedTransaction.clients?.full_name}</p>
              <p><strong>Monto prestado:</strong> ${Number(selectedTransaction.loan_amount).toLocaleString()}</p>
            </div>
          )}
          <form onSubmit={handlePayment} className="space-y-4">
            <div>
              <Label htmlFor="amount">Monto del Pago *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={paymentData.amount}
                onChange={(e) => setPaymentData({...paymentData, amount: parseFloat(e.target.value)})}
                required
              />
            </div>

            <div>
              <Label htmlFor="payment_type">Tipo de Pago *</Label>
              <Select 
                value={paymentData.payment_type} 
                onValueChange={(value: 'partial' | 'full' | 'interest') => 
                  setPaymentData({...paymentData, payment_type: value})
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="partial">Pago Parcial</SelectItem>
                  <SelectItem value="full">Pago Completo (Redimir)</SelectItem>
                  <SelectItem value="interest">Solo Interés</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowPaymentForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">Registrar Pago</Button>
            </div>
          </form>
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
                    <Receipt className="h-5 w-5" />
                    Historial de Pagos ({paymentHistory.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {paymentHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No hay pagos registrados</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {paymentHistory.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="font-semibold text-lg">
                                  ${Number(payment.amount).toLocaleString()}
                                </h3>
                                <Badge className={
                                  payment.payment_type === 'full' ? 'bg-green-500' :
                                  payment.payment_type === 'partial' ? 'bg-blue-500' :
                                  'bg-yellow-500'
                                }>
                                  {payment.payment_type === 'full' ? 'Completo' :
                                   payment.payment_type === 'partial' ? 'Parcial' : 'Interés'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
                                <div><strong>Fecha:</strong> {formatDateTimeWithOffset(payment.payment_date)}</div>
                                <div><strong>Tipo:</strong> {
                                  payment.payment_type === 'full' ? 'Pago Completo (Redención)' :
                                  payment.payment_type === 'partial' ? 'Pago Parcial' : 'Solo Interés'
                                }</div>
                                {payment.notes && (
                                  <div className="md:col-span-2">
                                    <strong>Notas:</strong> {payment.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2 flex-wrap">
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
                          </div>
                        </div>
                      ))}
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
                          ${(Number(selectedTransaction.estimated_value) - Number(selectedTransaction.loan_amount)).toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-600">Margen de Seguridad:</span>
                        <div className="text-lg font-semibold">
                          {((Number(selectedTransaction.estimated_value) - Number(selectedTransaction.loan_amount)) / Number(selectedTransaction.estimated_value) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
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
              <div className="flex gap-2 flex-wrap justify-center">
                <Button 
                  onClick={() => {
                    setShowTransactionDetails(false);
                    setSelectedTransaction(selectedTransaction);
                    setShowPaymentForm(true);
                  }}
                >
                  Registrar Pago
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => {
                    setShowTransactionDetails(false);
                    setSelectedTransaction(selectedTransaction);
                    fetchPaymentHistory(selectedTransaction.id);
                    setShowPaymentHistory(true);
                  }}
                >
                  <History className="h-4 w-4 mr-2" />
                  Ver Historial
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleStatusChange(selectedTransaction.id, 'extended')}
                >
                  Extender Plazo
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleStatusChange(selectedTransaction.id, 'forfeited')}
                >
                  Marcar como Perdido
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Sale Form Dialog */}
      <Dialog open={showSaleForm} onOpenChange={setShowSaleForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Punto de Venta
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="product_id">Producto a Vender *</Label>
                <div className="relative">
                  <Input
                    placeholder="Buscar producto por nombre..."
                    value={productSearchTerm}
                    onChange={(e) => setProductSearchTerm(e.target.value)}
                    className="w-full"
                  />
                  
                  {productSearchTerm && filteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                          onClick={() => {
                            setSaleData({
                              ...saleData, 
                              product_id: product.id,
                              unit_price: 0,
                              total_price: 0
                            });
                            setProductSearchTerm(product.name);
                          }}
                        >
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-600">Stock: {product.current_stock}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label htmlFor="customer_name">Nombre del Cliente *</Label>
                <Input
                  id="customer_name"
                  value={saleData.customer_name}
                  onChange={(e) => setSaleData({...saleData, customer_name: e.target.value})}
                  placeholder="Nombre completo"
                  required
                />
              </div>

              <div>
                <Label htmlFor="customer_phone">Teléfono</Label>
                <Input
                  id="customer_phone"
                  value={saleData.customer_phone}
                  onChange={(e) => setSaleData({...saleData, customer_phone: e.target.value})}
                  placeholder="Número de teléfono"
                />
              </div>

              <div>
                <Label htmlFor="customer_email">Email</Label>
                <Input
                  id="customer_email"
                  type="email"
                  value={saleData.customer_email}
                  onChange={(e) => setSaleData({...saleData, customer_email: e.target.value})}
                  placeholder="correo@ejemplo.com"
                />
              </div>

              <div>
                <Label htmlFor="quantity">Cantidad *</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  max={products.find(p => p.id === saleData.product_id)?.current_stock || 1}
                  value={saleData.quantity}
                  onChange={(e) => {
                    const quantity = parseInt(e.target.value) || 1;
                    setSaleData({
                      ...saleData, 
                      quantity,
                      total_price: quantity * saleData.unit_price
                    });
                  }}
                  required
                />
              </div>

              <div>
                <Label htmlFor="unit_price">Precio Unitario *</Label>
                <Input
                  id="unit_price"
                  type="number"
                  step="0.01"
                  value={saleData.unit_price}
                  onChange={(e) => {
                    const unitPrice = parseFloat(e.target.value) || 0;
                    setSaleData({
                      ...saleData, 
                      unit_price: unitPrice,
                      total_price: saleData.quantity * unitPrice
                    });
                  }}
                  required
                />
              </div>

              <div>
                <Label htmlFor="total_price">Total</Label>
                <Input
                  id="total_price"
                  type="number"
                  step="0.01"
                  value={saleData.total_price}
                  readOnly
                  className="bg-gray-50"
                />
              </div>

              <div>
                <Label>Tipo de Venta *</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={saleData.sale_type === 'cash' ? 'default' : 'outline'}
                    onClick={() => setSaleData({...saleData, sale_type: 'cash'})}
                    className="flex-1"
                  >
                    💵 Contado
                  </Button>
                  <Button
                    type="button"
                    variant={saleData.sale_type === 'credit' ? 'default' : 'outline'}
                    onClick={() => setSaleData({...saleData, sale_type: 'credit'})}
                    className="flex-1"
                  >
                    📋 Crédito
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="payment_method">Método de Pago *</Label>
                <Select 
                  value={saleData.payment_method} 
                  onValueChange={(value: 'cash' | 'card' | 'transfer' | 'check') => 
                    setSaleData({...saleData, payment_method: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="card">Tarjeta</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                    <SelectItem value="check">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {saleData.sale_type === 'credit' && (
                <>
                  <div>
                    <Label htmlFor="customer_rnc">RNC del Cliente *</Label>
                    <Input
                      id="customer_rnc"
                      value={saleData.customer_rnc}
                      onChange={(e) => setSaleData({...saleData, customer_rnc: e.target.value})}
                      placeholder="123456789"
                      required={saleData.sale_type === 'credit'}
                    />
                  </div>

                  <div>
                    <Label htmlFor="customer_address">Dirección del Cliente</Label>
                    <Input
                      id="customer_address"
                      value={saleData.customer_address}
                      onChange={(e) => setSaleData({...saleData, customer_address: e.target.value})}
                      placeholder="Dirección completa"
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="ncf_type">Tipo de NCF *</Label>
                <Select 
                  value={saleData.ncf_type} 
                  onValueChange={(value: '01' | '02' | '03' | '04' | '14' | '15') => 
                    setSaleData({...saleData, ncf_type: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="01">01 - Factura de Venta</SelectItem>
                    <SelectItem value="02">02 - Nota de Débito</SelectItem>
                    <SelectItem value="03">03 - Nota de Crédito</SelectItem>
                    <SelectItem value="04">04 - Comprobante de Pago</SelectItem>
                    <SelectItem value="14">14 - Factura de Exportación</SelectItem>
                    <SelectItem value="15">15 - Factura de Importación</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="ncf_number">Número de NCF</Label>
                <Input
                  id="ncf_number"
                  value={saleData.ncf_number}
                  onChange={(e) => setSaleData({...saleData, ncf_number: e.target.value})}
                  placeholder="B0100000001"
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="sale_notes">Notas</Label>
                <Textarea
                  id="sale_notes"
                  value={saleData.notes}
                  onChange={(e) => setSaleData({...saleData, notes: e.target.value})}
                  placeholder="Notas adicionales de la venta..."
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowSaleForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                Registrar Venta
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Quick Sale Modal */}
      <Dialog open={quickSaleMode} onOpenChange={setQuickSaleMode}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Venta Rápida - República Dominicana
            </DialogTitle>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold">{selectedProduct.name}</h3>
                <p className="text-sm text-gray-600">Stock disponible: {selectedProduct.current_stock}</p>
              </div>

              {/* Tipo de Venta */}
              <div>
                <Label>Tipo de Venta</Label>
                <div className="flex gap-2 mt-2">
                  <Button
                    type="button"
                    variant={saleType === 'cash' ? 'default' : 'outline'}
                    onClick={() => setSaleType('cash')}
                    className="flex-1"
                  >
                    💵 Contado
                  </Button>
                  <Button
                    type="button"
                    variant={saleType === 'credit' ? 'default' : 'outline'}
                    onClick={() => setSaleType('credit')}
                    className="flex-1"
                  >
                    📋 Crédito
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quick_quantity">Cantidad</Label>
                  <Input
                    id="quick_quantity"
                    type="number"
                    min="1"
                    max={selectedProduct.current_stock}
                    value={saleData.quantity}
                    onChange={(e) => {
                      const quantity = parseInt(e.target.value) || 1;
                      setSaleData({
                        ...saleData, 
                        quantity,
                        total_price: quantity * saleData.unit_price
                      });
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="quick_price">Precio Unitario (RD$)</Label>
                  <Input
                    id="quick_price"
                    type="number"
                    step="0.01"
                    value={saleData.unit_price}
                    onChange={(e) => {
                      const unitPrice = parseFloat(e.target.value) || 0;
                      setSaleData({
                        ...saleData, 
                        unit_price: unitPrice,
                        total_price: saleData.quantity * unitPrice
                      });
                    }}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="quick_total">Total (RD$)</Label>
                <Input
                  id="quick_total"
                  type="number"
                  step="0.01"
                  value={saleData.total_price}
                  readOnly
                  className="bg-gray-50 font-semibold text-lg"
                />
              </div>

              {/* Información del Cliente */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-gray-700">Información del Cliente</h4>
                
                <div>
                  <Label htmlFor="quick_customer">Nombre del Cliente</Label>
                  <Input
                    id="quick_customer"
                    value={saleData.customer_name}
                    onChange={(e) => setSaleData({...saleData, customer_name: e.target.value})}
                    placeholder="Cliente General"
                  />
                </div>

                {saleType === 'credit' && (
                  <>
                    <div>
                      <Label htmlFor="quick_rnc">RNC (Obligatorio para crédito)</Label>
                      <Input
                        id="quick_rnc"
                        value={saleData.customer_rnc}
                        onChange={(e) => setSaleData({...saleData, customer_rnc: e.target.value})}
                        placeholder="123456789"
                        required={saleType === 'credit'}
                      />
                    </div>

                    <div>
                      <Label htmlFor="quick_address">Dirección</Label>
                      <Input
                        id="quick_address"
                        value={saleData.customer_address}
                        onChange={(e) => setSaleData({...saleData, customer_address: e.target.value})}
                        placeholder="Dirección del cliente"
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="quick_phone">Teléfono</Label>
                  <Input
                    id="quick_phone"
                    value={saleData.customer_phone}
                    onChange={(e) => setSaleData({...saleData, customer_phone: e.target.value})}
                    placeholder="(809) 123-4567"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="quick_payment">Método de Pago</Label>
                <Select 
                  value={saleData.payment_method} 
                  onValueChange={(value: 'cash' | 'card' | 'transfer' | 'check') => 
                    setSaleData({...saleData, payment_method: value})
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Efectivo</SelectItem>
                    <SelectItem value="card">💳 Tarjeta</SelectItem>
                    <SelectItem value="transfer">🏦 Transferencia</SelectItem>
                    <SelectItem value="check">📝 Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setQuickSaleMode(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleQuickSaleSubmit}
                  disabled={
                    saleData.unit_price <= 0 || 
                    saleData.quantity <= 0 ||
                    (saleType === 'credit' && !saleData.customer_rnc.trim())
                  }
                  className="flex-1"
                >
                  <DollarSign className="h-4 w-4 mr-2" />
                  {saleType === 'credit' ? 'Vender a Crédito' : 'Vender'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PawnShopModule;
