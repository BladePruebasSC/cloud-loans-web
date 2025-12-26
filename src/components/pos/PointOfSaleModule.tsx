import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { generateSaleReceipt, openWhatsApp } from '@/utils/whatsappReceipt';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  DollarSign, 
  Search, 
  Package,
  ShoppingCart,
  Receipt,
  Printer,
  Download,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle,
  Percent,
  Calculator,
  User,
  Calendar,
  FileText,
  Settings,
  Zap,
  TrendingUp,
  Clock,
  AlertCircle,
  X,
  MessageCircle
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  current_stock: number;
  description?: string;
  purchase_price?: number;
  selling_price?: number;
  category?: string;
  sku?: string;
  brand?: string;
  unit_type?: string;
  min_stock?: number;
  status?: string;
  itbis_rate?: number | null;
}

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discountPercent: number; // porcentaje por ítem
  subtotal: number;
}

interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  rnc?: string;
  address?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  icon: React.ReactNode;
  type: 'cash' | 'card' | 'transfer' | 'check' | 'financing';
}

interface PaymentDetails {
  // Tarjeta
  cardType?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
  cardLast4?: string;
  cardHolderName?: string;
  
  // Transferencia
  bankName?: string;
  accountNumber?: string;
  referenceNumber?: string;
  
  // Cheque
  checkNumber?: string;
  checkBank?: string;
  checkDate?: string;
  
  // Financiamiento
  financingMonths?: number;
  financingRate?: number;
  amortizationType?: 'simple' | 'french' | 'german' | 'american';
  paymentFrequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  lateFeeEnabled?: boolean;
  lateFeeRate?: number;
  gracePeriodDays?: number;
}

interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  details?: PaymentDetails;
}

interface SaleData {
  customer: Customer | null;
  items: CartItem[];
  subtotal: number;
  discount: number; // monto total de descuento aplicado
  tax: number;
  total: number;
  paymentMethod: PaymentMethod | null; // Mantener para compatibilidad
  paymentAmount: number; // Mantener para compatibilidad
  change: number;
  paymentSplits: PaymentSplit[]; // Nuevo: múltiples métodos de pago
  ncfType: string;
  ncfNumber: string;
  notes: string;
  saleType: 'cash' | 'credit' | 'financing';
  financingMonths?: number;
  financingRate?: number;
  discountMode?: 'item' | 'total';
  discountPercentTotal?: number; // % aplicado al total cuando discountMode = 'total'
  paymentDetails?: PaymentDetails;
}

export const PointOfSaleModule = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  // Inicializar carrito desde localStorage si existe
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const savedCart = localStorage.getItem('pos_cart');
      if (savedCart) {
        return JSON.parse(savedCart);
      }
    } catch (error) {
      console.error('Error loading cart from localStorage:', error);
    }
    return [];
  });
  
  // Guardar carrito en localStorage cada vez que cambie (solo si no está vacío o si se está limpiando explícitamente)
  useEffect(() => {
    try {
      if (cart.length === 0) {
        // Si el carrito está vacío, asegurarse de que localStorage también esté vacío
        localStorage.removeItem('pos_cart');
      } else {
      localStorage.setItem('pos_cart', JSON.stringify(cart));
      }
    } catch (error) {
      console.error('Error saving cart to localStorage:', error);
    }
  }, [cart]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState<SaleData | null>(null); // Datos de la venta para el recibo
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientData, setNewClientData] = useState({
    full_name: '',
    dni: '',
    phone: '',
    email: '',
    address: ''
  });
  const [receiptFormat, setReceiptFormat] = useState<'A4' | 'POS80' | 'POS58'>('POS80');
  // Inicializar cliente seleccionado desde localStorage si existe
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(() => {
    try {
      const savedCustomer = localStorage.getItem('pos_selected_customer');
      if (savedCustomer) {
        return JSON.parse(savedCustomer);
      }
    } catch (error) {
      console.error('Error loading selected customer from localStorage:', error);
    }
    return null;
  });
  
  // Eliminar financiamiento si el cliente cambia a "Cliente General"
  useEffect(() => {
    if (selectedCustomer?.full_name === 'Cliente General' || !selectedCustomer) {
      // Si hay métodos de pago con financiamiento, eliminarlos
      const hasFinancing = saleData.paymentSplits.some(split => split.method.type === 'financing');
      if (hasFinancing) {
        setSaleData(prev => ({
          ...prev,
          paymentSplits: prev.paymentSplits.filter(split => split.method.type !== 'financing')
        }));
        toast.warning('Se eliminó el método de pago "Financiamiento" porque requiere un cliente específico.');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer]);

  // Guardar cliente seleccionado en localStorage cada vez que cambie
  useEffect(() => {
    try {
      if (selectedCustomer) {
        localStorage.setItem('pos_selected_customer', JSON.stringify(selectedCustomer));
      } else {
        localStorage.removeItem('pos_selected_customer');
      }
    } catch (error) {
      console.error('Error saving selected customer to localStorage:', error);
    }
  }, [selectedCustomer]);

  // Sincronizar selectedCustomer con saleData.customer cuando se abre el modal de pago
  useEffect(() => {
    if (showPaymentModal && selectedCustomer && (!saleData.customer || saleData.customer.id !== selectedCustomer.id)) {
      setSaleData(prev => ({ ...prev, customer: selectedCustomer }));
    }
  }, [showPaymentModal, selectedCustomer]);

  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const { user, companyId, companySettings } = useAuth();
  const [companyInfo, setCompanyInfo] = useState({
    company_name: 'Cloud Loans',
    address: 'Dirección de la empresa',
    phone: 'Tel.: 000-000-0000',
    email: 'info@empresa.com'
  });

  const [saleData, setSaleData] = useState<SaleData>({
    customer: null,
    items: [],
    subtotal: 0,
    discount: 0,
    tax: 0,
    total: 0,
    paymentMethod: null,
    paymentAmount: 0,
    change: 0,
    paymentSplits: [],
    ncfType: '01',
    ncfNumber: '',
    notes: '',
    saleType: 'cash',
    financingMonths: 0, // Se inicializará con companySettings
    financingRate: 0, // Se inicializará con companySettings
    discountMode: 'item',
    discountPercentTotal: 0,
    paymentDetails: {}
  });

  const paymentMethods: PaymentMethod[] = [
    { id: 'cash', name: 'Efectivo', icon: <Banknote className="h-4 w-4" />, type: 'cash' },
    { id: 'card', name: 'Tarjeta', icon: <CreditCard className="h-4 w-4" />, type: 'card' },
    { id: 'transfer', name: 'Transferencia', icon: <Smartphone className="h-4 w-4" />, type: 'transfer' },
    { id: 'check', name: 'Cheque', icon: <FileText className="h-4 w-4" />, type: 'check' },
    { id: 'financing', name: 'Financiamiento', icon: <TrendingUp className="h-4 w-4" />, type: 'financing' }
  ];

  const ncfTypes = [
    { value: '01', label: '01 - Factura de Venta' },
    { value: '02', label: '02 - Nota de Débito' },
    { value: '03', label: '03 - Nota de Crédito' },
    { value: '04', label: '04 - Comprobante de Pago' },
    { value: '14', label: '14 - Factura de Exportación' },
    { value: '15', label: '15 - Factura de Importación' }
  ];

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  // Filtrar productos para búsqueda con cascada por nombre o código
  useEffect(() => {
    if (productSearchTerm.trim() === '') {
      setFilteredProducts(products.filter(p => p.current_stock > 0));
    } else {
      const searchTerm = productSearchTerm.toLowerCase().trim();
      
      // Búsqueda en cascada: primero coincidencias exactas, luego parciales
      const exactMatches = products.filter(p => 
        p.current_stock > 0 && (
          p.name.toLowerCase() === searchTerm ||
          (p.sku && p.sku.toLowerCase() === searchTerm)
        )
      );
      
      const startsWithMatches = products.filter(p => 
        p.current_stock > 0 && (
          (p.name.toLowerCase().startsWith(searchTerm) && p.name.toLowerCase() !== searchTerm) ||
          (p.sku && p.sku.toLowerCase().startsWith(searchTerm) && p.sku.toLowerCase() !== searchTerm)
        )
      );
      
      const containsMatches = products.filter(p => 
        p.current_stock > 0 && (
          (p.name.toLowerCase().includes(searchTerm) && !p.name.toLowerCase().startsWith(searchTerm)) ||
          (p.sku && p.sku.toLowerCase().includes(searchTerm) && !(p.sku.toLowerCase().startsWith(searchTerm)))
        )
      );
      
      // Combinar resultados en orden de prioridad
      setFilteredProducts([...exactMatches, ...startsWithMatches, ...containsMatches]);
    }
  }, [products, productSearchTerm]);

  // Filtrar clientes para búsqueda
  useEffect(() => {
    if (customerSearch.trim() === '') {
      setFilteredCustomers(customers);
    } else {
      setFilteredCustomers(
        customers.filter(c => 
          c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
          c.phone.includes(customerSearch) ||
          c.email?.toLowerCase().includes(customerSearch.toLowerCase())
        )
      );
    }
  }, [customers, customerSearch]);

  // Actualizar totales cuando cambia el carrito
  useEffect(() => {
    const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
    
    // Subtotal total: suma de todos los subtotales sin ITBIS (ya con descuentos por ítem aplicados)
    const subtotalBase = cart.reduce((sum, item) => sum + item.subtotal, 0);
    
    // Calcular descuento total
    let discountAmount = 0;
    if (saleData.discountMode === 'total') {
      // Si hay descuento total, calcular sobre el subtotal base + ITBIS calculado
      // Primero calcular ITBIS sin descuento total para tener el total bruto
      const totalTaxBeforeDiscount = cart.reduce((sum, item) => {
        // Calcular precio sin ITBIS a partir del precio con ITBIS
        const itbisRate = item.product.itbis_rate ?? 18;
        const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
        const baseAmount = priceWithoutTax * item.quantity;
        const discountedBase = baseAmount * (1 - (item.discountPercent || 0) / 100);
        const itemTax = discountedBase * (itbisRate / 100);
        return sum + itemTax;
      }, 0);
      const grossBeforeDiscount = subtotalBase + totalTaxBeforeDiscount;
      discountAmount = (grossBeforeDiscount * (saleData.discountPercentTotal || 0)) / 100;
    }

    // Calcular ITBIS por artículo usando el ITBIS rate específico de cada producto
    // ITBIS = (subtotal sin ITBIS del item * % ITBIS del producto)
    const totalTax = cart.reduce((sum, item) => {
      const itbisRate = item.product.itbis_rate ?? 18; // Porcentaje de ITBIS del producto
      // El subtotal del item ya tiene el descuento aplicado, calcular ITBIS sobre ese subtotal
      const itemTax = item.subtotal * (itbisRate / 100);
      return sum + itemTax;
    }, 0);

    // Si hay descuento total, aplicarlo proporcionalmente al ITBIS
    let finalTax = totalTax;
    let finalSubtotal = subtotalBase;
    if (saleData.discountMode === 'total' && saleData.discountPercentTotal) {
      // Aplicar descuento proporcional: subtotal y ITBIS se reducen proporcionalmente
      const totalBeforeDiscount = subtotalBase + totalTax;
      const discountRatio = discountAmount / totalBeforeDiscount;
      finalSubtotal = subtotalBase * (1 - discountRatio);
      finalTax = totalTax * (1 - discountRatio);
    }

    const total = finalSubtotal + finalTax;
    
    setSaleData(prev => ({
      ...prev,
      subtotal: round2(finalSubtotal),
      discount: round2(discountAmount),
      tax: round2(finalTax),
      total: round2(total),
      items: cart
    }));
  }, [cart, saleData.discountMode, saleData.discountPercentTotal]);

  // Función para obtener o crear cliente genérico
  const getOrCreateGenericClient = async (): Promise<Customer | null> => {
    try {
      // Buscar cliente genérico existente
      const { data: existingGeneric, error: searchError } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', user?.id)
        .eq('full_name', 'Cliente General')
        .eq('dni', '00000000000')
        .maybeSingle();

      if (searchError && searchError.code !== 'PGRST116') {
        console.error('Error buscando cliente genérico:', searchError);
        return null;
      }

      if (existingGeneric) {
        return {
          id: existingGeneric.id,
          full_name: existingGeneric.full_name,
          phone: existingGeneric.phone || '000-000-0000',
          email: existingGeneric.email || undefined,
          rnc: existingGeneric.rnc || undefined,
          address: existingGeneric.address || undefined
        };
      }

      // Crear cliente genérico si no existe
      const { data: newGeneric, error: createError } = await supabase
        .from('clients')
        .insert([{
          user_id: user?.id,
          full_name: 'Cliente General',
          phone: '000-000-0000',
          dni: '00000000000',
          status: 'active'
        }])
        .select()
        .single();

      if (createError) {
        console.error('Error creando cliente genérico:', createError);
        return null;
      }

      return {
        id: newGeneric.id,
        full_name: newGeneric.full_name,
        phone: newGeneric.phone || '000-000-0000',
        email: newGeneric.email || undefined,
        rnc: newGeneric.rnc || undefined,
        address: newGeneric.address || undefined
      };
    } catch (error) {
      console.error('Error en getOrCreateGenericClient:', error);
      return null;
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [productsRes, customersRes, companyRes] = await Promise.all([
        supabase
          .from('products')
          .select(`
            id, 
            name, 
            current_stock, 
            description, 
            purchase_price, 
            selling_price, 
            category,
            sku,
            brand,
            unit_type,
            min_stock,
            status,
            itbis_rate,
            created_at,
            updated_at
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gt('current_stock', 0) // Solo productos con stock disponible
          .order('name'),
        supabase
          .from('clients')
          .select('id, full_name, phone, email, address')
          .eq('user_id', user.id)
          .order('full_name')
      ,
        supabase
          .from('company_settings')
          .select('company_name,address,phone,email')
          .eq('user_id', companyId || user.id)
          .maybeSingle()
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      setProducts(productsRes.data || []);
      setCustomers(customersRes.data || []);
      
      // No establecer cliente genérico por defecto - el usuario debe seleccionar uno
      
      if (!companyRes.error && companyRes.data) {
        setCompanyInfo({
          company_name: companyRes.data.company_name || companyInfo.company_name,
          address: companyRes.data.address || companyInfo.address,
          phone: companyRes.data.phone || companyInfo.phone,
          email: companyRes.data.email || companyInfo.email
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    // Validar stock disponible
    if ((product.current_stock || 0) <= 0) {
      toast.error('Sin stock disponible');
      return;
    }
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      const desiredQty = existingItem.quantity + 1;
      if (desiredQty > (product.current_stock || 0)) {
        toast.error('No puedes exceder el stock disponible');
        return;
      }
      updateCartItemQuantity(product.id, desiredQty);
    } else {
      // unitPrice debe ser el precio CON ITBIS (para mostrar al usuario)
      const itbisRate = product.itbis_rate ?? 18;
      const priceWithoutTax = product.selling_price || 0;
      const priceWithTax = Math.round((priceWithoutTax * (1 + itbisRate / 100)) * 100) / 100;
      const newItem: CartItem = {
        id: `${product.id}-${Date.now()}`,
        product,
        quantity: 1,
        unitPrice: priceWithTax, // Precio CON ITBIS (para mostrar)
        discountPercent: 0,
        subtotal: priceWithoutTax // Subtotal SIN ITBIS (precio base × cantidad, sin descuento aún)
      };
      setCart([...cart, newItem]);
      toast.success(`${product.name} agregado al carrito`);
    }
  };

  const updateCartItemQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }

    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const maxQty = item.product.current_stock || 0;
        if (quantity > maxQty) {
          toast.error('Cantidad supera el stock disponible');
          return item;
        }
        // Calcular precio sin ITBIS a partir del precio con ITBIS
        const itbisRate = item.product.itbis_rate ?? 18;
        const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
        // Subtotal sin ITBIS: (precio sin ITBIS * cantidad) - descuento
        const baseAmount = priceWithoutTax * quantity;
        const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
        const subtotal = Math.max(0, discounted);
        return { ...item, quantity, subtotal };
      }
      return item;
    }));
  };

  const updateCartItemPrice = (productId: string, price: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const roundedPrice = Math.round((price || 0) * 100) / 100;
        // El precio ingresado se asume que es CON ITBIS
        // Calcular precio sin ITBIS a partir del precio con ITBIS
        const itbisRate = item.product.itbis_rate ?? 18;
        const priceWithoutTax = roundedPrice / (1 + itbisRate / 100);
        // Subtotal sin ITBIS: (precio sin ITBIS * cantidad) - descuento
        const baseAmount = priceWithoutTax * item.quantity;
        const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
        const subtotal = Math.max(0, discounted);
        return { ...item, unitPrice: roundedPrice, subtotal };
      }
      return item;
    }));
  };

  const updateCartItemDiscount = (productId: string, discountPercent: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const percent = Math.min(Math.max(discountPercent, 0), 100);
        // Calcular precio sin ITBIS a partir del precio con ITBIS
        const itbisRate = item.product.itbis_rate ?? 18;
        const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
        // Subtotal sin ITBIS: (precio sin ITBIS * cantidad) - descuento
        const baseAmount = priceWithoutTax * item.quantity;
        const discounted = baseAmount * (1 - percent / 100);
        const subtotal = Math.max(0, discounted);
        return { ...item, discountPercent: percent, subtotal };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
    toast.success('Producto eliminado del carrito');
  };

  const clearCart = (showToast = true) => {
    // Limpiar localStorage primero para evitar que se restaure
    try {
      localStorage.removeItem('pos_cart');
      localStorage.removeItem('pos_selected_customer');
    } catch (error) {
      console.error('Error clearing cart from localStorage:', error);
    }
    // Luego limpiar el estado
    setCart([]);
    setSelectedCustomer(null);
    setSaleData({
      customer: null,
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paymentMethod: null,
      paymentAmount: 0,
      change: 0,
      paymentSplits: [],
      ncfType: '01',
      ncfNumber: '',
      notes: '',
      saleType: 'cash',
      financingMonths: 0, // Se inicializará con companySettings
      financingRate: 0, // Se inicializará con companySettings
      discountMode: 'item',
      discountPercentTotal: 0,
      paymentDetails: {}
    });
    if (showToast) {
      toast.success('Carrito vaciado');
    }
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSaleData(prev => ({ ...prev, customer }));
    toast.success(`Cliente seleccionado: ${customer.full_name}`);
  };

  const processPayment = () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    // Validar que haya métodos de pago
    if (saleData.paymentSplits.length === 0) {
      toast.error('Debe agregar al menos un método de pago');
      return;
    }

    // Validar que todos los métodos de pago tengan un cliente
    if (!saleData.customer) {
      toast.error('Debe seleccionar un cliente para procesar la venta');
      return;
    }

    // Validar financiamiento primero
    const hasFinancing = saleData.paymentSplits.some(split => split.method.type === 'financing');
    const financingSplit = hasFinancing ? saleData.paymentSplits.find(split => split.method.type === 'financing') : null;
    
    // Validar que no se use financiamiento con Cliente General
    if (hasFinancing && (selectedCustomer?.full_name === 'Cliente General' || !selectedCustomer)) {
      toast.error('No se puede usar financiamiento con Cliente General. Debe seleccionar un cliente específico.');
      return;
    }
    
    if (hasFinancing) {
      const financingMonths = financingSplit?.details?.financingMonths || saleData.paymentDetails?.financingMonths || saleData.financingMonths;
      const financingRate = financingSplit?.details?.financingRate || saleData.paymentDetails?.financingRate || saleData.financingRate;
      
      if (!financingMonths || financingMonths < 1) {
        toast.error('Debe especificar un plazo válido para el financiamiento');
        return;
      }
      if (!financingRate || financingRate < 0) {
        toast.error('Debe especificar una tasa de interés válida para el financiamiento');
        return;
      }
    }

    // Validar datos de tarjeta si se selecciona método de pago con tarjeta
    const cardSplits = saleData.paymentSplits.filter(split => split.method.type === 'card');
    for (const cardSplit of cardSplits) {
      if (!cardSplit.details?.cardType) {
        toast.error('Debe especificar el tipo de tarjeta para el pago con tarjeta');
        return;
      }
      if (!cardSplit.details?.cardLast4 || cardSplit.details.cardLast4.length !== 4) {
        toast.error('Debe especificar los últimos 4 dígitos de la tarjeta');
        return;
      }
      if (!cardSplit.details?.cardHolderName) {
        toast.error('Debe especificar el nombre del titular de la tarjeta');
        return;
      }
    }

    // Validar que el total de los pagos sea suficiente (excluyendo financiamiento)
    const totalPaid = saleData.paymentSplits
      .filter(split => split.method.type !== 'financing')
      .reduce((sum, split) => sum + split.amount, 0);
    const financingAmount = financingSplit?.amount || 0;
    const totalPaidIncludingFinancing = totalPaid + financingAmount;
    const epsilon = 0.005; // tolerancia por redondeo a 2 decimales
    
    // Calcular pagos en efectivo y otros métodos
    const cashPayments = saleData.paymentSplits.filter(split => split.method.type === 'cash');
    const nonCashPayments = saleData.paymentSplits.filter(split => split.method.type !== 'cash' && split.method.type !== 'financing');
    const totalCashPaid = cashPayments.reduce((sum, split) => sum + split.amount, 0);
    const totalNonCashPaid = nonCashPayments.reduce((sum, split) => sum + split.amount, 0);
    
    // Si hay financiamiento, solo validar que los otros pagos + enganche (si hay) no excedan el total
    // Si no hay financiamiento, validar que el total pagado sea suficiente
    if (hasFinancing) {
      // Con financiamiento, el monto de financiamiento puede ser 0 (todo financiado) o un enganche
      if (totalPaidIncludingFinancing > saleData.total + epsilon) {
        toast.error('El monto pagado excede el total');
        return;
      }
    } else {
      // Sin financiamiento
      // Para métodos no efectivo, no pueden exceder el total
      if (totalNonCashPaid > saleData.total + epsilon) {
        toast.error('El monto pagado con métodos no efectivo excede el total');
        return;
      }
      // Para efectivo, puede ser mayor (para calcular cambio), pero los otros métodos deben cubrir su parte
      // El total pagado (efectivo + otros) debe ser al menos el total
      if (totalPaid + epsilon < saleData.total) {
      toast.error('El monto pagado es menor al total');
      return;
    }
    }
    
    // Calcular el cambio (solo para pagos en efectivo)
    // El cambio es la diferencia entre el efectivo pagado y el total (si el efectivo es mayor)
    const change = totalCashPaid > saleData.total ? totalCashPaid - saleData.total : 0;
    
    // Actualizar el cambio en saleData
    setSaleData(prev => ({ ...prev, change }));

    // Persistir venta en base de datos (sales + sale_details)
    const persistSale = async () => {
      let saleSaved = false;
      try {
          // Para financiamiento, usar 'cash' como payment_method y 'credit' como sale_type
          // (los constraints solo permiten valores específicos)
          const paymentMethod = saleData.paymentMethod?.type === 'financing' ? 'cash' : (saleData.paymentMethod?.id || 'cash');
          const saleType = saleData.paymentMethod?.type === 'financing' ? 'credit' : (saleData.saleType || 'cash');
        // Verificar stock en servidor antes de persistir
        const productIds = cart.map(ci => ci.product.id);
        const { data: latestProducts } = await supabase
          .from('products')
          .select('id,current_stock')
          .in('id', productIds);
        const idToStock = new Map((latestProducts || []).map(p => [p.id, p.current_stock]));
        for (const ci of cart) {
          const current = idToStock.get(ci.product.id);
          if (current === undefined || current < ci.quantity) {
            toast.error(`Stock insuficiente para ${ci.product.name}`);
            return;
          }
        }

        // Primero intentar esquema nuevo (con sale_details)
        try {
          const { data: saleInsert, error: saleError } = await supabase
            .from('sales')
            .insert([
              {
                user_id: user?.id,
                sale_date: new Date().toISOString().split('T')[0],
                total_amount: saleData.total,
                sale_number: `SALE-${Date.now()}`,
                payment_method: saleData.paymentMethod?.id || 'cash',
                status: 'completed',
                notes: saleData.notes || null,
                client_id: saleData.customer?.id || null
              }
            ])
            .select()
            .single();

          if (!saleError && saleInsert) {
            // Intentar insertar detalles
          const details = cart.map(ci => ({
            sale_id: saleInsert.id,
            product_id: ci.product.id,
            quantity: ci.quantity,
            unit_price: ci.unitPrice,
            total_price: ci.subtotal
          }));

          const { error: detailsError } = await supabase.from('sale_details').insert(details);
            if (!detailsError) {
              saleSaved = true;
              // Actualizar stock
              for (const ci of cart) {
                const newStock = Math.max(0, (idToStock.get(ci.product.id) || ci.product.current_stock || 0) - ci.quantity);
                await supabase
                  .from('products')
                  .update({ current_stock: newStock })
                  .eq('id', ci.product.id);
              }
            }
          }
        } catch (inner) {
          // Ignorar error, intentar esquema simple
        }

        // Si no se insertó con el esquema nuevo, usar esquema simple
        if (!saleSaved) {
          const customerName = saleData.customer?.full_name || 'Cliente General';
          
          // En el esquema simple, cada producto es una fila separada
          // Solo incluir campos que existen en la tabla
          const rows = cart.map(ci => {
            const row: any = {
            user_id: user?.id,
            product_id: ci.product.id,
            quantity: ci.quantity,
            unit_price: ci.unitPrice,
            total_price: ci.subtotal,
              customer_name: customerName,
              payment_method: paymentMethod,
              sale_type: saleType,
              sale_date: new Date().toISOString()
            };
            
            // Campos opcionales - solo agregar si tienen valor
            if (saleData.customer?.phone) row.customer_phone = saleData.customer.phone;
            if (saleData.customer?.email) row.customer_email = saleData.customer.email;
            if (saleData.customer?.rnc) row.customer_rnc = saleData.customer.rnc;
            if (saleData.customer?.address) row.customer_address = saleData.customer.address;
            // ncf_type no existe en la tabla sales, no incluir
            if (saleData.notes) row.notes = saleData.notes;
            
            return row;
          });

          const { error: simpleError } = await supabase.from('sales').insert(rows);
          if (simpleError) {
            // Si falla, intentar sin campos opcionales que pueden no existir
            console.warn('First insert attempt failed, trying minimal fields:', simpleError);
            const minimalRows = cart.map(ci => ({
              user_id: user?.id,
              product_id: ci.product.id,
              quantity: ci.quantity,
              unit_price: ci.unitPrice,
              total_price: ci.subtotal,
              customer_name: customerName,
              payment_method: paymentMethod,
              sale_type: saleType,
              sale_date: new Date().toISOString()
            }));
            
            const { error: minimalError } = await supabase.from('sales').insert(minimalRows);
            if (minimalError) {
              console.error('Minimal sales insert also failed:', minimalError);
              toast.error(`No se pudo registrar la venta: ${minimalError.message}`);
              return; // No continuar si falló
            }
            // Si el insert mínimo funcionó, continuar
          }
          
          saleSaved = true;
          // Actualizar stock
          for (const ci of cart) {
            const newStock = Math.max(0, (idToStock.get(ci.product.id) || ci.product.current_stock || 0) - ci.quantity);
            await supabase
              .from('products')
              .update({ current_stock: newStock })
              .eq('id', ci.product.id);
          }
        }

        // Solo si se guardó exitosamente, continuar
        if (saleSaved) {
          // Si es financiamiento, crear el préstamo
          let loanCreated = false;
          let loanErrorMsg = null;
          let monthlyPayment = 0;
          let loanAmount = 0;
          let termMonths = 0;
          
          const hasFinancing = saleData.paymentSplits.some(split => split.method.type === 'financing');
          if (hasFinancing && saleData.customer) {
            try {
              const financingSplit = saleData.paymentSplits.find(split => split.method.type === 'financing');
              // El monto del préstamo es exactamente el monto indicado en el campo de financiamiento
              loanAmount = financingSplit?.amount || 0;
              
              const interestRate = financingSplit?.details?.financingRate || saleData.paymentDetails?.financingRate || saleData.financingRate || companySettings?.interest_rate_default || 20;
              termMonths = financingSplit?.details?.financingMonths || saleData.paymentDetails?.financingMonths || saleData.financingMonths || companySettings?.min_term_months || 12;
              const amortizationType = financingSplit?.details?.amortizationType || saleData.paymentDetails?.amortizationType || 'simple';
              const paymentFrequency = financingSplit?.details?.paymentFrequency || saleData.paymentDetails?.paymentFrequency || 'monthly';
              const lateFeeEnabled = financingSplit?.details?.lateFeeEnabled !== undefined ? financingSplit.details.lateFeeEnabled : (saleData.paymentDetails?.lateFeeEnabled !== undefined ? saleData.paymentDetails.lateFeeEnabled : (companySettings?.default_late_fee_rate ? true : false));
              const lateFeeRate = financingSplit?.details?.lateFeeRate || saleData.paymentDetails?.lateFeeRate || companySettings?.default_late_fee_rate || 3;
              const gracePeriodDays = financingSplit?.details?.gracePeriodDays || saleData.paymentDetails?.gracePeriodDays || companySettings?.grace_period_days || 3;
              
              // Calcular cuota mensual según el tipo de amortización
              let monthlyInterest = 0;
              let monthlyPrincipal = 0;
              
              if (amortizationType === 'french') {
                // Amortización francesa - cuota fija
                const periodRate = interestRate / 100;
                if (periodRate > 0) {
                  monthlyPayment = (loanAmount * periodRate * Math.pow(1 + periodRate, termMonths)) / 
                                  (Math.pow(1 + periodRate, termMonths) - 1);
                  monthlyInterest = loanAmount * periodRate;
                  monthlyPrincipal = monthlyPayment - monthlyInterest;
                } else {
                  monthlyPayment = loanAmount / termMonths;
                  monthlyPrincipal = monthlyPayment;
                  monthlyInterest = 0;
                }
              } else {
                // Amortización simple (por defecto)
                // Interés mensual = (monto * tasa) / 100
                // Capital mensual = monto / plazo
                // Cuota mensual = interés mensual + capital mensual
                monthlyInterest = Math.round((loanAmount * interestRate / 100) * 100) / 100;
                monthlyPrincipal = Math.round((loanAmount / termMonths) * 100) / 100;
                monthlyPayment = Math.round((monthlyInterest + monthlyPrincipal) * 100) / 100;
              }
              
              // Calcular fechas
              const startDate = new Date();
              const endDate = new Date();
              endDate.setMonth(endDate.getMonth() + termMonths);
              const nextPaymentDate = new Date();
              nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
              const firstPaymentDate = new Date(nextPaymentDate); // first_payment_date es la fecha base fija
              
              // Calcular el total del préstamo (capital + interés total)
              const totalLoanAmount = loanAmount + (monthlyInterest * termMonths);
              
              // Crear el préstamo
              const { data: loanData, error: loanError } = await supabase
                .from('loans')
                .insert([
                  {
                    client_id: saleData.customer.id,
                    loan_officer_id: user?.id,
                    amount: loanAmount,
                    interest_rate: interestRate,
                    term_months: termMonths,
                    monthly_payment: Math.round(monthlyPayment * 100) / 100,
                    total_amount: totalLoanAmount,
                    remaining_balance: totalLoanAmount, // Balance pendiente incluye capital + interés total
                    start_date: startDate.toISOString().split('T')[0],
                    end_date: endDate.toISOString().split('T')[0],
                    next_payment_date: nextPaymentDate.toISOString().split('T')[0],
                    first_payment_date: firstPaymentDate.toISOString().split('T')[0], // Campo requerido
                    status: 'pending', // Pendiente de aprobación
                    loan_type: 'personal',
                    purpose: `Financiamiento de venta POS - ${cart.map(ci => ci.product.name).join(', ')}`,
                    notes: `Préstamo creado automáticamente desde punto de venta. Venta: ${saleData.ncfNumber || 'N/A'}`,
                    amortization_type: amortizationType,
                    payment_frequency: paymentFrequency,
                    late_fee_enabled: lateFeeEnabled,
                    late_fee_rate: lateFeeEnabled ? lateFeeRate : null,
                    grace_period_days: lateFeeEnabled ? gracePeriodDays : null,
                    late_fee_calculation_type: lateFeeEnabled ? 'daily' : null
                  }
                ])
                .select()
                .single();
              
              if (loanError) {
                console.error('Error creando préstamo:', loanError);
                loanErrorMsg = loanError.message;
              } else {
                loanCreated = true;
                // Crear las cuotas del préstamo
                const installments = [];
                for (let i = 1; i <= termMonths; i++) {
                  const dueDate = new Date(nextPaymentDate);
                  dueDate.setMonth(dueDate.getMonth() + (i - 1));
                  installments.push({
                    loan_id: loanData.id,
                    installment_number: i,
                    due_date: dueDate.toISOString().split('T')[0],
                    principal_amount: monthlyPrincipal,
                    interest_amount: monthlyInterest,
                    total_amount: monthlyPayment,
                    is_paid: false
                  });
                }
                
                const { error: installmentsError } = await supabase
                  .from('installments')
                  .insert(installments);
                
                if (installmentsError) {
                  console.error('Error creando cuotas:', installmentsError);
                }
              }
            } catch (loanErr: any) {
              console.error('Error en proceso de financiamiento:', loanErr);
              loanErrorMsg = loanErr.message || 'Error desconocido';
            }
          }
          
          // Mostrar una sola notificación consolidada al final
          if (hasFinancing) {
            if (loanCreated) {
              toast.success(`Venta procesada. Préstamo creado: $${loanAmount.toFixed(2)} a ${termMonths} meses. Cuota: $${monthlyPayment.toFixed(2)}`);
            } else {
              toast.error(`Venta procesada pero no se pudo crear el préstamo${loanErrorMsg ? ': ' + loanErrorMsg : ''}`);
            }
          } else {
            toast.success('Venta procesada exitosamente');
          }
          
    setShowPaymentModal(false);
    // Guardar los datos de la venta antes de limpiar el carrito (incluyendo el cambio calculado)
    setReceiptData({ ...saleData, change });
    
    // Guardar datos para el diálogo de WhatsApp
    setLastSaleData({
      saleData: { ...saleData, change },
      cart: [...cart],
      paymentMethods: saleData.paymentSplits,
      customer: saleData.customer
    });
    
    // Mostrar diálogo de WhatsApp
    setShowWhatsAppDialog(true);
    
    // No mostrar el recibo todavía, esperar a que el usuario decida sobre WhatsApp
          // Refrescar inventario
        await fetchData();
          // NO limpiar el carrito aquí - se limpiará cuando se cierre el modal del recibo
        }
      } catch (e: any) {
        console.error('Error saving sale:', e);
        toast.error('No se pudo registrar la venta');
        setShowPaymentModal(false);
      }
    };

    void persistSale();
  };

  const generateReceipt = (format: 'A4' | 'POS80' | 'POS58' = receiptFormat) => {
    // Usar receiptData si está disponible (datos guardados antes de limpiar), sino usar saleData
    const dataToUse = receiptData || saleData;
    const invoiceNumber = `${dataToUse.ncfType || '01'}-${dataToUse.ncfNumber || '0000000000'}`;
    const companyName = companyInfo.company_name;
    const companyAddress = companyInfo.address;
    const companyPhone = companyInfo.phone;
    const companyEmail = companyInfo.email;
    const cashier = companyName;
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const isThermal = format === 'POS80' || format === 'POS58';
    const isPOS58 = format === 'POS58';
    
    // Usar receiptData.items si está disponible, sino usar saleData.items o cart
    const itemsToShow = (receiptData?.items && receiptData.items.length > 0) 
      ? receiptData.items 
      : (saleData.items && saleData.items.length > 0 ? saleData.items : cart);
    
    // Para impresoras térmicas, formato más compacto
    const itemsRows = isThermal
      ? itemsToShow.map(item => {
          const maxNameLength = isPOS58 ? 18 : 28;
          const productName = item.product.name.length > maxNameLength 
            ? item.product.name.substring(0, maxNameLength - 3) + '...' 
            : item.product.name;
          const discountCol = isPOS58 ? '' : `<td class="right">${(item.discountPercent || 0).toFixed(0)}%</td>`;
          const unitPrice = `<td class="right">${money(item.unitPrice)}</td>`;
          // Calcular el total del item con ITBIS y descuento
          const itbisRate = item.product.itbis_rate ?? 18;
          const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
          const baseAmount = priceWithoutTax * item.quantity;
          const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
          const itemTax = discounted * (itbisRate / 100);
          const itemTotal = discounted + itemTax;
          return `
            <tr>
              <td>${productName}</td>
              <td class="right">${item.quantity}</td>
              ${unitPrice}
              ${discountCol}
              <td class="right">${money(itemTotal)}</td>
            </tr>
          `;
        }).join('')
      : itemsToShow.map(item => {
          // Calcular el total del item con ITBIS y descuento
          const itbisRate = item.product.itbis_rate ?? 18;
          const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
          const baseAmount = priceWithoutTax * item.quantity;
          const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
          const itemTax = discounted * (itbisRate / 100);
          const itemTotal = discounted + itemTax;
          return `
              <tr>
                <td>${item.product.name}</td>
                <td class="right">${item.quantity}</td>
                <td class="right">${money(item.unitPrice)}</td>
                <td class="right">${(item.discountPercent || 0).toFixed(2)}%</td>
                <td class="right">${money(itemTotal)}</td>
              </tr>
            `;
        }).join('');

    const customerExtra = dataToUse.customer && !isThermal
      ? `
        <div class="field"><span class="label">Teléfono</span><span class="value">${dataToUse.customer.phone || '—'}</span></div>
        ${dataToUse.customer.address ? `<div class="field" style="grid-column: 1 / span 2"><span class="label">Dirección</span><span class="value">${dataToUse.customer.address}</span></div>` : ''}
      `
      : '';

    // CSS específico para cada formato
    const pageCss = format === 'A4'
      ? '@page { size: A4; margin: 18mm; } .invoice{max-width:800px;margin:0 auto;}'
      : format === 'POS80'
        ? '@page { size: 80mm auto; margin: 2mm 1mm; } .invoice{width:76mm;margin:0 auto;font-size:9px;}'
        : '@page { size: 58mm auto; margin: 2mm 1mm; } .invoice{width:54mm;margin:0 auto;font-size:8px;}';
    
    // CSS compacto para térmicas
    const thermalCss = isThermal ? `
      body { font-size: ${isPOS58 ? '8px' : '9px'}; font-family: 'Courier New', monospace; }
      .invoice { width: ${isPOS58 ? '54mm' : '76mm'}; margin: 0 auto; }
      .header { padding: 4px 0; border-bottom: 1px solid #000; text-align: center; }
      .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
      .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
      .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; }
      .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .section { padding: 4px 0; margin: 4px 0; border: none; }
      .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 2px; }
      .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      th, td { padding: 2px 1px; border-bottom: 1px dashed #ccc; }
      thead th { background: transparent; border-bottom: 1px solid #000; font-size: ${isPOS58 ? '7px' : '8px'}; }
      tbody td { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .summary { padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
      .sum-row { padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
      .footer { margin-top: 8px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
      .notes { padding: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .brand-logo { display: none; }
      .grid-2 { grid-template-columns: 1fr; gap: 2px; }
      .row { flex-direction: column; gap: 4px; }
      .totals { grid-template-columns: 1fr; gap: 4px; }
    ` : '';

    // Generar HTML según el formato
    const receiptHTML = isThermal ? `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          ${thermalCss}
          body { font-family: 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
          .invoice { }
          .header { text-align: center; padding: 4px 0; border-bottom: 1px solid #000; }
          .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
          .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
          .section { padding: 2px 0; margin: 2px 0; }
          .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 1px; }
          .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
          .label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          th, td { padding: 1px 0; text-align: left; }
          th.right, td.right { text-align: right; }
          thead th { border-bottom: 1px solid #000; font-weight: bold; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .summary { padding: 2px 0; border-top: 1px solid #000; margin-top: 2px; }
          .sum-row { display: flex; justify-content: space-between; padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
          .footer { margin-top: 4px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
          .notes { padding: 2px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .divider { border-top: 1px dashed #000; margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            <div class="brand-meta">${companyAddress}</div>
            <div class="brand-meta">${companyPhone}</div>
            <div class="doc-type">FACTURA</div>
            <div class="doc-number">NCF: ${invoiceNumber}</div>
          </div>

          <div class="section">
            <div class="section-title">Cliente</div>
            <div class="field"><span class="label">Nombre:</span><span>${saleData.customer?.full_name || 'Cliente General'}</span></div>
            ${saleData.customer?.phone ? `<div class="field"><span class="label">Teléfono:</span><span>${saleData.customer.phone}</span></div>` : ''}
            <div class="section-title" style="margin-top:4px;">Venta</div>
            <div class="field"><span class="label">Fecha:</span><span>${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="field"><span class="label">Método de Pago:</span><span>${saleData.paymentSplits.map(s => s.method.name).join(', ') || saleData.paymentMethod?.name || 'Efectivo'}</span></div>
            ${(() => {
              const dataToUseForChange = receiptData || saleData;
              const cashPayments = dataToUseForChange.paymentSplits?.filter((split: any) => split.method.type === 'cash') || [];
              const totalCashPaid = cashPayments.reduce((sum: number, split: any) => sum + split.amount, 0);
              const calculatedChange = totalCashPaid > dataToUseForChange.total ? totalCashPaid - dataToUseForChange.total : (dataToUseForChange.change || 0);
              if (calculatedChange > 0 && totalCashPaid > 0) {
                return `
                  <div class="field"><span class="label">Recibido (Efectivo):</span><span>${money(totalCashPaid)}</span></div>
                  <div class="field"><span class="label">Cambio a Devolver:</span><span>${money(calculatedChange)}</span></div>
                `;
              }
              return '';
            })()}
          </div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="right">Cant</th>
                <th class="right">Precio</th>
                ${isPOS58 ? '' : '<th class="right">Desc%</th>'}
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="divider"></div>

          <div class="summary">
            <div class="sum-row"><span>Subtotal:</span><span>${money(dataToUse.subtotal || 0)}</span></div>
            ${(dataToUse.discount || 0) > 0 ? `<div class="sum-row"><span>Descuento:</span><span>-${money(dataToUse.discount)}</span></div>` : ''}
            <div class="sum-row"><span>ITBIS:</span><span>${money(dataToUse.tax || 0)}</span></div>
            <div class="sum-row total"><span>TOTAL:</span><span>${money(dataToUse.total || 0)}</span></div>
          </div>

          ${dataToUse.notes ? `<div class="notes"><strong>Notas:</strong> ${dataToUse.notes}</div>` : ''}

          <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; }
          .invoice { }
          .row { display: flex; gap: 16px; }
          .col { flex: 1; }
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #111827; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand-logo { width: 48px; height: 48px; background: #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #374151; }
          .brand-text { line-height: 1.2; }
          .brand-name { font-size: 18px; font-weight: 700; }
          .brand-meta { font-size: 11px; color: #6b7280; }
          .doc-title { text-align: right; }
          .doc-type { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; }
          .section { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .section-title { font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 8px; text-transform: uppercase; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
          .field { display: flex; justify-content: space-between; gap: 8px; }
          .label { color: #6b7280; }
          .value { font-weight: 600; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          thead th { background: #f9fafb; font-size: 12px; text-align: left; color: #374151; border-top: 1px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; }
          tbody td { font-size: 12px; vertical-align: top; }
          .right { text-align: right; }
          .totals { width: 100%; margin-top: 10px; display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
          .notes { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 12px; color: #374151; min-height: 72px; }
          .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .sum-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .sum-row.total { border-top: 2px solid #111827; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 14px; }
          .footer { margin-top: 16px; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; align-items: center; }
        </style>
      </head>
      <body>
        <div class="invoice">
        <div class="header">
            <div class="brand">
              <div class="brand-logo">CL</div>
              <div class="brand-text">
                <div class="brand-name">${companyName}</div>
                <div class="brand-meta">${companyAddress} · ${companyPhone}</div>
              </div>
            </div>
            <div class="doc-title">
              <div class="doc-type">FACTURA</div>
              <div class="doc-number">NCF: ${invoiceNumber}</div>
            </div>
        </div>

          <div class="row" style="margin-top:12px;">
            <div class="col section">
              <div class="section-title">Datos del Cliente</div>
              <div class="grid-2">
                <div class="field"><span class="label">Nombre</span><span class="value">${saleData.customer?.full_name || 'Cliente General'}</span></div>
                <div class="field"><span class="label">Fecha</span><span class="value">${new Date().toLocaleDateString('es-DO')}</span></div>
                ${customerExtra}
          </div>
          </div>
            <div class="col section">
              <div class="section-title">Detalles</div>
              <div class="grid-2">
                <div class="field"><span class="label">Vendedor</span><span class="value">${cashier}</span></div>
                <div class="field"><span class="label">Condición</span><span class="value">${saleData.saleType === 'cash' ? 'Contado' : saleData.saleType === 'credit' ? 'Crédito' : 'Financiamiento'}</span></div>
                <div class="field"><span class="label">Método de pago</span><span class="value">${saleData.paymentMethod?.name || '—'}</span></div>
                ${(() => {
                  const dataToUseForChange = receiptData || saleData;
                  const cashPayments = dataToUseForChange.paymentSplits?.filter((split: any) => split.method.type === 'cash') || [];
                  const totalCashPaid = cashPayments.reduce((sum: number, split: any) => sum + split.amount, 0);
                  const calculatedChange = totalCashPaid > dataToUseForChange.total ? totalCashPaid - dataToUseForChange.total : (dataToUseForChange.change || 0);
                  if (calculatedChange > 0 && totalCashPaid > 0) {
                    return `
                      <div class="field"><span class="label">Recibido (Efectivo)</span><span class="value">${money(totalCashPaid)}</span></div>
                      <div class="field"><span class="label">Cambio a Devolver</span><span class="value">${money(calculatedChange)}</span></div>
                    `;
                  }
                  return '<div class="field"><span class="label">Cambio</span><span class="value">—</span></div>';
                })()}
          </div>
          </div>
        </div>

          <table>
          <thead>
            <tr>
                <th style="width:45%">Descripción</th>
                <th class="right" style="width:10%">Cant.</th>
                <th class="right" style="width:15%">Precio</th>
                <th class="right" style="width:15%">Desc.</th>
                <th class="right" style="width:15%">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

          <div class="totals">
            <div class="notes">
              <div style="font-weight:700; margin-bottom:6px;">Notas</div>
              ${saleData.notes || '—'}
          </div>
            <div class="summary">
              <div class="sum-row"><span>Subtotal</span><span>${money(dataToUse.subtotal || 0)}</span></div>
              ${(dataToUse.discount || 0) > 0 ? `<div class="sum-row"><span>Descuento</span><span>- ${money(dataToUse.discount)}</span></div>` : ''}
              <div class="sum-row"><span>ITBIS</span><span>${money(dataToUse.tax || 0)}</span></div>
              <div class="sum-row total"><span>Total a Pagar</span><span>${money(dataToUse.total || 0)}</span></div>
          </div>
        </div>

        <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>Generado el ${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO')}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = () => {
    // Usar receiptData si está disponible (datos guardados antes de limpiar), sino usar saleData
    const dataToUse = receiptData || saleData;
    const invoiceNumber = `${dataToUse.ncfType || '01'}-${dataToUse.ncfNumber || '0000000000'}`;
    const companyName = companyInfo.company_name;
    const companyAddress = companyInfo.address;
    const companyPhone = companyInfo.phone;
    const companyEmail = companyInfo.email;
    const cashier = user?.email || 'Cajero';
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const isThermal = receiptFormat === 'POS80' || receiptFormat === 'POS58';
    const isPOS58 = receiptFormat === 'POS58';
    
    // Usar receiptData.items si está disponible, sino usar saleData.items o cart
    const itemsToShow = (receiptData?.items && receiptData.items.length > 0) 
      ? receiptData.items 
      : (saleData.items && saleData.items.length > 0 ? saleData.items : cart);
    
    // Para impresoras térmicas, formato más compacto
    const itemsRows = isThermal
      ? itemsToShow.map(item => {
          const maxNameLength = isPOS58 ? 18 : 28;
          const productName = item.product.name.length > maxNameLength 
            ? item.product.name.substring(0, maxNameLength - 3) + '...' 
            : item.product.name;
          const discountCol = isPOS58 ? '' : `<td class="right">${(item.discountPercent || 0).toFixed(0)}%</td>`;
          const unitPrice = `<td class="right">${money(item.unitPrice)}</td>`;
          // Calcular el total del item con ITBIS y descuento
          const itbisRate = item.product.itbis_rate ?? 18;
          const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
          const baseAmount = priceWithoutTax * item.quantity;
          const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
          const itemTax = discounted * (itbisRate / 100);
          const itemTotal = discounted + itemTax;
          return `
            <tr>
              <td>${productName}</td>
              <td class="right">${item.quantity}</td>
              ${unitPrice}
              ${discountCol}
              <td class="right">${money(itemTotal)}</td>
            </tr>
          `;
        }).join('')
      : itemsToShow.map(item => {
          // Calcular el total del item con ITBIS y descuento
          const itbisRate = item.product.itbis_rate ?? 18;
          const priceWithoutTax = item.unitPrice / (1 + itbisRate / 100);
          const baseAmount = priceWithoutTax * item.quantity;
          const discounted = baseAmount * (1 - (item.discountPercent || 0) / 100);
          const itemTax = discounted * (itbisRate / 100);
          const itemTotal = discounted + itemTax;
          return `
          <tr>
            <td>${item.product.name}</td>
            <td class="right">${item.quantity}</td>
            <td class="right">${money(item.unitPrice)}</td>
            <td class="right">${(item.discountPercent || 0).toFixed(2)}%</td>
            <td class="right">${money(itemTotal)}</td>
          </tr>
        `;
        }).join('');

    const customerExtra = dataToUse.ncfNumber && !isThermal
      ? `
        <div class="field"><span class="label">Teléfono</span><span class="value">${dataToUse.customer?.phone || '—'}</span></div>
        ${dataToUse.customer?.address ? `<div class="field" style="grid-column: 1 / span 2"><span class="label">Dirección</span><span class="value">${dataToUse.customer.address}</span></div>` : ''}
      `
      : '';

    const pageCss = receiptFormat === 'A4'
      ? '@page { size: A4; margin: 18mm; } .invoice{max-width:800px;margin:0 auto;}'
      : receiptFormat === 'POS80'
        ? '@page { size: 80mm auto; margin: 2mm; } .invoice{width:76mm;margin:0 auto;font-size:9px;}'
        : '@page { size: 58mm auto; margin: 2mm; } .invoice{width:54mm;margin:0 auto;font-size:8px;}';
    
    // CSS compacto para térmicas
    const thermalCss = isThermal ? `
      body { font-size: ${isPOS58 ? '8px' : '9px'}; font-family: 'Courier New', monospace; }
      .invoice { width: ${isPOS58 ? '54mm' : '76mm'}; margin: 0 auto; }
      .header { padding: 4px 0; border-bottom: 1px solid #000; text-align: center; }
      .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
      .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
      .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; }
      .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .section { padding: 4px 0; margin: 4px 0; border: none; }
      .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 2px; }
      .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      th, td { padding: 2px 1px; border-bottom: 1px dashed #ccc; }
      thead th { background: transparent; border-bottom: 1px solid #000; font-size: ${isPOS58 ? '7px' : '8px'}; }
      tbody td { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .summary { padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
      .sum-row { padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
      .footer { margin-top: 8px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
      .notes { padding: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .brand-logo { display: none; }
      .grid-2 { grid-template-columns: 1fr; gap: 2px; }
      .row { flex-direction: column; gap: 4px; }
      .totals { grid-template-columns: 1fr; gap: 4px; }
    ` : '';

    // Generar HTML según el formato (igual que generateReceipt)
    const receiptHTML = isThermal ? `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          ${thermalCss}
          body { font-family: 'Courier New', monospace; color: #000; margin: 0; padding: 0; }
          .invoice { }
          .header { text-align: center; padding: 4px 0; border-bottom: 1px solid #000; }
          .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
          .doc-type { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
          .doc-number { font-size: ${isPOS58 ? '7px' : '8px'}; }
          .section { padding: 2px 0; margin: 2px 0; }
          .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 1px; }
          .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
          .label { font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin: 2px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          th, td { padding: 1px 0; text-align: left; }
          th.right, td.right { text-align: right; }
          thead th { border-bottom: 1px solid #000; font-weight: bold; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .summary { padding: 2px 0; border-top: 1px solid #000; margin-top: 2px; }
          .sum-row { display: flex; justify-content: space-between; padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
          .footer { margin-top: 4px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
          .notes { padding: 2px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
          .divider { border-top: 1px dashed #000; margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            <div class="brand-meta">${companyAddress}</div>
            <div class="brand-meta">${companyPhone}</div>
            <div class="doc-type">FACTURA</div>
            <div class="doc-number">NCF: ${invoiceNumber}</div>
          </div>

          <div class="section">
            <div class="section-title">Cliente</div>
            <div class="field"><span class="label">Nombre:</span><span>${saleData.customer?.full_name || 'Cliente General'}</span></div>
            ${saleData.customer?.phone ? `<div class="field"><span class="label">Teléfono:</span><span>${saleData.customer.phone}</span></div>` : ''}
            <div class="section-title" style="margin-top:4px;">Venta</div>
            <div class="field"><span class="label">Fecha:</span><span>${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span></div>
            <div class="field"><span class="label">Método de Pago:</span><span>${saleData.paymentSplits.map(s => s.method.name).join(', ') || saleData.paymentMethod?.name || 'Efectivo'}</span></div>
            ${(() => {
              const dataToUseForChange = receiptData || saleData;
              const cashPayments = dataToUseForChange.paymentSplits?.filter((split: any) => split.method.type === 'cash') || [];
              const totalCashPaid = cashPayments.reduce((sum: number, split: any) => sum + split.amount, 0);
              const calculatedChange = totalCashPaid > dataToUseForChange.total ? totalCashPaid - dataToUseForChange.total : (dataToUseForChange.change || 0);
              if (calculatedChange > 0 && totalCashPaid > 0) {
                return `
                  <div class="field"><span class="label">Recibido (Efectivo):</span><span>${money(totalCashPaid)}</span></div>
                  <div class="field"><span class="label">Cambio a Devolver:</span><span>${money(calculatedChange)}</span></div>
                `;
              }
              return '';
            })()}
          </div>

          <div class="divider"></div>

          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="right">Cant</th>
                <th class="right">Precio</th>
                ${isPOS58 ? '' : '<th class="right">Desc%</th>'}
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>

          <div class="divider"></div>

          <div class="summary">
            <div class="sum-row"><span>Subtotal:</span><span>${money(dataToUse.subtotal || 0)}</span></div>
            ${(dataToUse.discount || 0) > 0 ? `<div class="sum-row"><span>Descuento:</span><span>-${money(dataToUse.discount)}</span></div>` : ''}
            <div class="sum-row"><span>ITBIS:</span><span>${money(dataToUse.tax || 0)}</span></div>
            <div class="sum-row total"><span>TOTAL:</span><span>${money(dataToUse.total || 0)}</span></div>
          </div>

          ${dataToUse.notes ? `<div class="notes"><strong>Notas:</strong> ${dataToUse.notes}</div>` : ''}

          <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        </div>
      </body>
      </html>
    ` : `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Factura</title>
        <style>
          ${pageCss}
          body { font-family: Arial, sans-serif; font-size: 12px; color: #1f2937; }
          .invoice { }
          .row { display: flex; gap: 16px; }
          .col { flex: 1; }
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #111827; }
          .brand { display: flex; align-items: center; gap: 12px; }
          .brand-logo { width: 48px; height: 48px; background: #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #374151; }
          .brand-text { line-height: 1.2; }
          .brand-name { font-size: 18px; font-weight: 700; }
          .brand-meta { font-size: 11px; color: #6b7280; }
          .doc-title { text-align: right; }
          .doc-type { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; }
          .section { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          .section-title { font-size: 12px; font-weight: 700; color: #111827; margin-bottom: 8px; text-transform: uppercase; }
          .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
          .field { display: flex; justify-content: space-between; gap: 8px; }
          .label { color: #6b7280; }
          .value { font-weight: 600; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          thead th { background: #f9fafb; font-size: 12px; text-align: left; color: #374151; border-top: 1px solid #e5e7eb; border-bottom: 2px solid #e5e7eb; }
          tbody td { font-size: 12px; vertical-align: top; }
          .right { text-align: right; }
          .totals { width: 100%; margin-top: 10px; display: grid; grid-template-columns: 1fr 260px; gap: 16px; }
          .notes { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; font-size: 12px; color: #374151; min-height: 72px; }
          .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; }
          .sum-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .sum-row.total { border-top: 2px solid #111827; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 14px; }
          .footer { margin-top: 16px; font-size: 11px; color: #6b7280; display: flex; justify-content: space-between; align-items: center; }
        </style>
      </head>
      <body>
        <div class="invoice">
        <div class="header">
            <div class="brand">
              <div class="brand-logo">CL</div>
              <div class="brand-text">
                <div class="brand-name">${companyName}</div>
                <div class="brand-meta">${companyAddress} · ${companyPhone}</div>
              </div>
            </div>
            <div class="doc-title">
              <div class="doc-type">FACTURA</div>
              <div class="doc-number">NCF: ${invoiceNumber}</div>
            </div>
        </div>

          <div class="row" style="margin-top:12px;">
            <div class="col section">
              <div class="section-title">Datos del Cliente</div>
              <div class="grid-2">
                <div class="field"><span class="label">Nombre</span><span class="value">${saleData.customer?.full_name || 'Cliente General'}</span></div>
                <div class="field"><span class="label">Fecha</span><span class="value">${new Date().toLocaleDateString('es-DO')}</span></div>
                ${customerExtra}
          </div>
          </div>
            <div class="col section">
              <div class="section-title">Detalles</div>
              <div class="grid-2">
                <div class="field"><span class="label">Vendedor</span><span class="value">${cashier}</span></div>
                <div class="field"><span class="label">Condición</span><span class="value">${saleData.saleType === 'cash' ? 'Contado' : saleData.saleType === 'credit' ? 'Crédito' : 'Financiamiento'}</span></div>
                <div class="field"><span class="label">Método de pago</span><span class="value">${saleData.paymentMethod?.name || '—'}</span></div>
                ${(() => {
                  const dataToUseForChange = receiptData || saleData;
                  const cashPayments = dataToUseForChange.paymentSplits?.filter((split: any) => split.method.type === 'cash') || [];
                  const totalCashPaid = cashPayments.reduce((sum: number, split: any) => sum + split.amount, 0);
                  const calculatedChange = totalCashPaid > dataToUseForChange.total ? totalCashPaid - dataToUseForChange.total : (dataToUseForChange.change || 0);
                  if (calculatedChange > 0 && totalCashPaid > 0) {
                    return `
                      <div class="field"><span class="label">Recibido (Efectivo)</span><span class="value">${money(totalCashPaid)}</span></div>
                      <div class="field"><span class="label">Cambio a Devolver</span><span class="value">${money(calculatedChange)}</span></div>
                    `;
                  }
                  return '<div class="field"><span class="label">Cambio</span><span class="value">—</span></div>';
                })()}
          </div>
          </div>
        </div>

          <table>
          <thead>
            <tr>
                <th style="width:45%">Descripción</th>
                <th class="right" style="width:10%">Cant.</th>
                <th class="right" style="width:15%">Precio</th>
                <th class="right" style="width:15%">Desc.</th>
                <th class="right" style="width:15%">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

          <div class="totals">
            <div class="notes">
              <div style="font-weight:700; margin-bottom:6px;">Notas</div>
              ${dataToUse.notes || '—'}
          </div>
            <div class="summary">
              <div class="sum-row"><span>Subtotal</span><span>${money(dataToUse.subtotal || 0)}</span></div>
              ${(dataToUse.discount || 0) > 0 ? `<div class="sum-row"><span>Descuento</span><span>- ${money(dataToUse.discount)}</span></div>` : ''}
              <div class="sum-row"><span>ITBIS</span><span>${money(dataToUse.tax || 0)}</span></div>
              <div class="sum-row total"><span>Total a Pagar</span><span>${money(dataToUse.total || 0)}</span></div>
          </div>
        </div>

        <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>Generado el ${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO')}</div>
          </div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
              <span className="hidden sm:inline">Punto de Venta</span>
              <span className="sm:hidden">POS</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-600">Sistema de ventas completo</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="text-right flex-1 sm:flex-none">
              <div className="text-xs sm:text-sm text-gray-600">Cajero</div>
              <div className="font-semibold text-xs sm:text-sm truncate">{user?.email}</div>
            </div>
            <Button onClick={() => clearCart()} variant="outline" size="sm" className="h-8 sm:h-9">
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Limpiar</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-0 lg:gap-0 lg:flex-row lg:overflow-hidden">
        {/* Left Panel - Products */}
        <div className="w-full lg:w-1/2 bg-white border-b lg:border-b-0 lg:border-r border-gray-200 flex flex-col order-1 lg:order-1 h-[50vh] lg:h-[calc(100vh-140px)] min-h-[400px]">
          {/* Product Search */}
          <div className="p-3 sm:p-4 border-b border-gray-200 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar producto..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs sm:text-sm text-gray-600">
              <span>{filteredProducts.length} {filteredProducts.length === 1 ? 'producto' : 'productos'}</span>
              {productSearchTerm && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-600 text-xs">
                    "{productSearchTerm}"
                  </span>
                  <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">
                    Cascada
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Products Grid - Mejorado para móvil */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:max-h-[calc(100vh-220px)] -webkit-overflow-scrolling-touch">
            {loading ? (
              <div className="text-center py-8">Cargando productos...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {productSearchTerm ? (
                  <div>
                    <p className="text-sm">No se encontraron productos</p>
                    <p className="font-semibold text-gray-700 text-sm">"{productSearchTerm}"</p>
                  </div>
                ) : (
                  <p className="text-sm">No hay productos disponibles</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-3">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="hover:shadow-md transition-shadow flex flex-col h-full">
                    <CardContent className="p-3 sm:p-4 flex flex-col flex-1">
                      <div className="flex items-start justify-between mb-3 flex-shrink-0">
                        <div className="flex-1 min-w-0 pr-2">
                          <h3 className="font-semibold text-sm sm:text-base mb-2 line-clamp-2 leading-tight">{product.name}</h3>
                          <div className="text-xs text-gray-600 space-y-0.5">
                            <p>
                              Stock: <span className={`font-semibold ${product.current_stock <= 5 ? 'text-orange-600' : 'text-blue-600'}`}>{product.current_stock}</span>
                            </p>
                            {product.category && (
                              <p className="truncate">Cat: <span className="text-gray-500">{product.category}</span></p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge className={`${product.current_stock === 0 ? 'bg-gray-400' : 'bg-green-500'} text-white text-xs whitespace-nowrap`}>
                            {product.current_stock === 0 ? 'Agotado' : 'Disponible'}
                          </Badge>
                          {product.current_stock <= 5 && product.current_stock > 0 && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs whitespace-nowrap">
                              Bajo
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="mt-auto pt-2 border-t border-gray-100">
                        <div className="mb-2">
                          {product.selling_price ? (
                            (() => {
                              const itbisRate = product.itbis_rate ?? 18;
                              const itbisMultiplier = 1 + (itbisRate / 100);
                              const priceWithTax = ((product.selling_price || 0) * itbisMultiplier);
                              return <p className="text-base sm:text-lg font-bold text-green-600">${priceWithTax.toFixed(2)}</p>;
                            })()
                          ) : (
                            <p className="text-xs text-gray-500">Sin precio</p>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          onClick={() => addToCart(product)}
                          className="w-full h-10 sm:h-9 text-sm font-medium"
                          disabled={product.current_stock === 0}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Agregar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Cart & Checkout */}
        <div className="w-full lg:w-1/2 flex flex-col order-2 lg:order-2 h-[50vh] lg:h-[calc(100vh-140px)] min-h-[400px] border-t lg:border-t-0 border-gray-200">
          {/* Cart Header */}
          <div className="p-3 sm:p-4 border-b border-gray-200 bg-gray-50 flex-shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                Carrito ({cart.length})
              </h2>
            </div>
            
            {/* Cliente Selector - Inline */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Cliente *</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-10 pr-10 h-9"
                  />
                  {customerSearch && filteredCustomers.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                          onClick={() => {
                            selectCustomer(customer);
                            setCustomerSearch('');
                          }}
                        >
                          <div className="font-medium">{customer.full_name}</div>
                          <div className="text-sm text-gray-600">
                            {customer.phone} {customer.email && `| ${customer.email}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedCustomer && (
                    <button
                      onClick={() => {
                        setSelectedCustomer(null);
                        setSaleData(prev => ({ ...prev, customer: null }));
                        setCustomerSearch('');
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              <Button 
                  type="button"
                variant="outline" 
                  onClick={() => setShowNewClientModal(true)}
                  className="whitespace-nowrap h-9"
              >
                  <User className="h-4 w-4 mr-1" />
                  Nuevo
              </Button>
              </div>
              {selectedCustomer && (
                <div className="p-2 bg-green-50 border border-green-200 rounded text-sm">
                  <span className="font-medium text-green-800">Cliente seleccionado: </span>
                  <span className="text-green-700">{selectedCustomer.full_name}</span>
                </div>
              )}
              {!selectedCustomer && (
                <div className="p-2 bg-orange-50 border border-orange-200 rounded text-sm text-orange-800">
                  <AlertCircle className="h-4 w-4 inline mr-1" />
                  Debes seleccionar un cliente antes de procesar la venta
                </div>
              )}
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:max-h-[calc(100vh-220px)] -webkit-overflow-scrolling-touch pb-32 lg:pb-4">
            {cart.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>El carrito está vacío</p>
                <p className="text-sm">Agrega productos para comenzar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm">{item.product.name}</h3>
                          <p className="text-xs text-gray-600">Stock: {item.product.current_stock}</p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => removeFromCart(item.product.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <div>
                          <Label className="text-xs">Cantidad</Label>
                          <div className="flex items-center gap-1">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => updateCartItemQuantity(item.product.id, item.quantity - 1)}
                              className="h-8 sm:h-9 w-8 sm:w-9 p-0"
                            >
                              <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                            <Input 
                              type="number" 
                              value={item.quantity} 
                              onChange={(e) => updateCartItemQuantity(item.product.id, parseInt(e.target.value) || 0)}
                              className="text-center text-xs sm:text-sm h-8 sm:h-9"
                              min="1"
                            />
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => updateCartItemQuantity(item.product.id, item.quantity + 1)}
                              className="h-8 sm:h-9 w-8 sm:w-9 p-0"
                            >
                              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs">Precio</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={parseFloat(item.unitPrice.toFixed(2))} 
                            onChange={(e) => updateCartItemPrice(item.product.id, parseFloat(e.target.value) || 0)}
                            className="text-xs sm:text-sm h-8 sm:h-9"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Descuento (%)</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            min="0"
                            max="100"
                            value={item.discountPercent} 
                            onChange={(e) => updateCartItemDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                            className="text-xs sm:text-sm h-8 sm:h-9"
                          />
                        </div>
                        
                        <div className="text-right">
                          <Label className="text-xs">Subtotal</Label>
                          <div className="font-semibold text-green-600 text-xs sm:text-sm">
                            ${item.subtotal.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Cart Summary */}
          <div className="border-t border-gray-200 bg-white p-3 sm:p-4 lg:static fixed bottom-0 left-0 right-0 z-30 shadow-[0_-4px_10px_rgba(0,0,0,0.1)] lg:shadow-none">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${saleData.subtotal.toFixed(2)}</span>
              </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <div>
                <Label className="text-xs">Modo de Descuento</Label>
                <Select
                  value={saleData.discountMode}
                  onValueChange={(value) => setSaleData(prev => ({ ...prev, discountMode: value as 'item' | 'total' }))}
                >
                  <SelectTrigger className="h-8 sm:h-9 text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="item">Por ítem (%)</SelectItem>
                    <SelectItem value="total">Al total (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {saleData.discountMode === 'total' && (
                <div>
                  <Label className="text-xs">Descuento Total (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={saleData.discountPercentTotal}
                    onChange={(e) => setSaleData(prev => ({ ...prev, discountPercentTotal: Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100) }))}
                    className="h-8 sm:h-9 text-xs sm:text-sm"
                  />
                </div>
              )}
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span>Descuento:</span>
                <span className="text-red-600">-${saleData.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm">
                <span>ITBIS:</span>
                <span>${saleData.tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-base sm:text-lg font-bold">
                <span>TOTAL:</span>
                <span className="text-green-600">${saleData.total.toFixed(2)}</span>
              </div>
            </div>
            
            <Button 
              onClick={() => setShowPaymentModal(true)} 
              className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold" 
              disabled={cart.length === 0 || !selectedCustomer}
              aria-label="Procesar Venta"
            >
              <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 sm:mr-2" />
              Procesar Venta
            </Button>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
            <DialogDescription>Completa los datos de pago y formato de impresión</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Resumen de Pagos */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <Label className="text-base font-semibold">Total a Pagar</Label>
                <span className="text-xl font-bold text-green-600">${saleData.total.toFixed(2)}</span>
            </div>
              <div className="flex justify-between items-center">
                <Label className="text-sm text-gray-600">Total Pagado</Label>
                <span className="text-lg font-semibold">
                  ${saleData.paymentSplits.reduce((sum, split) => sum + split.amount, 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center mt-1">
                <Label className="text-sm text-gray-600">Restante</Label>
                <span className={`text-lg font-semibold ${
                  saleData.total - saleData.paymentSplits.reduce((sum, split) => sum + split.amount, 0) > 0.01
                    ? 'text-red-600' : 'text-green-600'
                }`}>
                  ${(saleData.total - saleData.paymentSplits.reduce((sum, split) => sum + split.amount, 0)).toFixed(2)}
                </span>
              </div>
              {/* Mostrar cambio solo si hay pago en efectivo mayor al total */}
              {(() => {
                const totalPaid = saleData.paymentSplits.reduce((sum, split) => sum + split.amount, 0);
                const cashPayments = saleData.paymentSplits.filter(split => split.method.type === 'cash');
                const totalCashPaid = cashPayments.reduce((sum, split) => sum + split.amount, 0);
                const change = totalCashPaid > saleData.total ? totalCashPaid - saleData.total : 0;
                
                if (change > 0) {
                  return (
                    <div className="flex justify-between items-center mt-2 pt-2 border-t">
                      <Label className="text-sm font-semibold text-blue-600">Cambio a Devolver</Label>
                      <span className="text-lg font-bold text-blue-600">
                        ${change.toFixed(2)}
                      </span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            {/* Lista de Pagos */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label className="text-base font-semibold">Métodos de Pago</Label>
                  <Button
                  size="sm"
                  variant="outline"
                onClick={() => {
                    const defaultMethod = paymentMethods.find(m => m.type === 'cash') || paymentMethods[0];
                    setSaleData(prev => ({
                      ...prev,
                      paymentSplits: [...prev.paymentSplits, {
                        method: defaultMethod,
                        amount: 0,
                        details: {}
                      }]
                    }));
                }}
                  disabled={!selectedCustomer}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Pago
                  </Button>
              </div>
              
              {saleData.paymentSplits.length === 0 ? (
                <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center text-gray-500">
                  <p>No hay métodos de pago agregados</p>
                  <p className="text-sm mt-1">Haz clic en "Agregar Pago" para comenzar</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {saleData.paymentSplits.map((split, index) => {
                    const remaining = saleData.total - saleData.paymentSplits.reduce((sum, s, i) => 
                      i !== index ? sum + s.amount : sum, 0);
                    return (
                      <Card key={index} className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">Pago {index + 1}</span>
                            <Badge variant="outline">{split.method.name}</Badge>
            </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSaleData(prev => ({
                                ...prev,
                                paymentSplits: prev.paymentSplits.filter((_, i) => i !== index)
                              }));
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
          </div>
          
                        <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
                            <Label className="text-sm">Método</Label>
                            <Select
                              value={split.method.id}
                              onValueChange={(value) => {
                                const method = paymentMethods.find(m => m.id === value);
                                if (method) {
                                  // Validar que no se seleccione financiamiento con Cliente General
                                  if (method.type === 'financing' && 
                                      (selectedCustomer?.full_name === 'Cliente General' || !selectedCustomer)) {
                                    toast.error('No se puede usar financiamiento con Cliente General. Debe seleccionar un cliente específico.');
                                    return;
                                  }
                                  
                                  setSaleData(prev => ({
                                    ...prev,
                                    paymentSplits: prev.paymentSplits.map((s, i) => 
                                      i === index ? { 
                                        ...s, 
                                        method, 
                                        details: method.type === 'financing' ? {
                                          financingMonths: companySettings?.min_term_months || 12,
                                          financingRate: companySettings?.interest_rate_default || 20,
                                          amortizationType: 'simple' as const,
                                          paymentFrequency: 'monthly' as const,
                                          lateFeeEnabled: companySettings?.default_late_fee_rate ? true : false,
                                          lateFeeRate: companySettings?.default_late_fee_rate || 3,
                                          gracePeriodDays: companySettings?.grace_period_days || 3
                                        } : {} 
                                      } : s
                                    )
                                  }));
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                {paymentMethods.map((method) => {
                                  // Deshabilitar financiamiento si el cliente es "Cliente General"
                                  const isDisabled = method.type === 'financing' && 
                                    (selectedCustomer?.full_name === 'Cliente General' || !selectedCustomer);
                                  return (
                                    <SelectItem 
                                      key={method.id} 
                                      value={method.id}
                                      disabled={isDisabled}
                                      className={isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
                                    >
                                      <div className="flex items-center gap-2">
                                        {method.icon}
                                        {method.name}
                                        {isDisabled && <span className="text-xs text-gray-500 ml-auto">(Requiere cliente)</span>}
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-sm">Monto</Label>
              <Input
                type="number"
                step="0.01"
                              value={split.amount === 0 ? '' : split.amount}
                onChange={(e) => {
                  const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
                  const inputAmount = round2(parseFloat(e.target.value) || 0);
                  // Solo limitar el monto si NO es efectivo. Para efectivo, permitir cualquier monto
                  const amount = split.method.type === 'cash' 
                    ? inputAmount 
                    : Math.min(inputAmount, remaining);
                  setSaleData(prev => ({ 
                    ...prev, 
                                  paymentSplits: prev.paymentSplits.map((s, i) => 
                                    i === index ? { ...s, amount } : s
                                  )
                  }));
                }}
                placeholder="0.00"
              />
                            <div className="flex gap-1 mt-1">
                  <Button
                                size="sm" 
                                variant="ghost" 
                                className="h-6 text-xs"
                                onClick={() => {
                                  const round2 = (n: number) => Math.round((n || 0) * 100) / 100;
                                  const amount = Math.min(round2(remaining), remaining);
                                  setSaleData(prev => ({
                                    ...prev,
                                    paymentSplits: prev.paymentSplits.map((s, i) => 
                                      i === index ? { ...s, amount } : s
                                    )
                                  }));
                                }}
                              >
                                Restante
                  </Button>
                            </div>
              </div>
            </div>

                        {/* Detalles específicos por método */}
                        {split.method.type === 'card' && (
                          <div className="mt-3 p-3 bg-blue-50 rounded-lg space-y-2">
                            <Label className="text-sm font-semibold">Detalles de Tarjeta</Label>
                            <div className="grid grid-cols-2 gap-2">
            <div>
                                <Label className="text-xs">Tipo</Label>
                                <Select
                                  value={split.details?.cardType || ''}
                                  onValueChange={(value) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, cardType: value as any } 
                                        } : s
                                      )
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue placeholder="Tipo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="visa">Visa</SelectItem>
                                    <SelectItem value="mastercard">Mastercard</SelectItem>
                                    <SelectItem value="amex">Amex</SelectItem>
                                    <SelectItem value="discover">Discover</SelectItem>
                                    <SelectItem value="other">Otra</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Últimos 4</Label>
                                <Input
                                  type="text"
                                  maxLength={4}
                                  value={split.details?.cardLast4 || ''}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) } 
                                        } : s
                                      )
                                    }));
                                  }}
                                  className="h-8"
                                  placeholder="1234"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {split.method.type === 'transfer' && (
                          <div className="mt-3 p-3 bg-green-50 rounded-lg space-y-2">
                            <Label className="text-sm font-semibold">Detalles de Transferencia</Label>
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs">Banco</Label>
                                <Input
                                  type="text"
                                  value={split.details?.bankName || ''}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, bankName: e.target.value } 
                                        } : s
                                      )
                                    }));
                                  }}
                                  className="h-8"
                                  placeholder="Nombre del banco"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Referencia</Label>
                                <Input
                                  type="text"
                                  value={split.details?.referenceNumber || ''}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, referenceNumber: e.target.value } 
                                        } : s
                                      )
                                    }));
                                  }}
                                  className="h-8"
                                  placeholder="Número de referencia"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {split.method.type === 'check' && (
                          <div className="mt-3 p-3 bg-yellow-50 rounded-lg space-y-2">
                            <Label className="text-sm font-semibold">Detalles de Cheque</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Número</Label>
                                <Input
                                  type="text"
                                  value={split.details?.checkNumber || ''}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, checkNumber: e.target.value } 
                                        } : s
                                      )
                                    }));
                                  }}
                                  className="h-8"
                                  placeholder="Número"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Banco</Label>
                                <Input
                                  type="text"
                                  value={split.details?.checkBank || ''}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, checkBank: e.target.value } 
                                        } : s
                                      )
                                    }));
                                  }}
                                  className="h-8"
                                  placeholder="Banco"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {split.method.type === 'financing' && (
                          <div className="mt-3 p-3 bg-purple-50 rounded-lg space-y-3">
                            <Label className="text-sm font-semibold">Detalles de Financiamiento</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Plazo (meses)</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  max="60"
                                  value={split.details?.financingMonths || saleData.financingMonths || companySettings?.min_term_months || 12}
                                  onChange={(e) => {
                                    const months = parseInt(e.target.value) || 12;
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, financingMonths: months } 
                                        } : s
                                      ),
                                      financingMonths: months,
                                      paymentDetails: { ...prev.paymentDetails, financingMonths: months }
                                    }));
                                  }}
                                  className="h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Tasa de Interés (%)</Label>
              <Input
                type="number"
                step="0.01"
                                  min="0"
                                  max="100"
                                  value={split.details?.financingRate || saleData.financingRate || companySettings?.interest_rate_default || 20}
                onChange={(e) => {
                                    const rate = parseFloat(e.target.value) || 20;
                  setSaleData(prev => ({ 
                    ...prev, 
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, financingRate: rate } 
                                        } : s
                                      ),
                                      financingRate: rate,
                                      paymentDetails: { ...prev.paymentDetails, financingRate: rate }
                  }));
                }}
                                  className="h-8"
              />
              </div>
            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">Tipo de Amortización</Label>
                                <Select
                                  value={split.details?.amortizationType || saleData.paymentDetails?.amortizationType || 'simple'}
                                  onValueChange={(value) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, amortizationType: value as any } 
                                        } : s
                                      ),
                                      paymentDetails: { ...prev.paymentDetails, amortizationType: value as any }
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="simple">Simple</SelectItem>
                                    <SelectItem value="french">Francesa</SelectItem>
                                    <SelectItem value="german">Alemana</SelectItem>
                                    <SelectItem value="american">Americana</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Frecuencia de Pago</Label>
                                <Select
                                  value={split.details?.paymentFrequency || saleData.paymentDetails?.paymentFrequency || 'monthly'}
                                  onValueChange={(value) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, paymentFrequency: value as any } 
                                        } : s
                                      ),
                                      paymentDetails: { ...prev.paymentDetails, paymentFrequency: value as any }
                                    }));
                                  }}
                                >
                                  <SelectTrigger className="h-8">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="daily">Diario</SelectItem>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="biweekly">Quincenal</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  id={`lateFeeEnabled-${index}`}
                                  checked={split.details?.lateFeeEnabled !== undefined ? split.details.lateFeeEnabled : (saleData.paymentDetails?.lateFeeEnabled || false)}
                                  onChange={(e) => {
                                    setSaleData(prev => ({
                                      ...prev,
                                      paymentSplits: prev.paymentSplits.map((s, i) => 
                                        i === index ? { 
                                          ...s, 
                                          details: { ...s.details, lateFeeEnabled: e.target.checked } 
                                        } : s
                                      ),
                                      paymentDetails: { ...prev.paymentDetails, lateFeeEnabled: e.target.checked }
                                    }));
                                  }}
                                  className="h-4 w-4"
                                />
                                <Label htmlFor={`lateFeeEnabled-${index}`} className="text-xs cursor-pointer">
                                  Aplicar Mora
                                </Label>
                              </div>
                              
                              {((split.details?.lateFeeEnabled !== undefined ? split.details.lateFeeEnabled : (saleData.paymentDetails?.lateFeeEnabled || false))) && (
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs">Tasa de Mora (%)</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={split.details?.lateFeeRate || saleData.paymentDetails?.lateFeeRate || companySettings?.default_late_fee_rate || 3}
                                      onChange={(e) => {
                                        const rate = parseFloat(e.target.value) || 3;
                                        setSaleData(prev => ({
                                          ...prev,
                                          paymentSplits: prev.paymentSplits.map((s, i) => 
                                            i === index ? { 
                                              ...s, 
                                              details: { ...s.details, lateFeeRate: rate } 
                                            } : s
                                          ),
                                          paymentDetails: { ...prev.paymentDetails, lateFeeRate: rate }
                                        }));
                                      }}
                                      className="h-8"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Días de Gracia</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={split.details?.gracePeriodDays || saleData.paymentDetails?.gracePeriodDays || companySettings?.grace_period_days || 3}
                                      onChange={(e) => {
                                        const days = parseInt(e.target.value) || 3;
                                        setSaleData(prev => ({
                                          ...prev,
                                          paymentSplits: prev.paymentSplits.map((s, i) => 
                                            i === index ? { 
                                              ...s, 
                                              details: { ...s.details, gracePeriodDays: days } 
                                            } : s
                                          ),
                                          paymentDetails: { ...prev.paymentDetails, gracePeriodDays: days }
                                        }));
                                      }}
                                      className="h-8"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}

              {/* Cambio (solo si hay pago en efectivo) */}
              {saleData.paymentSplits.some(s => s.method.type === 'cash') && (
                (() => {
                  const cashTotal = saleData.paymentSplits
                    .filter(s => s.method.type === 'cash')
                    .reduce((sum, s) => sum + s.amount, 0);
                  const totalPaid = saleData.paymentSplits.reduce((sum, s) => sum + s.amount, 0);
                  const change = cashTotal - (saleData.total - (totalPaid - cashTotal));
                  if (change > 0.01) {
                    return (
              <div className="p-3 bg-green-50 rounded-lg">
                        <div className="text-sm text-green-600 font-semibold">Cambio: ${change.toFixed(2)}</div>
              </div>
                    );
                  }
                  return null;
                })()
              )}
            </div>

            {/* Payment Details - Tarjeta */}
            {saleData.paymentMethod?.type === 'card' && (
              <div className="space-y-3 p-4 border rounded-lg bg-blue-50">
                <Label className="text-base font-semibold">Detalles de Tarjeta</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Tipo de Tarjeta</Label>
                    <Select
                      value={saleData.paymentDetails?.cardType || ''}
                      onValueChange={(value) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, cardType: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visa">Visa</SelectItem>
                        <SelectItem value="mastercard">Mastercard</SelectItem>
                        <SelectItem value="amex">American Express</SelectItem>
                        <SelectItem value="discover">Discover</SelectItem>
                        <SelectItem value="other">Otra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Últimos 4 dígitos</Label>
                    <Input
                      type="text"
                      maxLength={4}
                      value={saleData.paymentDetails?.cardLast4 || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, cardLast4: e.target.value.replace(/\D/g, '').slice(0, 4) }
                      }))}
                      placeholder="1234"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Nombre del Titular</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.cardHolderName || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, cardHolderName: e.target.value }
                      }))}
                      placeholder="Nombre completo"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details - Transferencia */}
            {saleData.paymentMethod?.type === 'transfer' && (
              <div className="space-y-3 p-4 border rounded-lg bg-green-50">
                <Label className="text-base font-semibold">Detalles de Transferencia</Label>
                <div className="space-y-3">
                  <div>
                    <Label className="text-sm">Banco</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.bankName || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, bankName: e.target.value }
                      }))}
                      placeholder="Nombre del banco"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Número de Cuenta</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.accountNumber || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, accountNumber: e.target.value }
                      }))}
                      placeholder="Número de cuenta"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Número de Referencia</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.referenceNumber || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, referenceNumber: e.target.value }
                      }))}
                      placeholder="Número de referencia de la transferencia"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details - Cheque */}
            {saleData.paymentMethod?.type === 'check' && (
              <div className="space-y-3 p-4 border rounded-lg bg-yellow-50">
                <Label className="text-base font-semibold">Detalles de Cheque</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Número de Cheque</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.checkNumber || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, checkNumber: e.target.value }
                      }))}
                      placeholder="Número de cheque"
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Banco</Label>
                    <Input
                      type="text"
                      value={saleData.paymentDetails?.checkBank || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, checkBank: e.target.value }
                      }))}
                      placeholder="Nombre del banco"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-sm">Fecha del Cheque</Label>
                    <Input
                      type="date"
                      value={saleData.paymentDetails?.checkDate || ''}
                      onChange={(e) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, checkDate: e.target.value }
                      }))}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Details - Financiamiento */}
            {saleData.paymentMethod?.type === 'financing' && (
              <div className="space-y-3 p-4 border rounded-lg bg-purple-50">
                <Label className="text-base font-semibold">Detalles de Financiamiento</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-sm">Plazo (meses)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      value={saleData.paymentDetails?.financingMonths || saleData.financingMonths || companySettings?.min_term_months || 12}
                      onChange={(e) => {
                        const months = parseInt(e.target.value) || companySettings?.min_term_months || 12;
                        setSaleData(prev => ({
                          ...prev,
                          financingMonths: months,
                          paymentDetails: { ...prev.paymentDetails, financingMonths: months }
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Tasa de Interés (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={saleData.paymentDetails?.financingRate || saleData.financingRate || companySettings?.interest_rate_default || 20}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 20;
                        setSaleData(prev => ({
                          ...prev,
                          financingRate: rate,
                          paymentDetails: { ...prev.paymentDetails, financingRate: rate }
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-sm">Tipo de Amortización</Label>
                    <Select
                      value={saleData.paymentDetails?.amortizationType || 'simple'}
                      onValueChange={(value) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, amortizationType: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="simple">Simple</SelectItem>
                        <SelectItem value="french">Francesa</SelectItem>
                        <SelectItem value="german">Alemana</SelectItem>
                        <SelectItem value="american">Americana</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Frecuencia de Pago</Label>
                    <Select
                      value={saleData.paymentDetails?.paymentFrequency || 'monthly'}
                      onValueChange={(value) => setSaleData(prev => ({
                        ...prev,
                        paymentDetails: { ...prev.paymentDetails, paymentFrequency: value as any }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Diaria</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="biweekly">Quincenal</SelectItem>
                        <SelectItem value="monthly">Mensual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="lateFeeEnabled"
                        checked={saleData.paymentDetails?.lateFeeEnabled || false}
                        onChange={(e) => setSaleData(prev => ({
                          ...prev,
                          paymentDetails: { ...prev.paymentDetails, lateFeeEnabled: e.target.checked }
                        }))}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="lateFeeEnabled" className="text-sm cursor-pointer">
                        Habilitar mora
                      </Label>
                    </div>
                    {saleData.paymentDetails?.lateFeeEnabled && (
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <div>
                          <Label className="text-sm">Tasa de Mora (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={saleData.paymentDetails?.lateFeeRate || companySettings?.default_late_fee_rate || 3}
                            onChange={(e) => setSaleData(prev => ({
                              ...prev,
                              paymentDetails: { ...prev.paymentDetails, lateFeeRate: parseFloat(e.target.value) || 3 }
                            }))}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Días de Gracia</Label>
                          <Input
                            type="number"
                            min="0"
                            value={saleData.paymentDetails?.gracePeriodDays || companySettings?.grace_period_days || 3}
                            onChange={(e) => setSaleData(prev => ({
                              ...prev,
                              paymentDetails: { ...prev.paymentDetails, gracePeriodDays: parseInt(e.target.value) || 3 }
                            }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 p-3 bg-white rounded border">
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Monto a financiar:</span>
                        <span className="font-semibold">${saleData.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cuota mensual estimada:</span>
                        <span className="font-semibold text-blue-600">
                          {(() => {
                            const loanAmount = saleData.total;
                            const interestRate = saleData.paymentDetails?.financingRate || saleData.financingRate || 20;
                            const termMonths = saleData.paymentDetails?.financingMonths || saleData.financingMonths || 12;
                            const amortizationType = saleData.paymentDetails?.amortizationType || 'simple';
                            
                            let estimatedPayment = 0;
                            if (amortizationType === 'french') {
                              const periodRate = interestRate / 100;
                              if (periodRate > 0) {
                                estimatedPayment = (loanAmount * periodRate * Math.pow(1 + periodRate, termMonths)) / 
                                                  (Math.pow(1 + periodRate, termMonths) - 1);
                              } else {
                                estimatedPayment = loanAmount / termMonths;
                              }
                            } else {
                              // Amortización simple
                              const monthlyInterest = (loanAmount * interestRate) / 100;
                              const monthlyPrincipal = loanAmount / termMonths;
                              estimatedPayment = monthlyInterest + monthlyPrincipal;
                            }
                            return `$${estimatedPayment.toFixed(2)}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NCF */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo de NCF</Label>
                <Select 
                  value={saleData.ncfType} 
                  onValueChange={(value) => setSaleData(prev => ({ ...prev, ncfType: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ncfTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Número de NCF</Label>
                <Input
                  value={saleData.ncfNumber}
                  onChange={(e) => setSaleData(prev => ({ ...prev, ncfNumber: e.target.value }))}
                  placeholder="B0100000001"
                />
              </div>
            </div>

            {/* Receipt format */}
            <div>
              <Label>Formato de Impresión</Label>
              <Select value={receiptFormat} onValueChange={(v)=>setReceiptFormat(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A4">A4</SelectItem>
                  <SelectItem value="POS80">Punto de Venta 80mm</SelectItem>
                  <SelectItem value="POS58">Punto de Venta 58mm</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={saleData.notes}
                onChange={(e) => setSaleData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas adicionales..."
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={processPayment} 
              aria-label="Procesar pago"
              disabled={!selectedCustomer}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Procesar Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={showReceiptModal} onOpenChange={(open) => {
        if (!open) {
          // Reiniciar completamente el POS cuando se cierra el modal
          setReceiptData(null);
          setShowPaymentModal(false); // Cerrar modal de pago si está abierto
          // Limpiar localStorage primero de forma síncrona
          try {
            localStorage.removeItem('pos_cart');
            localStorage.removeItem('pos_selected_customer');
          } catch (error) {
            console.error('Error clearing localStorage:', error);
          }
          // Luego limpiar el estado inmediatamente
          setCart([]);
          setSelectedCustomer(null);
          setSaleData({
            customer: null,
            items: [],
            subtotal: 0,
            discount: 0,
            tax: 0,
            total: 0,
            paymentMethod: null,
            paymentAmount: 0,
            change: 0,
            paymentSplits: [],
            ncfType: '01',
            ncfNumber: '',
            notes: '',
            saleType: 'cash',
            financingMonths: 0, // Se inicializará con companySettings
            financingRate: 0, // Se inicializará con companySettings
            discountMode: 'item',
            discountPercentTotal: 0,
            paymentDetails: {}
          });
        }
        setShowReceiptModal(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recibo de Venta
            </DialogTitle>
            <DialogDescription>Comprobante de venta generado</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-green-800">¡Venta Completada!</h3>
              <p className="text-green-600">Total: ${(receiptData?.total || saleData.total || 0).toFixed(2)}</p>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <Button onClick={() => generateReceipt()} variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Recibo
              </Button>
              <Button onClick={downloadReceipt} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </Button>
              <Button onClick={async () => {
                try {
                  const dataToUse = receiptData || saleData;
                  if (!dataToUse.customer) {
                    toast.error('No hay información del cliente para enviar por WhatsApp');
                    return;
                  }
                  
                  // Obtener el teléfono del cliente
                  let clientPhone = dataToUse.customer.phone;
                  if (!clientPhone && dataToUse.customer.id) {
                    // Intentar obtener el teléfono desde la base de datos
                    const { data: clientData, error: clientError } = await supabase
                      .from('clients')
                      .select('phone')
                      .eq('id', dataToUse.customer.id)
                      .single();
                    
                    if (!clientError && clientData) {
                      clientPhone = clientData.phone;
                    }
                  }
                  
                  if (!clientPhone) {
                    toast.error('No se encontró el número de teléfono del cliente');
                    return;
                  }
                  
                  const saleDate = new Date().toLocaleDateString('es-DO', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  });
                  
                  const items = (dataToUse.items && dataToUse.items.length > 0 ? dataToUse.items : cart).map((item: any) => ({
                    name: item.product.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal
                  }));
                  
                  const paymentMethods = (dataToUse.paymentSplits || []).map((split: any) => ({
                    method: split.method.type || split.method.id || 'cash',
                    amount: split.amount
                  }));
                  
                  const receiptMessage = generateSaleReceipt({
                    companyName: companyInfo.company_name || 'Mi Empresa',
                    clientName: dataToUse.customer.full_name,
                    clientDni: (dataToUse.customer as any).dni,
                    saleDate,
                    totalAmount: dataToUse.total,
                    items,
                    paymentMethods,
                    discount: dataToUse.discount || 0,
                    tax: dataToUse.tax || 0,
                    saleId: dataToUse.ncfNumber ? `${dataToUse.ncfType || '01'}-${dataToUse.ncfNumber}` : undefined
                  });
                  
                  openWhatsApp(clientPhone, receiptMessage);
                  toast.success('Abriendo WhatsApp...');
                } catch (error: any) {
                  console.error('Error abriendo WhatsApp:', error);
                  toast.error(error.message || 'Error al abrir WhatsApp');
                }
              }} variant="outline">
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              // Limpiar localStorage primero
              try {
                localStorage.removeItem('pos_cart');
                localStorage.removeItem('pos_selected_customer');
              } catch (error) {
                console.error('Error clearing localStorage:', error);
              }
              // Limpiar el estado
              setCart([]);
              setSelectedCustomer(null);
              setSaleData({
                customer: null,
                items: [],
                subtotal: 0,
                discount: 0,
                tax: 0,
                total: 0,
                paymentMethod: null,
                paymentAmount: 0,
                change: 0,
                paymentSplits: [],
                ncfType: '01',
                ncfNumber: '',
                notes: '',
                saleType: 'cash',
                financingMonths: 12,
                financingRate: 20,
                discountMode: 'item',
                discountPercentTotal: 0,
                paymentDetails: {}
              });
              setReceiptData(null);
              setShowPaymentModal(false);
              setShowReceiptModal(false);
            }}>
              Nueva Venta
            </Button>
            <Button onClick={() => {
              // Limpiar localStorage primero
              try {
                localStorage.removeItem('pos_cart');
                localStorage.removeItem('pos_selected_customer');
              } catch (error) {
                console.error('Error clearing localStorage:', error);
              }
              // Limpiar el estado
              setCart([]);
              setSelectedCustomer(null);
              setSaleData({
                customer: null,
                items: [],
                subtotal: 0,
                discount: 0,
                tax: 0,
                total: 0,
                paymentMethod: null,
                paymentAmount: 0,
                change: 0,
                paymentSplits: [],
                ncfType: '01',
                ncfNumber: '',
                notes: '',
                saleType: 'cash',
                financingMonths: 12,
                financingRate: 20,
                discountMode: 'item',
                discountPercentTotal: 0,
                paymentDetails: {}
              });
              setReceiptData(null);
              setShowPaymentModal(false);
              setShowReceiptModal(false);
            }}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Client Modal */}
      <Dialog open={showNewClientModal} onOpenChange={setShowNewClientModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Cliente</DialogTitle>
            <DialogDescription>Completa los datos básicos del cliente para crear el financiamiento</DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Nombre Completo *</Label>
              <Input
                value={newClientData.full_name}
                onChange={(e) => setNewClientData(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nombre completo del cliente"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>DNI/Cédula *</Label>
                <Input
                  value={newClientData.dni}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, dni: e.target.value }))}
                  placeholder="000-0000000-0"
                />
              </div>
              
              <div>
                <Label>Teléfono *</Label>
                <Input
                  value={newClientData.phone}
                  onChange={(e) => setNewClientData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="809-000-0000"
                />
              </div>
            </div>
            
            <div>
              <Label>Correo Electrónico</Label>
              <Input
                type="email"
                value={newClientData.email}
                onChange={(e) => setNewClientData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
              />
            </div>
            
            <div>
              <Label>Dirección</Label>
              <Textarea
                value={newClientData.address}
                onChange={(e) => setNewClientData(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Dirección completa"
                rows={2}
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <Button variant="outline" onClick={() => {
              setShowNewClientModal(false);
              setNewClientData({
                full_name: '',
                dni: '',
                phone: '',
                email: '',
                address: ''
              });
            }}>
              Cancelar
            </Button>
            <Button onClick={async () => {
              if (!newClientData.full_name || !newClientData.dni || !newClientData.phone) {
                toast.error('Debe completar los campos obligatorios (Nombre, DNI, Teléfono)');
                return;
              }

              try {
                const { data: newClient, error } = await supabase
                  .from('clients')
                  .insert([
                    {
                      user_id: user?.id,
                      full_name: newClientData.full_name,
                      dni: newClientData.dni,
                      phone: newClientData.phone,
                      email: newClientData.email || null,
                      address: newClientData.address || null,
                      status: 'active'
                    }
                  ])
                  .select()
                  .single();

                if (error) throw error;

                // Actualizar lista de clientes
                await fetchData();
                
                // Seleccionar el nuevo cliente
                selectCustomer(newClient);
                
                // Cerrar modal y limpiar datos
                setShowNewClientModal(false);
                setNewClientData({
                  full_name: '',
                  dni: '',
                  phone: '',
                  email: '',
                  address: ''
                });
                
                toast.success('Cliente creado exitosamente');
              } catch (error: any) {
                console.error('Error creating client:', error);
                toast.error('Error al crear cliente: ' + (error.message || 'Error desconocido'));
              }
            }}>
              <User className="h-4 w-4 mr-2" />
              Crear Cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de confirmación de WhatsApp */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar recibo por WhatsApp?</DialogTitle>
            <DialogDescription>
              ¿Deseas enviar el recibo de la venta al cliente por WhatsApp?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsAppDialog(false);
                setShowReceiptModal(true);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                // Obtener el teléfono del cliente si no está disponible
                let clientPhone = lastSaleData?.customer?.phone;
                
                if (!clientPhone && lastSaleData?.customer?.id) {
                  try {
                    console.log('🔍 Obteniendo teléfono del cliente desde BD para customer:', lastSaleData.customer.id);
                    const { data: clientData, error: clientError } = await supabase
                      .from('clients')
                      .select('phone')
                      .eq('id', lastSaleData.customer.id)
                      .maybeSingle();
                    
                    console.log('🔍 Client data:', clientData, 'Error:', clientError);
                    
                    if (clientData?.phone) {
                      clientPhone = clientData.phone;
                      // Actualizar lastSaleData con el teléfono
                      setLastSaleData({
                        ...lastSaleData,
                        customer: {
                          ...lastSaleData.customer,
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
                  setShowReceiptModal(true);
                  return;
                }

                try {
                  const companyName = companyInfo.company_name || 'LA EMPRESA';
                  const saleDate = formatDateStringForSantoDomingo(new Date().toISOString().split('T')[0]);
                  
                  const items = lastSaleData.cart.map((item: any) => ({
                    name: item.product.name,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    subtotal: item.subtotal
                  }));
                  
                  const paymentMethods = lastSaleData.paymentMethods.map((split: any) => ({
                    method: split.method.type || split.method.id || 'cash',
                    amount: split.amount
                  }));
                  
                  const receiptMessage = generateSaleReceipt({
                    companyName,
                    clientName: lastSaleData.customer.full_name,
                    clientDni: lastSaleData.customer.dni,
                    saleDate,
                    totalAmount: lastSaleData.saleData.total,
                    items,
                    paymentMethods,
                    discount: 0, // TODO: calcular descuento si existe
                    tax: lastSaleData.saleData.total * 0.18, // TODO: calcular ITBIS correctamente
                    saleId: lastSaleData.saleData.ncfNumber || undefined
                  });

                  openWhatsApp(clientPhone, receiptMessage);
                  toast.success('Abriendo WhatsApp...');
                } catch (error: any) {
                  console.error('Error abriendo WhatsApp:', error);
                  toast.error(error.message || 'Error al abrir WhatsApp');
                }

                setShowWhatsAppDialog(false);
                setShowReceiptModal(true);
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

export default PointOfSaleModule;
