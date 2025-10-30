
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Package, 
  Plus, 
  Search, 
  Edit,
  Trash2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  DollarSign
} from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  current_stock: number;
  min_stock: number;
  purchase_price: number;
  selling_price: number;
  unit_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const InventoryModule = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    sku: '',
    barcode: '',
    category: '',
    brand: '',
    current_stock: 0,
    min_stock: 0,
    purchase_price: 0,
    selling_price: 0,
    unit_type: 'unit',
    status: 'active'
  });

  // Campos vinculados para ITBIS
  const ITBIS_RATE = 0.18;
  const [purchaseNoTax, setPurchaseNoTax] = useState(0);
  const [purchaseWithTax, setPurchaseWithTax] = useState(0);
  const [sellingNoTax, setSellingNoTax] = useState(0);
  const [sellingWithTax, setSellingWithTax] = useState(0);
  const [autoSequential, setAutoSequential] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      fetchProducts();
      fetchAutoSequentialFlag();
    }
  }, [user]);

  const fetchAutoSequentialFlag = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('auto_sequential_codes')
        .eq('user_id', user?.id)
        .maybeSingle();
      if (!error && data) {
        setAutoSequential(!!(data as any).auto_sequential_codes);
      } else {
        // Fallback localStorage
        const local = localStorage.getItem('auto_sequential_codes');
        if (local) setAutoSequential(JSON.parse(local));
      }
    } catch {
      const local = localStorage.getItem('auto_sequential_codes');
      if (local) setAutoSequential(JSON.parse(local));
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Error al cargar productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Guardar siempre sin ITBIS en BD
      const productData = {
        ...formData,
        purchase_price: purchaseNoTax,
        selling_price: sellingNoTax,
        user_id: user.id
      };

      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast.success('Producto actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('products')
          .insert([productData]);

        if (error) throw error;
        toast.success('Producto creado exitosamente');
      }

      setShowProductForm(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (error) {
      console.error('Error saving product:', error);
      toast.error('Error al guardar producto');
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      description: product.description || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      category: product.category || '',
      brand: product.brand || '',
      current_stock: product.current_stock,
      min_stock: product.min_stock,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      unit_type: product.unit_type,
      status: product.status
    });
    // Inicializar precios vinculados
    const sNo = Number(product.selling_price || 0);
    const pNo = Number(product.purchase_price || 0);
    setSellingNoTax(sNo);
    setSellingWithTax(Number((sNo * (1 + ITBIS_RATE)).toFixed(2)));
    setPurchaseNoTax(pNo);
    setPurchaseWithTax(Number((pNo * (1 + ITBIS_RATE)).toFixed(2)));
    setShowProductForm(true);
  };

  const handleCreate = async () => {
    setEditingProduct(null);
    resetForm();
    // Si está activo auto secuencial, asignar siguiente código basado en conteo
    if (autoSequential) {
      const next = String(products.length + 1).padStart(5, '0');
      setFormData(prev => ({ ...prev, sku: next }));
    }
    setShowProductForm(true);
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este producto?')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;
      toast.success('Producto eliminado exitosamente');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Error al eliminar producto');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      sku: '',
      barcode: '',
      category: '',
      brand: '',
      current_stock: 0,
      min_stock: 0,
      purchase_price: 0,
      selling_price: 0,
      unit_type: 'unit',
      status: 'active'
    });
    setPurchaseNoTax(0);
    setPurchaseWithTax(0);
    setSellingNoTax(0);
    setSellingWithTax(0);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockProducts = products.filter(p => p.current_stock <= p.min_stock);
  const totalValue = products.reduce((sum, p) => sum + (p.current_stock * p.purchase_price), 0);
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Inventario</h1>
        <Button onClick={handleCreate} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Agregar Producto
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Productos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground">Productos registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Bajo</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{lowStockProducts.length}</div>
            <p className="text-xs text-muted-foreground">Productos con stock bajo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Valor del inventario</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categorías</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
            <p className="text-xs text-muted-foreground">Categorías activas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="productos">
        <TabsList>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="stock-bajo">Stock Bajo</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar productos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {categories.map(category => (
                      <SelectItem key={category} value={category!}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Products List */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Productos ({filteredProducts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando productos...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay productos registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredProducts.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{product.name}</h3>
                            <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                              {product.status === 'active' ? 'Activo' : 'Inactivo'}
                            </Badge>
                            {product.current_stock <= product.min_stock && (
                              <Badge variant="destructive">Stock Bajo</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">SKU:</span> {product.sku || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Stock:</span> {product.current_stock} {product.unit_type}
                            </div>
                            <div>
                              <span className="font-medium">Precio Compra:</span> ${product.purchase_price}
                            </div>
                            <div>
                              <span className="font-medium">Precio Venta:</span> ${product.selling_price}
                            </div>
                            <div>
                              <span className="font-medium">Categoría:</span> {product.category || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Marca:</span> {product.brand || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Stock Mínimo:</span> {product.min_stock}
                            </div>
                            <div>
                              <span className="font-medium">Valor Total:</span> ${(product.current_stock * product.purchase_price).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(product)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleDelete(product.id)}>
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

        <TabsContent value="stock-bajo">
          <Card>
            <CardHeader>
              <CardTitle>Productos con Stock Bajo</CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay productos con stock bajo</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {lowStockProducts.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4 border-red-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-lg">{product.name}</h3>
                          <p className="text-red-600">Stock actual: {product.current_stock} | Mínimo: {product.min_stock}</p>
                        </div>
                        <Button variant="outline" onClick={() => handleEdit(product)}>
                          Actualizar Stock
                        </Button>
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
                <CardTitle>Resumen de Inventario</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Productos totales:</span>
                    <span className="font-semibold">{products.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valor total del inventario:</span>
                    <span className="font-semibold">${totalValue.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Productos con stock bajo:</span>
                    <span className="font-semibold text-red-600">{lowStockProducts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Categorías activas:</span>
                    <span className="font-semibold">{categories.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top Productos por Valor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {products
                    .sort((a, b) => (b.current_stock * b.purchase_price) - (a.current_stock * a.purchase_price))
                    .slice(0, 5)
                    .map((product) => (
                      <div key={product.id} className="flex justify-between">
                        <span className="truncate">{product.name}</span>
                        <span className="font-semibold">${(product.current_stock * product.purchase_price).toFixed(2)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Editar Producto' : 'Agregar Producto'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="sku">Código de producto</Label>
                <Input
                  id="sku"
                  value={formData.sku}
                  onChange={(e) => setFormData({...formData, sku: e.target.value})}
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Categoría</Label>
                <Input
                  id="category"
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="brand">Marca</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="current_stock">Stock Actual</Label>
                <Input
                  id="current_stock"
                  type="number"
                  value={formData.current_stock}
                  onChange={(e) => setFormData({...formData, current_stock: Number(e.target.value)})}
                />
              </div>
              <div>
                <Label htmlFor="min_stock">Stock Mínimo</Label>
                <Input
                  id="min_stock"
                  type="number"
                  value={formData.min_stock}
                  onChange={(e) => setFormData({...formData, min_stock: Number(e.target.value)})}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Precio compra sin ITBIS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={purchaseNoTax}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setPurchaseNoTax(val);
                      setPurchaseWithTax(Number((val * (1 + ITBIS_RATE)).toFixed(2)));
                    }}
                  />
                </div>
                <div>
                  <Label>Precio compra con ITBIS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={purchaseWithTax}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setPurchaseWithTax(val);
                      setPurchaseNoTax(Number((val / (1 + ITBIS_RATE)).toFixed(2)));
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Precio venta sin ITBIS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={sellingNoTax}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setSellingNoTax(val);
                      setSellingWithTax(Number((val * (1 + ITBIS_RATE)).toFixed(2)));
                    }}
                  />
                </div>
                <div>
                  <Label>Precio venta con ITBIS</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={sellingWithTax}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setSellingWithTax(val);
                      setSellingNoTax(Number((val / (1 + ITBIS_RATE)).toFixed(2)));
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">ITBIS aplicado: 18%. Se guarda en base de datos el precio sin ITBIS.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="unit_type">Tipo de Unidad</Label>
                <Select value={formData.unit_type} onValueChange={(value) => setFormData({...formData, unit_type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit">Unidad</SelectItem>
                    <SelectItem value="kg">Kilogramo</SelectItem>
                    <SelectItem value="liter">Litro</SelectItem>
                    <SelectItem value="meter">Metro</SelectItem>
                    <SelectItem value="box">Caja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="status">Estado</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowProductForm(false);
                setEditingProduct(null);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingProduct ? 'Actualizar' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InventoryModule;
