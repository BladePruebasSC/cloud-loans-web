import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  AlertCircle
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
}

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
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

interface SaleData {
  customer: Customer | null;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod | null;
  paymentAmount: number;
  change: number;
  ncfType: string;
  ncfNumber: string;
  notes: string;
  saleType: 'cash' | 'credit' | 'financing';
  financingMonths?: number;
  financingRate?: number;
}

export const PointOfSaleModule = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState<Customer[]>([]);
  const { user } = useAuth();

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
    ncfType: '01',
    ncfNumber: '',
    notes: '',
    saleType: 'cash',
    financingMonths: 12,
    financingRate: 20
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

  // Filtrar productos para búsqueda con cascada por nombre
  useEffect(() => {
    if (productSearchTerm.trim() === '') {
      setFilteredProducts(products.filter(p => p.current_stock > 0));
    } else {
      const searchTerm = productSearchTerm.toLowerCase().trim();
      
      // Búsqueda en cascada: primero coincidencias exactas, luego parciales
      const exactMatches = products.filter(p => 
        p.current_stock > 0 && 
        p.name.toLowerCase() === searchTerm
      );
      
      const startsWithMatches = products.filter(p => 
        p.current_stock > 0 && 
        p.name.toLowerCase().startsWith(searchTerm) &&
        p.name.toLowerCase() !== searchTerm
      );
      
      const containsMatches = products.filter(p => 
        p.current_stock > 0 && 
        p.name.toLowerCase().includes(searchTerm) &&
        !p.name.toLowerCase().startsWith(searchTerm)
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
    const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = subtotal * 0.18; // 18% ITBIS
    const total = subtotal + tax - saleData.discount;
    
    setSaleData(prev => ({
      ...prev,
      subtotal,
      tax,
      total,
      items: cart
    }));
  }, [cart, saleData.discount]);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [productsRes, customersRes] = await Promise.all([
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
            created_at,
            updated_at
          `)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .gt('current_stock', 0) // Solo productos con stock disponible
          .order('name'),
        supabase
          .from('clients')
          .select('id, full_name, phone, email, rnc, address')
          .eq('user_id', user.id)
          .order('full_name')
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;

      setProducts(productsRes.data || []);
      setCustomers(customersRes.data || []);
      
      toast.success(`Inventario cargado: ${productsRes.data?.length || 0} productos disponibles`);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar inventario');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.product.id === product.id);
    
    if (existingItem) {
      updateCartItemQuantity(product.id, existingItem.quantity + 1);
    } else {
      const newItem: CartItem = {
        id: `${product.id}-${Date.now()}`,
        product,
        quantity: 1,
        unitPrice: product.selling_price || 0,
        discount: 0,
        subtotal: product.selling_price || 0
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
        const subtotal = (item.unitPrice * quantity) - item.discount;
        return { ...item, quantity, subtotal };
      }
      return item;
    }));
  };

  const updateCartItemPrice = (productId: string, price: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const subtotal = (price * item.quantity) - item.discount;
        return { ...item, unitPrice: price, subtotal };
      }
      return item;
    }));
  };

  const updateCartItemDiscount = (productId: string, discount: number) => {
    setCart(cart.map(item => {
      if (item.product.id === productId) {
        const subtotal = (item.unitPrice * item.quantity) - discount;
        return { ...item, discount, subtotal };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
    toast.success('Producto eliminado del carrito');
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(null);
    setSaleData(prev => ({
      ...prev,
      customer: null,
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      paymentMethod: null,
      paymentAmount: 0,
      change: 0
    }));
    toast.success('Carrito vaciado');
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setSaleData(prev => ({ ...prev, customer }));
    setShowCustomerModal(false);
    toast.success(`Cliente seleccionado: ${customer.full_name}`);
  };

  const processPayment = () => {
    if (cart.length === 0) {
      toast.error('El carrito está vacío');
      return;
    }

    if (!saleData.paymentMethod) {
      toast.error('Selecciona un método de pago');
      return;
    }

    if (saleData.paymentMethod.type === 'cash' && saleData.paymentAmount < saleData.total) {
      toast.error('El monto pagado es menor al total');
      return;
    }

    setShowPaymentModal(false);
    setShowReceiptModal(true);
    toast.success('Venta procesada exitosamente');
  };

  const generateReceipt = () => {
    const receiptHTML = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Venta</title>
        <style>
          @page { size: A4; margin: 0.5in; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .receipt-title { font-size: 16px; font-weight: bold; margin: 20px 0; text-align: center; text-decoration: underline; }
          .info-section { margin-bottom: 15px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .info-label { font-weight: bold; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th, .items-table td { border: 1px solid #333; padding: 8px; text-align: left; }
          .items-table th { background-color: #f0f0f0; font-weight: bold; }
          .total-section { text-align: right; margin-top: 20px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .total-label { font-weight: bold; }
          .grand-total { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">PUNTO DE VENTA</div>
          <div>Recibo de Venta</div>
        </div>

        <div class="receipt-title">RECIBO DE VENTA</div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Fecha:</span>
            <span>${new Date().toLocaleDateString('es-DO')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span>${saleData.customer?.full_name || 'Cliente General'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">NCF:</span>
            <span>${saleData.ncfNumber || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Método de Pago:</span>
            <span>${saleData.paymentMethod?.name || 'N/A'}</span>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Descuento</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${cart.map(item => `
              <tr>
                <td>${item.product.name}</td>
                <td>${item.quantity}</td>
                <td>$${item.unitPrice.toFixed(2)}</td>
                <td>$${item.discount.toFixed(2)}</td>
                <td>$${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span>$${saleData.subtotal.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Descuento:</span>
            <span>-$${saleData.discount.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span class="total-label">ITBIS (18%):</span>
            <span>$${saleData.tax.toFixed(2)}</span>
          </div>
          <div class="total-row grand-total">
            <span class="total-label">TOTAL:</span>
            <span>$${saleData.total.toFixed(2)}</span>
          </div>
          ${saleData.paymentMethod?.type === 'cash' && saleData.change > 0 ? `
          <div class="total-row">
            <span class="total-label">Cambio:</span>
            <span>$${saleData.change.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <div>Gracias por su compra</div>
          <div>Impreso el ${new Date().toLocaleDateString('es-DO')} a las ${new Date().toLocaleTimeString('es-DO')}</div>
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
    const receiptHTML = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Venta</title>
        <style>
          @page { size: A4; margin: 0.5in; }
          body { font-family: Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .company-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
          .receipt-title { font-size: 16px; font-weight: bold; margin: 20px 0; text-align: center; text-decoration: underline; }
          .info-section { margin-bottom: 15px; }
          .info-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .info-label { font-weight: bold; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th, .items-table td { border: 1px solid #333; padding: 8px; text-align: left; }
          .items-table th { background-color: #f0f0f0; font-weight: bold; }
          .total-section { text-align: right; margin-top: 20px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 5px; }
          .total-label { font-weight: bold; }
          .grand-total { font-size: 16px; font-weight: bold; border-top: 2px solid #333; padding-top: 10px; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">PUNTO DE VENTA</div>
          <div>Recibo de Venta</div>
        </div>

        <div class="receipt-title">RECIBO DE VENTA</div>

        <div class="info-section">
          <div class="info-row">
            <span class="info-label">Fecha:</span>
            <span>${new Date().toLocaleDateString('es-DO')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Cliente:</span>
            <span>${saleData.customer?.full_name || 'Cliente General'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">NCF:</span>
            <span>${saleData.ncfNumber || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Método de Pago:</span>
            <span>${saleData.paymentMethod?.name || 'N/A'}</span>
          </div>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Precio</th>
              <th>Descuento</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${cart.map(item => `
              <tr>
                <td>${item.product.name}</td>
                <td>${item.quantity}</td>
                <td>$${item.unitPrice.toFixed(2)}</td>
                <td>$${item.discount.toFixed(2)}</td>
                <td>$${item.subtotal.toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="total-section">
          <div class="total-row">
            <span class="total-label">Subtotal:</span>
            <span>$${saleData.subtotal.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span class="total-label">Descuento:</span>
            <span>-$${saleData.discount.toFixed(2)}</span>
          </div>
          <div class="total-row">
            <span class="total-label">ITBIS (18%):</span>
            <span>$${saleData.tax.toFixed(2)}</span>
          </div>
          <div class="total-row grand-total">
            <span class="total-label">TOTAL:</span>
            <span>$${saleData.total.toFixed(2)}</span>
          </div>
          ${saleData.paymentMethod?.type === 'cash' && saleData.change > 0 ? `
          <div class="total-row">
            <span class="total-label">Cambio:</span>
            <span>$${saleData.change.toFixed(2)}</span>
          </div>
          ` : ''}
        </div>

        <div class="footer">
          <div>Gracias por su compra</div>
          <div>Impreso el ${new Date().toLocaleDateString('es-DO')} a las ${new Date().toLocaleTimeString('es-DO')}</div>
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_venta_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingCart className="h-6 w-6 text-blue-600" />
              Punto de Venta
            </h1>
            <p className="text-sm text-gray-600">Sistema de ventas completo</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm text-gray-600">Cajero</div>
              <div className="font-semibold">{user?.email}</div>
            </div>
            <Button onClick={clearCart} variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Limpiar
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Products */}
        <div className="w-1/2 bg-white border-r border-gray-200 flex flex-col">
          {/* Product Search */}
          <div className="p-4 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar por nombre del producto..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
              <span>{filteredProducts.length} productos en inventario</span>
              {productSearchTerm && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-600">
                    Búsqueda: "{productSearchTerm}"
                  </span>
                  <Badge variant="outline" className="text-blue-600 border-blue-600 text-xs">
                    Cascada
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="text-center py-8">Cargando productos...</div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {productSearchTerm ? (
                  <div>
                    <p>No se encontraron productos que coincidan con</p>
                    <p className="font-semibold text-gray-700">"{productSearchTerm}"</p>
                    <p className="text-sm mt-2">Intenta con otro término de búsqueda</p>
                  </div>
                ) : (
                  <p>No hay productos disponibles en el inventario</p>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredProducts.map((product) => (
                  <Card key={product.id} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                          <div className="text-xs text-gray-600 space-y-1">
                            <p>Stock: <span className="font-semibold text-blue-600">{product.current_stock}</span></p>
                            {product.category && (
                              <p>Categoría: <span className="text-gray-500">{product.category}</span></p>
                            )}
                            {product.sku && (
                              <p>SKU: <span className="text-gray-500">{product.sku}</span></p>
                            )}
                          </div>
                          <div className="mt-2">
                            {product.selling_price ? (
                              <p className="text-sm font-bold text-green-600">${product.selling_price.toFixed(2)}</p>
                            ) : (
                              <p className="text-xs text-gray-500">Precio no definido</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className="bg-green-500 text-white text-xs">En Inventario</Badge>
                          {product.current_stock <= 5 && (
                            <Badge variant="outline" className="text-orange-600 border-orange-600 text-xs">
                              Stock Bajo
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button 
                        size="sm" 
                        onClick={() => addToCart(product)}
                        className="w-full"
                        disabled={product.current_stock === 0}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Agregar al Carrito
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Cart & Checkout */}
        <div className="w-1/2 flex flex-col">
          {/* Cart Header */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                Carrito ({cart.length})
              </h2>
              <Button 
                onClick={() => setShowCustomerModal(true)} 
                variant="outline" 
                size="sm"
              >
                <User className="h-4 w-4 mr-2" />
                {selectedCustomer ? selectedCustomer.full_name : 'Cliente'}
              </Button>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-4">
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
                      
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <Label className="text-xs">Cantidad</Label>
                          <div className="flex items-center gap-1">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => updateCartItemQuantity(item.product.id, item.quantity - 1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input 
                              type="number" 
                              value={item.quantity} 
                              onChange={(e) => updateCartItemQuantity(item.product.id, parseInt(e.target.value) || 0)}
                              className="text-center text-sm"
                              min="1"
                            />
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => updateCartItemQuantity(item.product.id, item.quantity + 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs">Precio</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={item.unitPrice} 
                            onChange={(e) => updateCartItemPrice(item.product.id, parseFloat(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">Descuento</Label>
                          <Input 
                            type="number" 
                            step="0.01"
                            value={item.discount} 
                            onChange={(e) => updateCartItemDiscount(item.product.id, parseFloat(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        
                        <div className="text-right">
                          <Label className="text-xs">Subtotal</Label>
                          <div className="font-semibold text-green-600">
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
          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>${saleData.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Descuento:</span>
                <span className="text-red-600">-${saleData.discount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>ITBIS (18%):</span>
                <span>${saleData.tax.toFixed(2)}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL:</span>
                <span className="text-green-600">${saleData.total.toFixed(2)}</span>
              </div>
            </div>
            
            <Button 
              onClick={() => setShowPaymentModal(true)} 
              className="w-full" 
              size="lg"
              disabled={cart.length === 0}
            >
              <DollarSign className="h-5 w-5 mr-2" />
              Procesar Venta
            </Button>
          </div>
        </div>
      </div>

      {/* Customer Selection Modal */}
      <Dialog open={showCustomerModal} onOpenChange={setShowCustomerModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleccionar Cliente</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Buscar cliente..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="max-h-60 overflow-y-auto space-y-2">
              <div 
                className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                onClick={() => {
                  setSelectedCustomer(null);
                  setSaleData(prev => ({ ...prev, customer: null }));
                  setShowCustomerModal(false);
                }}
              >
                <div className="font-medium">Cliente General</div>
                <div className="text-sm text-gray-600">Venta sin cliente específico</div>
              </div>
              
              {filteredCustomers.map((customer) => (
                <div 
                  key={customer.id}
                  className="p-3 border rounded-lg cursor-pointer hover:bg-gray-50"
                  onClick={() => selectCustomer(customer)}
                >
                  <div className="font-medium">{customer.full_name}</div>
                  <div className="text-sm text-gray-600">{customer.phone}</div>
                  {customer.email && (
                    <div className="text-sm text-gray-600">{customer.email}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Modal */}
      <Dialog open={showPaymentModal} onOpenChange={setShowPaymentModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Procesar Pago</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Payment Methods */}
            <div>
              <Label>Método de Pago</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {paymentMethods.map((method) => (
                  <Button
                    key={method.id}
                    variant={saleData.paymentMethod?.id === method.id ? 'default' : 'outline'}
                    onClick={() => setSaleData(prev => ({ ...prev, paymentMethod: method }))}
                    className="flex items-center gap-2"
                  >
                    {method.icon}
                    {method.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Payment Amount */}
            <div>
              <Label>Monto a Pagar</Label>
              <Input
                type="number"
                step="0.01"
                value={saleData.paymentAmount}
                onChange={(e) => {
                  const amount = parseFloat(e.target.value) || 0;
                  const change = amount - saleData.total;
                  setSaleData(prev => ({ 
                    ...prev, 
                    paymentAmount: amount,
                    change: Math.max(0, change)
                  }));
                }}
                placeholder="0.00"
              />
            </div>

            {/* Change Display */}
            {saleData.paymentMethod?.type === 'cash' && saleData.change > 0 && (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-sm text-green-600">Cambio: ${saleData.change.toFixed(2)}</div>
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
            <Button onClick={processPayment}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Procesar Pago
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Modal */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Recibo de Venta
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-2" />
              <h3 className="text-lg font-semibold text-green-800">¡Venta Completada!</h3>
              <p className="text-green-600">Total: ${saleData.total.toFixed(2)}</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={generateReceipt} variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Imprimir Recibo
              </Button>
              <Button onClick={downloadReceipt} variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Descargar PDF
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => {
              setShowReceiptModal(false);
              clearCart();
            }}>
              Nueva Venta
            </Button>
            <Button onClick={() => setShowReceiptModal(false)}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PointOfSaleModule;
