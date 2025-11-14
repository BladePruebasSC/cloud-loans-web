
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
  DollarSign,
  ShoppingCart,
  ArrowUpDown,
  Printer,
  Download,
  FileText,
  Eye,
  Minus,
  Save,
  X
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
  itbis_rate?: number | null;
  created_at: string;
  updated_at: string;
}

interface Sale {
  id: string;
  sale_date: string | null;
  total_amount: number | null;
  payment_method: string | null;
  notes: string | null;
  sale_number: string;
  client_id: string | null;
  status: string | null;
  created_at?: string;
}

interface SaleDetail {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  product?: Product;
}

interface SaleWithDetails extends Sale {
  details: SaleDetail[];
  client_name?: string;
}

interface Movement {
  id: string;
  type: 'sale' | 'purchase' | 'adjustment';
  product_id: string;
  product_name: string;
  quantity: number;
  date: string;
  reference: string;
  user_name?: string;
}

const InventoryModule = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBrand, setSelectedBrand] = useState('all');
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const { user } = useAuth();
  
  // Estados para filtros de Stock Bajo
  const [lowStockCategoryFilter, setLowStockCategoryFilter] = useState<string>('');
  const [lowStockBrandFilter, setLowStockBrandFilter] = useState<string>('');
  const [showLowStockCategorySuggestions, setShowLowStockCategorySuggestions] = useState(false);
  const [lowStockCategorySuggestions, setLowStockCategorySuggestions] = useState<string[]>([]);
  const [showLowStockBrandSuggestions, setShowLowStockBrandSuggestions] = useState(false);
  const [lowStockBrandSuggestions, setLowStockBrandSuggestions] = useState<string[]>([]);
  
  // Estados para ventas POS
  const [sales, setSales] = useState<SaleWithDetails[]>([]);
  const [loadingSales, setLoadingSales] = useState(false);
  
  // Función para obtener fecha actual con hora (00:00:00)
  const getTodayStart = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T00:00`; // Formato para datetime-local
  };
  
  // Función para obtener fecha actual con hora (23:59)
  const getTodayEnd = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}T23:59`; // Formato para datetime-local
  };
  
  const [salesDateFrom, setSalesDateFrom] = useState<string>('');
  const [salesDateTo, setSalesDateTo] = useState<string>('');
  const [salesProductFilter, setSalesProductFilter] = useState<string>('');
  const [salesCategoryFilter, setSalesCategoryFilter] = useState<string>('');
  const [salesBrandFilter, setSalesBrandFilter] = useState<string>('');
  const [showSalesProductSuggestions, setShowSalesProductSuggestions] = useState(false);
  const [salesProductSuggestions, setSalesProductSuggestions] = useState<Product[]>([]);
  const [showSalesCategorySuggestions, setShowSalesCategorySuggestions] = useState(false);
  const [salesCategorySuggestions, setSalesCategorySuggestions] = useState<string[]>([]);
  const [showSalesBrandSuggestions, setShowSalesBrandSuggestions] = useState(false);
  const [salesBrandSuggestions, setSalesBrandSuggestions] = useState<string[]>([]);
  
  // Inicializar fechas por defecto al montar el componente
  useEffect(() => {
    if (!salesDateFrom && !salesDateTo) {
      const start = getTodayStart();
      const end = getTodayEnd();
      setSalesDateFrom(start);
      setSalesDateTo(end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Estados para movimientos
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [movementDateFrom, setMovementDateFrom] = useState<string>('');
  const [movementDateTo, setMovementDateTo] = useState<string>('');
  const [movementProductFilter, setMovementProductFilter] = useState<string>('');
  const [movementCategoryFilter, setMovementCategoryFilter] = useState<string>('');
  const [movementBrandFilter, setMovementBrandFilter] = useState<string>('');
  const [showMovementProductSuggestions, setShowMovementProductSuggestions] = useState(false);
  const [movementProductSuggestions, setMovementProductSuggestions] = useState<Product[]>([]);
  const [showMovementCategorySuggestions, setShowMovementCategorySuggestions] = useState(false);
  const [movementCategorySuggestions, setMovementCategorySuggestions] = useState<string[]>([]);
  const [showMovementBrandSuggestions, setShowMovementBrandSuggestions] = useState(false);
  const [movementBrandSuggestions, setMovementBrandSuggestions] = useState<string[]>([]);
  
  // Estados para acciones de ventas
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null);
  const [showSaleDetails, setShowSaleDetails] = useState(false);

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
  const [itbisRate, setItbisRate] = useState(18); // Porcentaje de ITBIS (por defecto 18%)
  const ITBIS_RATE = itbisRate / 100; // Convertir porcentaje a decimal
  const [purchaseNoTax, setPurchaseNoTax] = useState(0);
  const [purchaseWithTax, setPurchaseWithTax] = useState(0);
  const [sellingNoTax, setSellingNoTax] = useState(0);
  const [sellingWithTax, setSellingWithTax] = useState(0);
  const [autoSequential, setAutoSequential] = useState<boolean>(false);
  const [showCategorySuggestions, setShowCategorySuggestions] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const [brandSuggestions, setBrandSuggestions] = useState<string[]>([]);
  const [brandSearch, setBrandSearch] = useState('');

  useEffect(() => {
    if (user) {
      fetchProducts();
      fetchAutoSequentialFlag();
    }
  }, [user]);

  // Cargar ventas cuando cambian los filtros
  useEffect(() => {
    if (user) {
      fetchSales();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, salesDateFrom, salesDateTo, salesProductFilter, salesCategoryFilter, salesBrandFilter]);

  // Cargar movimientos cuando cambian los filtros
  useEffect(() => {
    if (user) {
      fetchMovements();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, movementDateFrom, movementDateTo, movementProductFilter, movementCategoryFilter, movementBrandFilter]);

  // Obtener categorías únicas de productos existentes
  const getAllCategories = () => {
    const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
    return uniqueCategories.sort();
  };

  // Manejar búsqueda de categoría con cascada (exacto, empieza con, contiene)
  const handleCategorySearch = (searchTerm: string) => {
    setCategorySearch(searchTerm);
    setFormData({...formData, category: searchTerm});
    
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
    setFormData({...formData, category});
    setShowCategorySuggestions(false);
    setCategorySuggestions([]);
  };

  // Obtener marcas únicas de productos existentes
  const getAllBrands = () => {
    const uniqueBrands = [...new Set(products.map(p => p.brand).filter(Boolean))] as string[];
    return uniqueBrands.sort();
  };

  // Manejar búsqueda de marca con cascada (exacto, empieza con, contiene)
  const handleBrandSearch = (searchTerm: string) => {
    setBrandSearch(searchTerm);
    setFormData({...formData, brand: searchTerm});
    
    if (searchTerm.trim() === '') {
      setBrandSuggestions([]);
      setShowBrandSuggestions(false);
      return;
    }

    const allBrands = getAllBrands();
    const searchLower = searchTerm.toLowerCase().trim();
    
    // Búsqueda en cascada: primero coincidencias exactas, luego que empiezan con, luego que contienen
    const exactMatches = allBrands.filter(brand => 
      brand.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allBrands.filter(brand => 
      brand.toLowerCase().startsWith(searchLower) && brand.toLowerCase() !== searchLower
    );
    
    const containsMatches = allBrands.filter(brand => 
      brand.toLowerCase().includes(searchLower) && !brand.toLowerCase().startsWith(searchLower)
    );
    
    // Combinar resultados en orden de prioridad
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setBrandSuggestions(filtered);
    setShowBrandSuggestions(filtered.length > 0);
  };

  // Seleccionar marca de sugerencias
  const selectBrand = (brand: string) => {
    setBrandSearch(brand);
    setFormData({...formData, brand});
    setShowBrandSuggestions(false);
    setBrandSuggestions([]);
  };

  // Funciones de búsqueda para filtros de Stock Bajo
  const handleLowStockCategorySearch = (searchTerm: string) => {
    setLowStockCategoryFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setLowStockCategorySuggestions([]);
      setShowLowStockCategorySuggestions(false);
      return;
    }

    const allCategories = getAllCategories();
    const searchLower = searchTerm.toLowerCase().trim();
    
    const exactMatches = allCategories.filter(cat => 
      cat.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allCategories.filter(cat => 
      cat.toLowerCase().startsWith(searchLower) && cat.toLowerCase() !== searchLower
    );
    
    const containsMatches = allCategories.filter(cat => 
      cat.toLowerCase().includes(searchLower) && !cat.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setLowStockCategorySuggestions(filtered);
    setShowLowStockCategorySuggestions(filtered.length > 0);
  };

  const handleLowStockBrandSearch = (searchTerm: string) => {
    setLowStockBrandFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setLowStockBrandSuggestions([]);
      setShowLowStockBrandSuggestions(false);
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
    
    setLowStockBrandSuggestions(filtered);
    setShowLowStockBrandSuggestions(filtered.length > 0);
  };

  // Funciones de búsqueda para filtros de Ventas POS
  const handleSalesProductSearch = (searchTerm: string) => {
    setSalesProductFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setSalesProductSuggestions([]);
      setShowSalesProductSuggestions(false);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const exactMatches = products.filter(p => 
      p.name.toLowerCase() === searchLower || p.id === searchTerm
    );
    
    const startsWithMatches = products.filter(p => 
      (p.name.toLowerCase().startsWith(searchLower) || (p.sku && p.sku.toLowerCase().startsWith(searchLower))) &&
      p.name.toLowerCase() !== searchLower
    );
    
    const containsMatches = products.filter(p => 
      (p.name.toLowerCase().includes(searchLower) || (p.sku && p.sku.toLowerCase().includes(searchLower))) &&
      !p.name.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches].slice(0, 10);
    
    setSalesProductSuggestions(filtered);
    setShowSalesProductSuggestions(filtered.length > 0);
  };

  const handleSalesCategorySearch = (searchTerm: string) => {
    setSalesCategoryFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setSalesCategorySuggestions([]);
      setShowSalesCategorySuggestions(false);
      return;
    }

    const allCategories = getAllCategories();
    const searchLower = searchTerm.toLowerCase().trim();
    
    const exactMatches = allCategories.filter(cat => 
      cat.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allCategories.filter(cat => 
      cat.toLowerCase().startsWith(searchLower) && cat.toLowerCase() !== searchLower
    );
    
    const containsMatches = allCategories.filter(cat => 
      cat.toLowerCase().includes(searchLower) && !cat.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setSalesCategorySuggestions(filtered);
    setShowSalesCategorySuggestions(filtered.length > 0);
  };

  const handleSalesBrandSearch = (searchTerm: string) => {
    setSalesBrandFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setSalesBrandSuggestions([]);
      setShowSalesBrandSuggestions(false);
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
    
    setSalesBrandSuggestions(filtered);
    setShowSalesBrandSuggestions(filtered.length > 0);
  };

  // Funciones de búsqueda para filtros de Movimientos
  const handleMovementProductSearch = (searchTerm: string) => {
    setMovementProductFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setMovementProductSuggestions([]);
      setShowMovementProductSuggestions(false);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    const exactMatches = products.filter(p => 
      p.name.toLowerCase() === searchLower || p.id === searchTerm
    );
    
    const startsWithMatches = products.filter(p => 
      (p.name.toLowerCase().startsWith(searchLower) || (p.sku && p.sku.toLowerCase().startsWith(searchLower))) &&
      p.name.toLowerCase() !== searchLower
    );
    
    const containsMatches = products.filter(p => 
      (p.name.toLowerCase().includes(searchLower) || (p.sku && p.sku.toLowerCase().includes(searchLower))) &&
      !p.name.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches].slice(0, 10);
    
    setMovementProductSuggestions(filtered);
    setShowMovementProductSuggestions(filtered.length > 0);
  };

  const handleMovementCategorySearch = (searchTerm: string) => {
    setMovementCategoryFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setMovementCategorySuggestions([]);
      setShowMovementCategorySuggestions(false);
      return;
    }

    const allCategories = getAllCategories();
    const searchLower = searchTerm.toLowerCase().trim();
    
    const exactMatches = allCategories.filter(cat => 
      cat.toLowerCase() === searchLower
    );
    
    const startsWithMatches = allCategories.filter(cat => 
      cat.toLowerCase().startsWith(searchLower) && cat.toLowerCase() !== searchLower
    );
    
    const containsMatches = allCategories.filter(cat => 
      cat.toLowerCase().includes(searchLower) && !cat.toLowerCase().startsWith(searchLower)
    );
    
    const filtered = [...exactMatches, ...startsWithMatches, ...containsMatches];
    
    setMovementCategorySuggestions(filtered);
    setShowMovementCategorySuggestions(filtered.length > 0);
  };

  const handleMovementBrandSearch = (searchTerm: string) => {
    setMovementBrandFilter(searchTerm);
    
    if (searchTerm.trim() === '') {
      setMovementBrandSuggestions([]);
      setShowMovementBrandSuggestions(false);
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
    
    setMovementBrandSuggestions(filtered);
    setShowMovementBrandSuggestions(filtered.length > 0);
  };

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

  const fetchSales = async () => {
    try {
      setLoadingSales(true);
      // Obtener todas las ventas - usar select('*') para obtener todas las columnas disponibles
      // No aplicar filtros de fecha aquí, los aplicaremos después manualmente para evitar errores
      let query = supabase
        .from('sales')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      const { data: salesData, error: salesError } = await query;

      if (salesError) {
        console.error('Error fetching sales:', salesError);
        toast.error(`Error al cargar ventas: ${salesError.message}`);
        setSales([]);
        return;
      }

      console.log('Ventas encontradas:', salesData?.length || 0);

      // Filtrar por fecha manualmente (incluyendo horas)
      let filteredSales = salesData || [];
      if (salesDateFrom || salesDateTo) {
        filteredSales = filteredSales.filter(sale => {
          const saleAny = sale as any;
          const saleDate = saleAny.sale_date || saleAny.created_at;
          if (!saleDate) return false;
          
          const date = new Date(saleDate);
          
          if (salesDateFrom) {
            const fromDate = new Date(salesDateFrom);
            if (date < fromDate) return false;
          }
          
          if (salesDateTo) {
            const toDate = new Date(salesDateTo);
            // Agregar 1 segundo para incluir hasta el final del minuto seleccionado
            toDate.setSeconds(59, 999);
            if (date > toDate) return false;
          }
          
          return true;
        });
      }

      // Procesar datos completos
      const salesWithDetails: SaleWithDetails[] = [];
      
      for (const sale of filteredSales) {
        const saleAny = sale as any;
        let saleDetails: SaleDetail[] = [];
        
        // Intentar obtener sale_details primero (esquema nuevo)
        const { data: details, error: detailsError } = await supabase
          .from('sale_details')
          .select(`
            id,
            sale_id,
            product_id,
            quantity,
            unit_price,
            total_price,
            products (
              id,
              name,
              sku,
              category
            )
          `)
          .eq('sale_id', sale.id);

        if (!detailsError && details && details.length > 0) {
          // Esquema nuevo con sale_details
          saleDetails = details.map(d => ({
            id: d.id,
            sale_id: d.sale_id,
            product_id: d.product_id,
            quantity: d.quantity,
            unit_price: d.unit_price,
            total_price: d.total_price,
            product: d.products as any
          }));
        } else if (saleAny.product_id) {
          // Esquema simple: datos directos en sales
          const { data: product } = await supabase
            .from('products')
            .select('*')
            .eq('id', saleAny.product_id)
            .single();
          
          if (product) {
            saleDetails = [{
              id: sale.id,
              sale_id: sale.id,
              product_id: product.id,
              quantity: saleAny.quantity || 0,
              unit_price: saleAny.unit_price || 0,
              total_price: saleAny.total_price || 0,
              product
            }];
          }
        }

        // Obtener nombre del cliente
        let clientName = 'Cliente General';
        if (saleAny.client_id) {
          const { data: client } = await supabase
            .from('clients')
            .select('full_name')
            .eq('id', saleAny.client_id)
            .single();
          if (client) {
            clientName = client.full_name;
          }
        } else if (saleAny.customer_name) {
          // Esquema simple usa customer_name
          clientName = saleAny.customer_name;
        }

        // Aplicar filtros de producto, categoría y marca
        const matchesProduct = !salesProductFilter || 
            saleDetails.length === 0 || // Si no hay detalles, mostrar igual
            saleDetails.some(d => d.product_id === salesProductFilter || d.product?.name === salesProductFilter);
        
        const matchesCategory = !salesCategoryFilter || 
            saleDetails.length === 0 ||
            saleDetails.some(d => d.product?.category === salesCategoryFilter);
        
        const matchesBrand = !salesBrandFilter || 
            saleDetails.length === 0 ||
            saleDetails.some(d => d.product?.brand === salesBrandFilter);
        
        if (matchesProduct && matchesCategory && matchesBrand) {
          salesWithDetails.push({
            id: sale.id,
            sale_date: saleAny.sale_date || saleAny.created_at,
            total_amount: saleAny.total_amount || saleAny.total_price || 0,
            payment_method: saleAny.payment_method || null,
            notes: saleAny.notes || null,
            sale_number: saleAny.sale_number || sale.id.substring(0, 8),
            client_id: saleAny.client_id || null,
            status: saleAny.status || 'completed',
            details: saleDetails,
            client_name: clientName
          });
        }
      }

      console.log('Ventas procesadas:', salesWithDetails.length);
      setSales(salesWithDetails);
    } catch (error) {
      console.error('Error fetching sales:', error);
      toast.error('Error al cargar ventas');
    } finally {
      setLoadingSales(false);
    }
  };

  const fetchMovements = async () => {
    try {
      setLoadingMovements(true);
      const movementsList: Movement[] = [];

      // Obtener movimientos de ventas (salidas)
      let salesQuery = supabase
        .from('sales')
        .select(`
          id,
          sale_date,
          created_at
        `)
        .eq('user_id', user?.id);

      if (movementDateFrom) {
        salesQuery = salesQuery.gte('sale_date', movementDateFrom);
      }
      if (movementDateTo) {
        salesQuery = salesQuery.lte('sale_date', movementDateTo);
      }

      const { data: salesData } = await salesQuery;

      // Obtener detalles de ventas
      for (const sale of salesData || []) {
        const { data: details } = await supabase
          .from('sale_details')
          .select(`
            id,
            product_id,
            quantity,
            products (
              id,
              name,
              category,
              brand
            )
          `)
          .eq('sale_id', sale.id);

        if (details) {
          for (const detail of details) {
            const product = (detail.products as any);
            if (!product) continue;

            // Aplicar filtros de producto, categoría y marca
            if (movementProductFilter !== 'all' && detail.product_id !== movementProductFilter) {
              continue;
            }
            if (movementCategoryFilter !== 'all' && product.category !== movementCategoryFilter) {
              continue;
            }
            if (movementBrandFilter !== 'all' && product.brand !== movementBrandFilter) {
              continue;
            }

            movementsList.push({
              id: detail.id,
              type: 'sale',
              product_id: detail.product_id,
              product_name: product.name || 'Producto desconocido',
              quantity: -detail.quantity, // Negativo porque es salida
              date: sale.sale_date || sale.created_at,
              reference: `Venta #${sale.id.substring(0, 8)}`
            });
          }
        } else {
          // Fallback para esquema simple
          if ((sale as any).product_id) {
            const { data: product } = await supabase
              .from('products')
              .select('name, category, brand')
              .eq('id', (sale as any).product_id)
              .single();

            if (product) {
              // Aplicar filtros de producto, categoría y marca
              const matchesProduct = !movementProductFilter || (sale as any).product_id === movementProductFilter || product.name === movementProductFilter;
              const matchesCategory = !movementCategoryFilter || product.category === movementCategoryFilter;
              const matchesBrand = !movementBrandFilter || product.brand === movementBrandFilter;
              
              if (matchesProduct && matchesCategory && matchesBrand) {
                movementsList.push({
                  id: sale.id,
                  type: 'sale',
                  product_id: (sale as any).product_id,
                  product_name: product.name || 'Producto desconocido',
                  quantity: -((sale as any).quantity || 0),
                  date: sale.sale_date || sale.created_at,
                  reference: `Venta #${sale.id.substring(0, 8)}`
                });
              }
            }
          }
        }
      }

      // Obtener movimientos de compras (entradas) si existe la tabla purchases
      try {
        const { data: purchasesData } = await supabase
          .from('purchases')
          .select(`
            id,
            purchase_date,
            created_at
          `)
          .eq('user_id', user?.id);

        for (const purchase of purchasesData || []) {
          const { data: purchaseDetails } = await supabase
            .from('purchase_details')
            .select(`
              id,
              product_id,
              quantity,
              products (
                id,
                name,
                category,
                brand
              )
            `)
            .eq('purchase_id', purchase.id);

          if (purchaseDetails) {
            for (const detail of purchaseDetails) {
              const product = (detail.products as any);
              if (!product) continue;

              // Aplicar filtros de producto, categoría y marca
              const matchesProduct = !movementProductFilter || detail.product_id === movementProductFilter || product.name === movementProductFilter;
              const matchesCategory = !movementCategoryFilter || product.category === movementCategoryFilter;
              const matchesBrand = !movementBrandFilter || product.brand === movementBrandFilter;
              
              if (!matchesProduct || !matchesCategory || !matchesBrand) {
                continue;
              }

              movementsList.push({
                id: detail.id,
                type: 'purchase',
                product_id: detail.product_id,
                product_name: product.name || 'Producto desconocido',
                quantity: detail.quantity, // Positivo porque es entrada
                date: purchase.purchase_date || purchase.created_at,
                reference: `Compra #${purchase.id.substring(0, 8)}`
              });
            }
          }
        }
      } catch (error) {
        // La tabla purchases puede no existir, ignorar
        console.log('Purchases table not available');
      }

      // Ordenar por fecha descendente
      movementsList.sort((a, b) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      setMovements(movementsList);
    } catch (error) {
      console.error('Error fetching movements:', error);
      toast.error('Error al cargar movimientos');
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      // Guardar siempre sin ITBIS en BD
      // Asegurar que category y brand usen los valores de búsqueda si están disponibles
      // Convertir SKU y barcode vacíos a null para evitar problemas con restricciones únicas
      const skuValue = formData.sku?.trim() || null;
      const barcodeValue = formData.barcode?.trim() || null;
      
      const productData = {
        ...formData,
        sku: skuValue,
        barcode: barcodeValue,
        category: categorySearch.trim() || formData.category.trim() || null,
        brand: brandSearch.trim() || formData.brand.trim() || null,
        purchase_price: purchaseNoTax,
        selling_price: sellingNoTax,
        itbis_rate: itbisRate,
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
    } catch (error: any) {
      console.error('Error saving product:', error);
      
      // Manejar errores específicos
      if (error?.code === '23505') {
        // Violación de restricción única
        if (error?.message?.includes('sku')) {
          toast.error('El código de producto (SKU) ya existe. Por favor, use un código diferente o déjelo vacío.');
        } else if (error?.message?.includes('barcode')) {
          toast.error('El código de barras ya existe. Por favor, use un código diferente o déjelo vacío.');
        } else {
          toast.error('Ya existe un producto con estos datos. Verifique que el código o código de barras sean únicos.');
        }
      } else {
        toast.error(`Error al guardar producto: ${error?.message || 'Error desconocido'}`);
      }
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const category = product.category || '';
    const brand = product.brand || '';
    // Cargar el ITBIS rate del producto, o usar 18% como defecto
    const productItbisRate = product.itbis_rate ?? 18;
    setItbisRate(productItbisRate);
    
    setFormData({
      name: product.name,
      description: product.description || '',
      sku: product.sku || '',
      barcode: product.barcode || '',
      category: category,
      brand: brand,
      current_stock: product.current_stock,
      min_stock: product.min_stock,
      purchase_price: product.purchase_price,
      selling_price: product.selling_price,
      unit_type: product.unit_type,
      status: product.status
    });
    setCategorySearch(category);
    setBrandSearch(brand);
    // Inicializar precios vinculados usando el ITBIS rate del producto
    const productItbisDecimal = productItbisRate / 100;
    const sNo = Number(product.selling_price || 0);
    const pNo = Number(product.purchase_price || 0);
    setSellingNoTax(sNo);
    setSellingWithTax(Number((sNo * (1 + productItbisDecimal)).toFixed(2)));
    setPurchaseNoTax(pNo);
    setPurchaseWithTax(Number((pNo * (1 + productItbisDecimal)).toFixed(2)));
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
    setItbisRate(18); // Resetear a 18% por defecto
    setPurchaseNoTax(0);
    setPurchaseWithTax(0);
    setSellingNoTax(0);
    setSellingWithTax(0);
    setCategorySearch('');
    setShowCategorySuggestions(false);
    setCategorySuggestions([]);
    setBrandSearch('');
    setShowBrandSuggestions(false);
    setBrandSuggestions([]);
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesBrand = selectedBrand === 'all' || product.brand === selectedBrand;
    return matchesSearch && matchesCategory && matchesBrand;
  });

  // Stock bajo: productos con stock actual igual o menor al stock mínimo
  // Aplicar filtros de categoría y marca
  const lowStockProducts = products.filter(p => {
    const matchesLowStock = p.current_stock <= p.min_stock;
    const matchesCategory = !lowStockCategoryFilter || p.category === lowStockCategoryFilter;
    const matchesBrand = !lowStockBrandFilter || p.brand === lowStockBrandFilter;
    return matchesLowStock && matchesCategory && matchesBrand;
  });
  const totalValue = products.reduce((sum, p) => sum + (p.current_stock * p.purchase_price), 0);
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
  const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];

  // Funciones para acciones de ventas
  const handleViewSaleDetails = (sale: SaleWithDetails) => {
    setSelectedSale(sale);
    setShowSaleDetails(true);
  };



  const generateReceiptFromSale = (sale: SaleWithDetails, format: 'A4' | 'POS80' | 'POS58' = 'A4') => {
    const invoiceNumber = `${sale.id.substring(0, 8)}`;
    const companyName = 'SH Computers'; // Puedes obtener esto de company_settings
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const itemsRows = sale.details.map(detail => `
      <tr>
        <td>${detail.product?.name || 'Producto desconocido'}</td>
        <td class="right">${detail.quantity}</td>
        <td class="right">${money(detail.unit_price)}</td>
        <td class="right">${money(detail.total_price)}</td>
      </tr>
    `).join('');

    const pageCss = format === 'A4'
      ? '@page { size: A4; margin: 18mm; } .invoice{max-width:800px;margin:0 auto;}'
      : format === 'POS80'
        ? '@page { size: 80mm auto; margin: 4mm; } .invoice{width:72mm;margin:0 auto;}'
        : '@page { size: 58mm auto; margin: 3mm; } .invoice{width:54mm;margin:0 auto;}';
    const smallCss = format === 'A4' ? '' : '.brand-logo{display:none}.grid-2{grid-template-columns:1fr}.section{padding:8px}.brand-name{font-size:14px}.doc-type{font-size:16px}.summary{padding:6px}.sum-row{padding:4px 0} table th,table td{padding:6px} body{font-size:11px}';

    const receiptHTML = `
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
          .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 2px solid #111827; }
          .brand-name { font-size: 18px; font-weight: 700; }
          .doc-type { font-size: 22px; font-weight: 700; letter-spacing: 0.5px; }
          .doc-number { font-size: 12px; color: #374151; margin-top: 4px; }
          .section { margin-top: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          thead th { background: #f9fafb; font-size: 12px; text-align: left; }
          .right { text-align: right; }
          .summary { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; }
          .sum-row { display: flex; justify-content: space-between; padding: 6px 0; }
          .sum-row.total { border-top: 2px solid #111827; margin-top: 6px; padding-top: 10px; font-weight: 800; font-size: 14px; }
          ${smallCss}
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            <div>
              <div class="doc-type">FACTURA</div>
              <div class="doc-number">Venta #${invoiceNumber}</div>
            </div>
          </div>
          <div class="section">
            <div><strong>Cliente:</strong> ${sale.client_name || 'Cliente General'}</div>
            <div><strong>Fecha:</strong> ${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') : 'N/A'}</div>
            <div><strong>Método de pago:</strong> ${sale.payment_method || 'N/A'}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Descripción</th>
                <th class="right">Cant.</th>
                <th class="right">Precio</th>
                <th class="right">Importe</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
          </table>
          <div class="summary">
            <div class="sum-row total">
              <span>Total</span>
              <span>${money(sale.total_amount || 0)}</span>
            </div>
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

  const downloadReceiptFromSale = (sale: SaleWithDetails) => {
    const invoiceNumber = `${sale.id.substring(0, 8)}`;
    const companyName = 'SH Computers';
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const itemsRows = sale.details.map(detail => `
      <tr>
        <td>${detail.product?.name || 'Producto desconocido'}</td>
        <td class="right">${detail.quantity}</td>
        <td class="right">${money(detail.unit_price)}</td>
        <td class="right">${money(detail.total_price)}</td>
      </tr>
    `).join('');

    const receiptHTML = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Factura ${invoiceNumber}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; }
          .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 12px; }
          .brand-name { font-size: 18px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
          .right { text-align: right; }
          .total { font-weight: 800; font-size: 14px; border-top: 2px solid #111827; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand-name">${companyName}</div>
          <div>Factura #${invoiceNumber}</div>
        </div>
        <div>
          <div><strong>Cliente:</strong> ${sale.client_name || 'Cliente General'}</div>
          <div><strong>Fecha:</strong> ${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') : 'N/A'}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Descripción</th>
              <th class="right">Cant.</th>
              <th class="right">Precio</th>
              <th class="right">Importe</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
        <div class="total" style="text-align: right; margin-top: 12px;">
          Total: ${money(sale.total_amount || 0)}
        </div>
      </body>
      </html>
    `;

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `factura_${invoiceNumber}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{lowStockProducts.length}</div>
                <p className="text-xs text-muted-foreground">Productos con stock igual o menor al mínimo</p>
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
          <TabsTrigger value="ventas-pos">Ventas POS</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Input
                    placeholder="Buscar productos..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="relative">
                  <Input
                    placeholder="Buscar categoría..."
                    value={selectedCategory === 'all' ? '' : selectedCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedCategory(val || 'all');
                      if (val) handleCategorySearch(val);
                    }}
                    onFocus={() => {
                      if (selectedCategory !== 'all') {
                        handleCategorySearch(selectedCategory);
                      } else {
                        const allCategories = getAllCategories();
                        setCategorySuggestions(allCategories);
                        setShowCategorySuggestions(allCategories.length > 0);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowCategorySuggestions(false), 200);
                    }}
                  />
                  {showCategorySuggestions && categorySuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      <div
                        className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedCategory('all');
                          setShowCategorySuggestions(false);
                        }}
                      >
                        <div className="font-medium text-gray-500">Todas las categorías</div>
                      </div>
                      {categorySuggestions.map((category, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectCategory(category);
                            setSelectedCategory(category);
                          }}
                        >
                          <div className="font-medium">{category}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Input
                    placeholder="Buscar marca..."
                    value={selectedBrand === 'all' ? '' : selectedBrand}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedBrand(val || 'all');
                      if (val) handleBrandSearch(val);
                    }}
                    onFocus={() => {
                      if (selectedBrand !== 'all') {
                        handleBrandSearch(selectedBrand);
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
                      <div
                        className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSelectedBrand('all');
                          setShowBrandSuggestions(false);
                        }}
                      >
                        <div className="font-medium text-gray-500">Todas las marcas</div>
                      </div>
                      {brandSuggestions.map((brand, index) => (
                        <div
                          key={index}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            selectBrand(brand);
                            setSelectedBrand(brand);
                          }}
                        >
                          <div className="font-medium">{brand}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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
                            {product.current_stock === 0 && (
                              <Badge variant="destructive">Sin Stock</Badge>
                            )}
                            {product.current_stock > 0 && product.current_stock <= product.min_stock && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-700">Stock Bajo</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Código:</span> {product.sku || 'N/A'}
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

        <TabsContent value="stock-bajo" className="space-y-6">
          {/* Filtros de Stock Bajo */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Stock Bajo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>Categoría</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar o escribir categoría..."
                      value={lowStockCategoryFilter}
                      onChange={(e) => handleLowStockCategorySearch(e.target.value)}
                      onFocus={() => {
                        if (lowStockCategoryFilter.trim()) {
                          handleLowStockCategorySearch(lowStockCategoryFilter);
                        } else {
                          const allCategories = getAllCategories();
                          setLowStockCategorySuggestions(allCategories);
                          setShowLowStockCategorySuggestions(allCategories.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowLowStockCategorySuggestions(false), 200);
                      }}
                    />
                    {showLowStockCategorySuggestions && lowStockCategorySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {lowStockCategorySuggestions.map((category, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setLowStockCategoryFilter(category);
                              setShowLowStockCategorySuggestions(false);
                              setLowStockCategorySuggestions([]);
                            }}
                          >
                            <div className="font-medium">{category}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Marca</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar o escribir marca..."
                      value={lowStockBrandFilter}
                      onChange={(e) => handleLowStockBrandSearch(e.target.value)}
                      onFocus={() => {
                        if (lowStockBrandFilter.trim()) {
                          handleLowStockBrandSearch(lowStockBrandFilter);
                        } else {
                          const allBrands = getAllBrands();
                          setLowStockBrandSuggestions(allBrands);
                          setShowLowStockBrandSuggestions(allBrands.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowLowStockBrandSuggestions(false), 200);
                      }}
                    />
                    {showLowStockBrandSuggestions && lowStockBrandSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {lowStockBrandSuggestions.map((brand, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setLowStockBrandFilter(brand);
                              setShowLowStockBrandSuggestions(false);
                              setLowStockBrandSuggestions([]);
                            }}
                          >
                            <div className="font-medium">{brand}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setLowStockCategoryFilter('');
                      setLowStockBrandFilter('');
                    }}
                    className="w-full"
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Productos con Stock Bajo ({lowStockProducts.length})</CardTitle>
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
                    <div key={product.id} className={`border rounded-lg p-4 ${product.current_stock === 0 ? 'border-red-200' : 'border-yellow-200'}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">{product.name}</h3>
                            {product.current_stock === 0 && (
                              <Badge variant="destructive">Sin Stock</Badge>
                            )}
                            {product.current_stock > 0 && product.current_stock <= product.min_stock && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-700">Stock Bajo</Badge>
                            )}
                          </div>
                          <p className={product.current_stock === 0 ? 'text-red-600' : (product.current_stock <= product.min_stock ? 'text-yellow-600' : 'text-gray-600')}>
                            Stock actual: {product.current_stock} | Stock mínimo: {product.min_stock}
                          </p>
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

        <TabsContent value="ventas-pos" className="space-y-6">
          {/* Filtros de Ventas */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Ventas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label>Fecha Desde</Label>
                  <Input
                    type="datetime-local"
                    value={salesDateFrom}
                    onChange={(e) => setSalesDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fecha Hasta</Label>
                  <Input
                    type="datetime-local"
                    value={salesDateTo}
                    onChange={(e) => setSalesDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Producto</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar producto..."
                      value={salesProductFilter}
                      onChange={(e) => handleSalesProductSearch(e.target.value)}
                      onFocus={() => {
                        if (salesProductFilter.trim()) {
                          handleSalesProductSearch(salesProductFilter);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSalesProductSuggestions(false), 200);
                      }}
                    />
                    {showSalesProductSuggestions && salesProductSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {salesProductSuggestions.map((product) => (
                          <div
                            key={product.id}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSalesProductFilter(product.id);
                              setShowSalesProductSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{product.name}</div>
                            {product.sku && <div className="text-sm text-gray-500">Código: {product.sku}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Categoría</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar categoría..."
                      value={salesCategoryFilter}
                      onChange={(e) => handleSalesCategorySearch(e.target.value)}
                      onFocus={() => {
                        if (salesCategoryFilter.trim()) {
                          handleSalesCategorySearch(salesCategoryFilter);
                        } else {
                          const allCategories = getAllCategories();
                          setSalesCategorySuggestions(allCategories);
                          setShowSalesCategorySuggestions(allCategories.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSalesCategorySuggestions(false), 200);
                      }}
                    />
                    {showSalesCategorySuggestions && salesCategorySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {salesCategorySuggestions.map((category, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSalesCategoryFilter(category);
                              setShowSalesCategorySuggestions(false);
                            }}
                          >
                            <div className="font-medium">{category}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Marca</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar marca..."
                      value={salesBrandFilter}
                      onChange={(e) => handleSalesBrandSearch(e.target.value)}
                      onFocus={() => {
                        if (salesBrandFilter.trim()) {
                          handleSalesBrandSearch(salesBrandFilter);
                        } else {
                          const allBrands = getAllBrands();
                          setSalesBrandSuggestions(allBrands);
                          setShowSalesBrandSuggestions(allBrands.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowSalesBrandSuggestions(false), 200);
                      }}
                    />
                    {showSalesBrandSuggestions && salesBrandSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {salesBrandSuggestions.map((brand, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setSalesBrandFilter(brand);
                              setShowSalesBrandSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{brand}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSalesDateFrom(getTodayStart());
                      setSalesDateTo(getTodayEnd());
                      setSalesProductFilter('');
                      setSalesCategoryFilter('');
                      setSalesBrandFilter('');
                    }}
                    className="w-full"
                  >
                    Restablecer
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estadísticas de Ventas */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Ventas</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{sales.length}</div>
                <p className="text-xs text-muted-foreground">Ventas registradas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  ${sales.reduce((sum, s) => sum + (s.total_amount || 0), 0).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Total vendido</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Promedio Venta</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  ${sales.length > 0 
                    ? (sales.reduce((sum, s) => sum + (s.total_amount || 0), 0) / sales.length).toFixed(2)
                    : '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">Por venta</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Productos Vendidos</CardTitle>
                <Package className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {sales.reduce((sum, s) => sum + s.details.reduce((dSum, d) => dSum + d.quantity, 0), 0)}
                </div>
                <p className="text-xs text-muted-foreground">Unidades vendidas</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Ventas */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Ventas ({sales.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingSales ? (
                <div className="text-center py-8">Cargando ventas...</div>
              ) : sales.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay ventas registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sales.map((sale) => (
                    <div key={sale.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg">Venta #{sale.sale_number || sale.id.substring(0, 8)}</h3>
                            <Badge variant={sale.status === 'completed' ? 'default' : 'secondary'}>
                              {sale.status === 'completed' ? 'Completada' : sale.status || 'Pendiente'}
                            </Badge>
                          </div>
                          <div className="text-sm text-gray-600 space-y-1">
                            <p><span className="font-medium">Fecha:</span> {sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') : 'N/A'}</p>
                            <p><span className="font-medium">Cliente:</span> {sale.client_name || 'Cliente General'}</p>
                            <p><span className="font-medium">Método de pago:</span> {sale.payment_method || 'N/A'}</p>
                            {sale.notes && <p><span className="font-medium">Notas:</span> {sale.notes}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-green-600">
                            ${(sale.total_amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="border-t pt-3 mt-3">
                        <h4 className="font-medium mb-2">Productos:</h4>
                        <div className="space-y-2">
                          {sale.details.map((detail) => (
                            <div key={detail.id} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                              <span>
                                {detail.product?.name || 'Producto desconocido'} 
                                {detail.product?.sku && ` (Código: ${detail.product.sku})`}
                              </span>
                              <span className="font-medium">
                                {detail.quantity} x ${detail.unit_price.toFixed(2)} = ${detail.total_price.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-3 pt-3 border-t">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewSaleDetails(sale)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Detalles
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => generateReceiptFromSale(sale)}
                          >
                            <Printer className="h-4 w-4 mr-2" />
                            Imprimir
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadReceiptFromSale(sale)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                          </Button>
                          {sales.length > 0 && sales[0].id === sale.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={async () => {
                                if (confirm('¿Estás seguro de que quieres eliminar esta venta? Esta acción no se puede deshacer.')) {
                                  try {
                                    // Eliminar detalles primero
                                    const { error: detailsError } = await supabase
                                      .from('sale_details')
                                      .delete()
                                      .eq('sale_id', sale.id);
                                    
                                    if (detailsError) throw detailsError;
                                    
                                    // Eliminar la venta
                                    const { error: saleError } = await supabase
                                      .from('sales')
                                      .delete()
                                      .eq('id', sale.id);
                                    
                                    if (saleError) throw saleError;
                                    
                                    toast.success('Venta eliminada exitosamente');
                                    fetchSales();
                                  } catch (error: any) {
                                    console.error('Error eliminando venta:', error);
                                    toast.error(`Error al eliminar venta: ${error.message}`);
                                  }
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Eliminar
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

        <TabsContent value="movimientos" className="space-y-6">
          {/* Filtros de Movimientos */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Movimientos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <Label>Fecha Desde</Label>
                  <Input
                    type="date"
                    value={movementDateFrom}
                    onChange={(e) => setMovementDateFrom(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Fecha Hasta</Label>
                  <Input
                    type="date"
                    value={movementDateTo}
                    onChange={(e) => setMovementDateTo(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Producto</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar producto..."
                      value={movementProductFilter}
                      onChange={(e) => handleMovementProductSearch(e.target.value)}
                      onFocus={() => {
                        if (movementProductFilter.trim()) {
                          handleMovementProductSearch(movementProductFilter);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowMovementProductSuggestions(false), 200);
                      }}
                    />
                    {showMovementProductSuggestions && movementProductSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {movementProductSuggestions.map((product) => (
                          <div
                            key={product.id}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMovementProductFilter(product.id);
                              setShowMovementProductSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{product.name}</div>
                            {product.sku && <div className="text-sm text-gray-500">Código: {product.sku}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Categoría</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar categoría..."
                      value={movementCategoryFilter}
                      onChange={(e) => handleMovementCategorySearch(e.target.value)}
                      onFocus={() => {
                        if (movementCategoryFilter.trim()) {
                          handleMovementCategorySearch(movementCategoryFilter);
                        } else {
                          const allCategories = getAllCategories();
                          setMovementCategorySuggestions(allCategories);
                          setShowMovementCategorySuggestions(allCategories.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowMovementCategorySuggestions(false), 200);
                      }}
                    />
                    {showMovementCategorySuggestions && movementCategorySuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {movementCategorySuggestions.map((category, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMovementCategoryFilter(category);
                              setShowMovementCategorySuggestions(false);
                            }}
                          >
                            <div className="font-medium">{category}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <Label>Marca</Label>
                  <div className="relative">
                    <Input
                      placeholder="Buscar marca..."
                      value={movementBrandFilter}
                      onChange={(e) => handleMovementBrandSearch(e.target.value)}
                      onFocus={() => {
                        if (movementBrandFilter.trim()) {
                          handleMovementBrandSearch(movementBrandFilter);
                        } else {
                          const allBrands = getAllBrands();
                          setMovementBrandSuggestions(allBrands);
                          setShowMovementBrandSuggestions(allBrands.length > 0);
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => setShowMovementBrandSuggestions(false), 200);
                      }}
                    />
                    {showMovementBrandSuggestions && movementBrandSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                        {movementBrandSuggestions.map((brand, index) => (
                          <div
                            key={index}
                            className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              setMovementBrandFilter(brand);
                              setShowMovementBrandSuggestions(false);
                            }}
                          >
                            <div className="font-medium">{brand}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setMovementDateFrom('');
                      setMovementDateTo('');
                      setMovementProductFilter('');
                      setMovementCategoryFilter('');
                      setMovementBrandFilter('');
                    }}
                    className="w-full"
                  >
                    Limpiar Filtros
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resumen de Movimientos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Entradas</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {movements.filter(m => m.quantity > 0).reduce((sum, m) => sum + m.quantity, 0)}
                </div>
                <p className="text-xs text-muted-foreground">Unidades ingresadas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Salidas</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {Math.abs(movements.filter(m => m.quantity < 0).reduce((sum, m) => sum + m.quantity, 0))}
                </div>
                <p className="text-xs text-muted-foreground">Unidades vendidas</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Movimientos</CardTitle>
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{movements.length}</div>
                <p className="text-xs text-muted-foreground">Registros</p>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Movimientos */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de Movimientos ({movements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMovements ? (
                <div className="text-center py-8">Cargando movimientos...</div>
              ) : movements.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ArrowUpDown className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay movimientos registrados</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Fecha</th>
                        <th className="text-left p-2">Producto</th>
                        <th className="text-center p-2">Tipo</th>
                        <th className="text-right p-2">Cantidad</th>
                        <th className="text-left p-2">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => (
                        <tr key={movement.id} className="border-b hover:bg-gray-50">
                          <td className="p-2 text-sm">
                            {new Date(movement.date).toLocaleDateString('es-DO')}
                          </td>
                          <td className="p-2 font-medium">{movement.product_name}</td>
                          <td className="p-2 text-center">
                            <Badge 
                              variant={movement.quantity > 0 ? 'default' : 'destructive'}
                            >
                              {movement.type === 'sale' ? 'Venta' : movement.type === 'purchase' ? 'Compra' : 'Ajuste'}
                            </Badge>
                          </td>
                          <td className={`p-2 text-right font-semibold ${
                            movement.quantity > 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                          </td>
                          <td className="p-2 text-sm text-gray-600">{movement.reference}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    <span className="font-semibold text-yellow-600">{lowStockProducts.length}</span>
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

            <Card>
              <CardHeader>
                <CardTitle>Productos Más Vendidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const productSales = new Map<string, { name: string; quantity: number }>();
                    sales.forEach(sale => {
                      sale.details.forEach(detail => {
                        const current = productSales.get(detail.product_id) || { name: detail.product?.name || 'Desconocido', quantity: 0 };
                        productSales.set(detail.product_id, {
                          name: current.name,
                          quantity: current.quantity + detail.quantity
                        });
                      });
                    });
                    return Array.from(productSales.values())
                      .sort((a, b) => b.quantity - a.quantity)
                      .slice(0, 5)
                      .map((item, index) => (
                        <div key={index} className="flex justify-between">
                          <span className="truncate">{item.name}</span>
                          <span className="font-semibold">{item.quantity} unidades</span>
                        </div>
                      ));
                  })()}
                  {sales.length === 0 && (
                    <p className="text-sm text-gray-500">No hay datos de ventas</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resumen de Ventas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total de ventas:</span>
                    <span className="font-semibold">{sales.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto total vendido:</span>
                    <span className="font-semibold text-green-600">
                      ${sales.reduce((sum, s) => sum + (s.total_amount || 0), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio por venta:</span>
                    <span className="font-semibold">
                      ${sales.length > 0 
                        ? (sales.reduce((sum, s) => sum + (s.total_amount || 0), 0) / sales.length).toFixed(2)
                        : '0.00'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unidades vendidas:</span>
                    <span className="font-semibold">
                      {sales.reduce((sum, s) => sum + s.details.reduce((dSum, d) => dSum + d.quantity, 0), 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Productos por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map(category => {
                    const count = products.filter(p => p.category === category).length;
                    return (
                      <div key={category} className="flex justify-between">
                        <span className="truncate">{category}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    );
                  })}
                  {categories.length === 0 && (
                    <p className="text-sm text-gray-500">No hay categorías</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Métodos de Pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const paymentMethods = new Map<string, { count: number; total: number }>();
                    sales.forEach(sale => {
                      const method = sale.payment_method || 'N/A';
                      const current = paymentMethods.get(method) || { count: 0, total: 0 };
                      paymentMethods.set(method, {
                        count: current.count + 1,
                        total: current.total + (sale.total_amount || 0)
                      });
                    });
                    return Array.from(paymentMethods.entries())
                      .sort((a, b) => b[1].total - a[1].total)
                      .map(([method, data]) => (
                        <div key={method} className="flex justify-between">
                          <span className="truncate">{method}</span>
                          <span className="font-semibold">
                            {data.count} ventas - ${data.total.toFixed(2)}
                          </span>
                        </div>
                      ));
                  })()}
                  {sales.length === 0 && (
                    <p className="text-sm text-gray-500">No hay datos de ventas</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>


      {/* Sale Details Dialog */}
      <Dialog open={showSaleDetails} onOpenChange={setShowSaleDetails}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de Venta #{selectedSale?.sale_number || selectedSale?.id.substring(0, 8)}</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-600">Fecha</Label>
                  <p className="font-medium">
                    {selectedSale.sale_date ? new Date(selectedSale.sale_date).toLocaleDateString('es-DO', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'N/A'}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Estado</Label>
                  <p className="font-medium">
                    <Badge variant={selectedSale.status === 'completed' ? 'default' : 'secondary'}>
                      {selectedSale.status === 'completed' ? 'Completada' : selectedSale.status || 'Pendiente'}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Cliente</Label>
                  <p className="font-medium">{selectedSale.client_name || 'Cliente General'}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600">Método de Pago</Label>
                  <p className="font-medium">{selectedSale.payment_method || 'N/A'}</p>
                </div>
                {selectedSale.notes && (
                  <div className="col-span-2">
                    <Label className="text-sm text-gray-600">Notas</Label>
                    <p className="font-medium">{selectedSale.notes}</p>
                  </div>
                )}
              </div>
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">Productos</h4>
                <div className="space-y-2">
                  {selectedSale.details.map((detail) => (
                    <div key={detail.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                      <div>
                        <p className="font-medium">{detail.product?.name || 'Producto desconocido'}</p>
                        {detail.product?.sku && (
                          <p className="text-sm text-gray-600">Código: {detail.product.sku}</p>
                        )}
                        {detail.product?.category && (
                          <p className="text-sm text-gray-600">Categoría: {detail.product.category}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Cantidad: {detail.quantity}</p>
                        <p className="text-sm text-gray-600">Precio unitario: ${detail.unit_price.toFixed(2)}</p>
                        <p className="font-semibold">Subtotal: ${detail.total_price.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t pt-4 flex justify-end">
                <div className="text-right">
                  <p className="text-2xl font-bold text-green-600">
                    Total: ${(selectedSale.total_amount || 0).toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => generateReceiptFromSale(selectedSale)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button variant="outline" onClick={() => downloadReceiptFromSale(selectedSale)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
                <Button onClick={() => setShowSaleDetails(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Product Form Dialog */}
      <Dialog open={showProductForm} onOpenChange={setShowProductForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
                <div className="relative">
                  <Input
                    id="category"
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
              <div>
                <Label htmlFor="brand">Marca</Label>
                <div className="relative">
                  <Input
                    id="brand"
                    placeholder="Buscar o escribir marca..."
                    value={brandSearch}
                    onChange={(e) => handleBrandSearch(e.target.value)}
                    onFocus={() => {
                      if (brandSearch.trim()) {
                        handleBrandSearch(brandSearch);
                      } else {
                        // Si está vacío, mostrar todas las marcas disponibles
                        const allBrands = getAllBrands();
                        setBrandSuggestions(allBrands);
                        setShowBrandSuggestions(allBrands.length > 0);
                      }
                    }}
                    onBlur={() => {
                      // Delay para permitir que el click en la sugerencia funcione
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
                            e.preventDefault(); // Prevenir blur del input
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
              <div className="flex items-center gap-2">
                <Label htmlFor="itbis_rate" className="text-sm">% ITBIS:</Label>
                <Input
                  id="itbis_rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={itbisRate}
                  onChange={(e) => {
                    const rate = Number(e.target.value) || 0;
                    setItbisRate(rate);
                    // Recalcular precios con el nuevo ITBIS
                    if (purchaseNoTax > 0) {
                      setPurchaseWithTax(Number((purchaseNoTax * (1 + rate / 100)).toFixed(2)));
                    }
                    if (sellingNoTax > 0) {
                      setSellingWithTax(Number((sellingNoTax * (1 + rate / 100)).toFixed(2)));
                    }
                    if (purchaseWithTax > 0) {
                      setPurchaseNoTax(Number((purchaseWithTax / (1 + rate / 100)).toFixed(2)));
                    }
                    if (sellingWithTax > 0) {
                      setSellingNoTax(Number((sellingWithTax / (1 + rate / 100)).toFixed(2)));
                    }
                  }}
                  className="w-24"
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
              <p className="text-xs text-gray-500">ITBIS aplicado: {itbisRate}%. Se guarda en base de datos el precio sin ITBIS.</p>
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
