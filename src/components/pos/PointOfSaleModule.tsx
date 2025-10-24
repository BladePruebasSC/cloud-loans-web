import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
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
  Download
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  current_stock: number;
  description?: string;
}

interface SaleData {
  product_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  customer_rnc: string;
  customer_address: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: 'cash' | 'card' | 'transfer' | 'check';
  sale_type: 'cash' | 'credit';
  ncf_type: '01' | '02' | '03' | '04' | '14' | '15';
  ncf_number: string;
  notes: string;
}

export const PointOfSaleModule = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [quickSaleMode, setQuickSaleMode] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [saleType, setSaleType] = useState<'cash' | 'credit'>('cash');
  const { user } = useAuth();

  const [saleData, setSaleData] = useState<SaleData>({
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

  useEffect(() => {
    if (user) {
      fetchProducts();
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

  const fetchProducts = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('products')
        .select('id, name, current_stock, description')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('name');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
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
      fetchProducts();
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
      fetchProducts();
    } catch (error) {
      console.error('Error creating sale:', error);
      toast.error('Error al registrar venta');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Punto de Venta</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setShowSaleForm(true)} className="w-full sm:w-auto">
            <DollarSign className="h-4 w-4 mr-2" />
            Nueva Venta
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productos Disponibles</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.filter(p => p.current_stock > 0).length}</div>
            <p className="text-xs text-muted-foreground">En stock</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">En inventario</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sin Stock</CardTitle>
            <Package className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{products.filter(p => p.current_stock === 0).length}</div>
            <p className="text-xs text-muted-foreground">Agotados</p>
          </CardContent>
        </Card>
      </div>

      {/* Product Search and Grid */}
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
                      {product.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
                      )}
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

      {/* Sale Form Dialog */}
      <Dialog open={showSaleForm} onOpenChange={setShowSaleForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Nueva Venta
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

export default PointOfSaleModule;
