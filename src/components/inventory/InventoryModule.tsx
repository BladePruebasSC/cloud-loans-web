
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
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';
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
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  
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
  const [salesProductFilter, setSalesProductFilter] = useState<string>(''); // ID del producto para filtrar
  const [salesProductFilterName, setSalesProductFilterName] = useState<string>(''); // Nombre del producto para mostrar
  const [salesCategoryFilter, setSalesCategoryFilter] = useState<string>('');
  const [salesBrandFilter, setSalesBrandFilter] = useState<string>('');
  const [salesEmployeeFilter, setSalesEmployeeFilter] = useState<string>(''); // ID del empleado para filtrar
  const [showSalesProductSuggestions, setShowSalesProductSuggestions] = useState(false);
  const [salesProductSuggestions, setSalesProductSuggestions] = useState<Product[]>([]);
  const [showSalesCategorySuggestions, setShowSalesCategorySuggestions] = useState(false);
  const [salesCategorySuggestions, setSalesCategorySuggestions] = useState<string[]>([]);
  const [showSalesBrandSuggestions, setShowSalesBrandSuggestions] = useState(false);
  const [salesBrandSuggestions, setSalesBrandSuggestions] = useState<string[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  
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
  const [movementProductFilter, setMovementProductFilter] = useState<string>(''); // ID del producto para filtrar
  const [movementProductFilterName, setMovementProductFilterName] = useState<string>(''); // Nombre del producto para mostrar
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
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null);
  const [showEditSaleModal, setShowEditSaleModal] = useState(false);
  const [showCashRegister, setShowCashRegister] = useState(false);
  const [editSaleClientSearch, setEditSaleClientSearch] = useState('');
  const [editSaleFilteredClients, setEditSaleFilteredClients] = useState<any[]>([]);
  const [editSaleSelectedClient, setEditSaleSelectedClient] = useState<any | null>(null);
  const [showEditSaleClientDropdown, setShowEditSaleClientDropdown] = useState(false);
  const [editSaleProducts, setEditSaleProducts] = useState<any[]>([]);
  const [editSaleProductSearch, setEditSaleProductSearch] = useState('');
  const [editSaleFilteredProducts, setEditSaleFilteredProducts] = useState<Product[]>([]);
  const [showEditSaleProductDropdown, setShowEditSaleProductDropdown] = useState(false);
  const [editSalePaymentMethod, setEditSalePaymentMethod] = useState<string>('cash');
  const [editSaleNotes, setEditSaleNotes] = useState<string>('');

  const { user, companyId } = useAuth();

  // Cargar empleados al montar el componente
  useEffect(() => {
    if (companyId) {
      fetchEmployees();
    }
  }, [companyId]);

  const fetchEmployees = async () => {
    if (!companyId || !user) return;

    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, full_name, auth_user_id')
        .eq('company_owner_id', companyId)
        .eq('status', 'active')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error fetching employees:', error);
        return;
      }

      // Obtener información del dueño de la empresa
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', companyId)
        .maybeSingle();

      // Crear objeto para el dueño de la empresa
      const ownerEmployee = {
        id: companyId,
        full_name: profileData?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Dueño de Empresa',
        auth_user_id: companyId,
      };

      // Combinar el dueño con los empleados, poniendo al dueño primero
      const allEmployees = [ownerEmployee, ...(data || [])];
      setEmployees(allEmployees);
    } catch (error) {
      console.error('Error in fetchEmployees:', error);
    }
  };
  
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
  }, [user, salesDateFrom, salesDateTo, salesProductFilter, salesCategoryFilter, salesBrandFilter, salesEmployeeFilter]);

  // Inicializar datos cuando se abre el modal de edición
  useEffect(() => {
    if (showEditSaleModal && editingSale && companyId) {
      // Inicializar cliente
      if (editingSale.client_id) {
        supabase
          .from('clients')
          .select('id, full_name, dni, phone')
          .eq('id', editingSale.client_id)
          .eq('user_id', companyId)
          .single()
          .then(({ data }) => {
            if (data) {
              setEditSaleSelectedClient(data);
              setEditSaleClientSearch(data.full_name);
            } else {
              // Si no se encuentra el cliente, limpiar
              setEditSaleSelectedClient(null);
              setEditSaleClientSearch('');
            }
          });
      } else {
        setEditSaleSelectedClient(null);
        setEditSaleClientSearch('');
      }
      
      // Inicializar productos
      setEditSaleProducts(editingSale.details.map(detail => ({
        id: detail.id,
        product_id: detail.product_id,
        product: detail.product,
        quantity: detail.quantity,
        unit_price: detail.unit_price,
        total_price: detail.total_price
      })));
      
      // Inicializar método de pago y notas
      setEditSalePaymentMethod(editingSale.payment_method || 'cash');
      setEditSaleNotes(editingSale.notes || '');
    }
  }, [showEditSaleModal, editingSale]);

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

  // Función auxiliar para calcular el total con ITBIS de una venta
  const calculateSaleTotalWithTax = (sale: SaleWithDetails): number => {
    if (sale.details && sale.details.length > 0) {
      return sale.details.reduce((sum: number, detail: any) => {
        // Si total_price tiene valor, usarlo (ya es sin ITBIS) y agregar ITBIS
        if (detail.total_price && detail.total_price > 0) {
          const itbisRate = detail.product?.itbis_rate ?? 18;
          const itemSubtotal = detail.total_price; // Sin ITBIS
          const itemTax = itemSubtotal * (itbisRate / 100);
          return sum + itemSubtotal + itemTax;
        }
        // Si total_price es 0 o no existe, calcular desde unit_price (que tiene ITBIS)
        if (detail.unit_price && detail.unit_price > 0 && detail.quantity) {
          return sum + (detail.unit_price * detail.quantity);
        }
        return sum;
      }, 0);
    }
    // Si no hay detalles, usar total_amount (que debería tener ITBIS)
    return sale.total_amount || 0;
  };

  const fetchSales = async () => {
    try {
      setLoadingSales(true);
      // Obtener todos los user_ids de empleados si hay filtro de empleado
      let employeeUserIds: string[] = [];
      if (salesEmployeeFilter) {
        const selectedEmployee = employees.find(emp => emp.id === salesEmployeeFilter);
        if (selectedEmployee?.auth_user_id) {
          employeeUserIds = [selectedEmployee.auth_user_id];
        }
      }

      // Obtener todas las ventas - usar select('*') para obtener todas las columnas disponibles
      // No aplicar filtros de fecha aquí, los aplicaremos después manualmente para evitar errores
      let query = supabase
        .from('sales')
        .select('*')
        .order('created_at', { ascending: false });

      // Si hay filtro de empleado, filtrar por user_id del empleado
      if (salesEmployeeFilter && employeeUserIds.length > 0) {
        query = query.in('user_id', employeeUserIds);
      } else if (!salesEmployeeFilter && companyId) {
        // Si no hay filtro de empleado, mostrar todas las ventas de la empresa
        // Obtener todos los user_ids de empleados de la empresa + el dueño
        const allEmployeeUserIds = employees
          .map(emp => emp.auth_user_id)
          .filter((id): id is string => !!id);
        if (companyId) {
          allEmployeeUserIds.push(companyId);
        }
        if (allEmployeeUserIds.length > 0) {
          query = query.in('user_id', allEmployeeUserIds);
        } else {
          query = query.eq('user_id', user?.id);
        }
      } else {
        query = query.eq('user_id', user?.id);
      }

      const { data: salesData, error: salesError } = await query;

      if (salesError) {
        console.error('Error fetching sales:', salesError);
        toast.error(`Error al cargar ventas: ${salesError.message}`);
        setSales([]);
        return;
      }

      console.log('Ventas encontradas:', salesData?.length || 0);

      // Filtrar por fecha manualmente (incluyendo horas)
      // SIEMPRE aplicar filtro de fecha - si no hay fechas, no mostrar ventas
      let filteredSales = salesData || [];
      
      // Aplicar filtro de fecha - REQUERIDO que haya al menos una fecha
      if (salesDateFrom || salesDateTo) {
        filteredSales = filteredSales.filter(sale => {
          const saleAny = sale as any;
          const saleDate = saleAny.sale_date || saleAny.created_at;
          if (!saleDate) return false;
          
          const date = new Date(saleDate);
          
          // Si hay fecha desde, la venta debe ser >= fecha desde
          if (salesDateFrom) {
            const fromDate = new Date(salesDateFrom);
            fromDate.setSeconds(0, 0); // Inicio del minuto
            if (date < fromDate) return false;
          }
          
          // Si hay fecha hasta, la venta debe ser <= fecha hasta
          if (salesDateTo) {
            const toDate = new Date(salesDateTo);
            // Agregar hasta el final del minuto seleccionado
            toDate.setSeconds(59, 999);
            if (date > toDate) return false;
          }
          
          return true;
        });
      } else {
        // Si no hay filtros de fecha seleccionados, no mostrar ninguna venta
        filteredSales = [];
      }

      // Optimización: Obtener todos los datos en batch en lugar de consultas secuenciales
      const salesWithDetails: SaleWithDetails[] = [];
      
      if (filteredSales.length > 0) {
        const saleIds = filteredSales.map(s => s.id);
        const clientIds = filteredSales
          .map(s => (s as any).client_id)
          .filter((id): id is string => !!id);
        const productIdsFromSales = filteredSales
          .map(s => (s as any).product_id)
          .filter((id): id is string => !!id);

        // Obtener todos los sale_details en una sola consulta
        const { data: allSaleDetails, error: detailsError } = await supabase
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
              category,
              brand
            )
          `)
          .in('sale_id', saleIds);

        // Obtener todos los productos necesarios (para ventas antiguas sin sale_details)
        const { data: allProducts } = productIdsFromSales.length > 0
          ? await supabase
            .from('products')
            .select('*')
              .in('id', productIdsFromSales)
          : { data: null, error: null };

        // Obtener todos los clientes necesarios en una sola consulta
        const { data: allClients } = clientIds.length > 0
          ? await supabase
              .from('clients')
              .select('id, full_name')
              .in('id', clientIds)
          : { data: null, error: null };

        // Crear mapas para acceso rápido
        const saleDetailsMap = new Map<string, SaleDetail[]>();
        if (!detailsError && allSaleDetails) {
          allSaleDetails.forEach((detail: any) => {
            const saleId = detail.sale_id;
            if (!saleDetailsMap.has(saleId)) {
              saleDetailsMap.set(saleId, []);
            }
            saleDetailsMap.get(saleId)!.push({
              id: detail.id,
              sale_id: detail.sale_id,
              product_id: detail.product_id,
              quantity: detail.quantity,
              unit_price: detail.unit_price,
              total_price: detail.total_price,
              product: detail.products as any
            });
          });
        }

        const productsMap = new Map<string, Product>();
        if (allProducts) {
          allProducts.forEach((product: Product) => {
            productsMap.set(product.id, product);
          });
        }

        const clientsMap = new Map<string, { full_name: string }>();
        if (allClients) {
          allClients.forEach((client: any) => {
            clientsMap.set(client.id, client);
          });
        }

        // Procesar cada venta usando los mapas
        for (const sale of filteredSales) {
          const saleAny = sale as any;
          let saleDetails: SaleDetail[] = [];
          
          // Obtener sale_details del mapa
          const details = saleDetailsMap.get(sale.id);
          if (details && details.length > 0) {
            saleDetails = details;
          } else if (saleAny.product_id) {
            // Esquema simple: datos directos en sales
            const product = productsMap.get(saleAny.product_id);
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

          // Obtener nombre del cliente del mapa
        let clientName = 'Cliente General';
        if (saleAny.client_id) {
            const client = clientsMap.get(saleAny.client_id);
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

  const handleDelete = (productId: string) => {
    setProductToDelete(productId);
    setShowPasswordVerification(true);
  };

  const confirmDelete = async () => {
    if (!productToDelete) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productToDelete);

      if (error) throw error;
      toast.success('Producto eliminado exitosamente');
      fetchProducts();
      setProductToDelete(null);
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Error al eliminar producto');
      setProductToDelete(null);
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

  const handleEditSale = async (updatedSale: SaleWithDetails) => {
    try {
      // Actualizar la venta principal
      const { error: saleError } = await supabase
        .from('sales')
        .update({
          client_id: updatedSale.client_id,
          payment_method: updatedSale.payment_method,
          notes: updatedSale.notes,
          total_amount: updatedSale.total_amount
        })
        .eq('id', updatedSale.id);

      if (saleError) throw saleError;

      // Eliminar los detalles antiguos
      const { error: deleteError } = await supabase
        .from('sale_details')
        .delete()
        .eq('sale_id', updatedSale.id);

      if (deleteError) throw deleteError;

      // Insertar los nuevos detalles
      if (updatedSale.details && updatedSale.details.length > 0) {
        const detailsToInsert = updatedSale.details.map(detail => ({
          sale_id: updatedSale.id,
          product_id: detail.product_id,
          quantity: detail.quantity,
          unit_price: detail.unit_price,
          total_price: detail.total_price
        }));

        const { error: insertError } = await supabase
          .from('sale_details')
          .insert(detailsToInsert);

        if (insertError) throw insertError;
      }

      toast.success('Venta actualizada exitosamente');
      setShowEditSaleModal(false);
      setEditingSale(null);
      fetchSales();
    } catch (error: any) {
      console.error('Error actualizando venta:', error);
      toast.error(`Error al actualizar venta: ${error.message}`);
    }
  };

  const generateCashRegister = async (format: 'A4' | 'POS80' | 'POS58' = 'POS80') => {
    try {
      // Usar las fechas seleccionadas en los filtros, o el día actual si no hay filtros
      let startDate: Date;
      let endDate: Date;
      
      if (salesDateFrom && salesDateTo) {
        startDate = new Date(salesDateFrom);
        endDate = new Date(salesDateTo);
        // Asegurar que endDate incluya todo el día
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Si no hay filtros, usar el día actual
        const today = new Date();
        startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
        endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      }

      // Obtener ventas del rango de fechas
      const { data: todaySales, error: salesError } = await supabase
        .from('sales')
        .select('*')
        .eq('user_id', user?.id)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true });

      if (salesError) throw salesError;

      if (!todaySales || todaySales.length === 0) {
        toast.error('No hay ventas registradas para el día de hoy');
        return;
      }

      // Obtener detalles de ventas y clientes en batch
      const saleIds = todaySales.map(s => s.id);
      const clientIds = todaySales
        .map(s => (s as any).client_id)
        .filter((id): id is string => !!id);

      // Obtener sale_details y productos
      let allSaleDetails: any[] = [];
      const { data: detailsData, error: detailsError } = await supabase
        .from('sale_details')
        .select('*')
        .in('sale_id', saleIds);

      if (detailsError) {
        console.error('Error obteniendo detalles:', detailsError);
      } else if (detailsData && detailsData.length > 0) {
        // Obtener productos para los detalles
        const productIds = detailsData
          .map(d => d.product_id)
          .filter((id): id is string => !!id);
        
        const { data: productsData } = productIds.length > 0
          ? await supabase
              .from('products')
              .select('id, name, itbis_rate')
              .in('id', productIds)
          : { data: null, error: null };

        const productsMap = new Map();
        if (productsData) {
          productsData.forEach((p: any) => {
            productsMap.set(p.id, p);
          });
        }

        // Combinar detalles con productos
        allSaleDetails = detailsData.map((detail: any) => ({
          ...detail,
          products: productsMap.get(detail.product_id) || null
        }));
      }

      // Para ventas antiguas sin sale_details, intentar obtener el producto desde la venta misma
      const oldSalesProductIds = todaySales
        .filter(s => !saleIds.some(id => allSaleDetails.some(d => d.sale_id === id && d.sale_id === s.id)))
        .map(s => (s as any).product_id)
        .filter((id): id is string => !!id);

      const oldProductsMap = new Map();
      if (oldSalesProductIds.length > 0) {
        const { data: oldProductsData } = await supabase
          .from('products')
          .select('id, name, itbis_rate')
          .in('id', oldSalesProductIds);

        if (oldProductsData) {
          oldProductsData.forEach((p: any) => {
            oldProductsMap.set(p.id, p);
          });
        }
      }

      // Obtener clientes
      const { data: allClients } = clientIds.length > 0
        ? await supabase
            .from('clients')
            .select('id, full_name')
            .in('id', clientIds)
        : { data: null, error: null };

      // Crear mapas para acceso rápido
      const saleDetailsMap = new Map<string, any[]>();
      if (allSaleDetails) {
        allSaleDetails.forEach((detail: any) => {
          const saleId = detail.sale_id;
          if (!saleDetailsMap.has(saleId)) {
            saleDetailsMap.set(saleId, []);
          }
          saleDetailsMap.get(saleId)!.push(detail);
        });
      }

      const clientsMap = new Map<string, any>();
      if (allClients) {
        allClients.forEach((client: any) => {
          clientsMap.set(client.id, client);
        });
      }

      // Enriquecer las ventas con detalles, clientes y productos antiguos
      const enrichedSales = todaySales.map((sale: any) => {
        const saleDetails = saleDetailsMap.get(sale.id) || [];
        // Si no hay sale_details pero hay product_id, crear un detalle simulado
        if (saleDetails.length === 0 && sale.product_id) {
          const oldProduct = oldProductsMap.get(sale.product_id);
          if (oldProduct) {
            saleDetails.push({
              id: sale.id,
              sale_id: sale.id,
              product_id: sale.product_id,
              quantity: sale.quantity || 1,
              unit_price: sale.unit_price || 0,
              total_price: sale.total_price || 0,
              products: oldProduct
            });
          }
        }
        return {
          ...sale,
          sale_details: saleDetails,
          clients: sale.client_id ? clientsMap.get(sale.client_id) : null
        };
      });

      // Obtener información de la empresa
      let companyName = 'SH Computers';
      let companyAddress = '';
      let companyPhone = '';
      
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (companySettings) {
        companyName = companySettings.company_name || companyName;
        companyAddress = companySettings.address || '';
        companyPhone = companySettings.phone || '';
      }

      // Calcular totales
      let totalSales = 0;
      let totalTax = 0;
      let totalByPaymentMethod: Record<string, number> = {};

      enrichedSales.forEach((sale: any) => {
        let saleTotal = 0;
        
        // Si hay sale_details, calcular desde ellos
        if (sale.sale_details && sale.sale_details.length > 0) {
          // Mapear sale_details a details con la estructura correcta
          const mappedDetails = sale.sale_details.map((detail: any) => ({
            ...detail,
            product: detail.products || detail.product // Asegurar que product esté disponible
          }));
          
          const saleWithMappedDetails = { ...sale, details: mappedDetails };
          saleTotal = calculateSaleTotalWithTax(saleWithMappedDetails as SaleWithDetails);
        } else {
          // Si no hay detalles, usar total_amount directamente
          // Si total_amount es 0 o null, intentar calcular desde unit_price si está disponible
          if (sale.total_amount && sale.total_amount > 0) {
            saleTotal = sale.total_amount;
          } else if (sale.unit_price && sale.quantity) {
            // Para ventas antiguas sin sale_details, usar unit_price * quantity
            saleTotal = sale.unit_price * sale.quantity;
          } else {
            saleTotal = 0;
          }
          console.log('No sale_details found, using total_amount:', saleTotal, 'for sale:', sale.id, 'total_amount:', sale.total_amount);
        }
        
        console.log('Sale total calculated:', saleTotal, 'for sale:', sale.id);
        totalSales += saleTotal;

        // Calcular ITBIS solo si hay sale_details
        if (sale.sale_details && sale.sale_details.length > 0) {
          sale.sale_details.forEach((detail: any) => {
            const itbisRate = detail.products?.itbis_rate ?? detail.product?.itbis_rate ?? 18;
            // Si total_price tiene valor, usarlo para calcular ITBIS
            if (detail.total_price && detail.total_price > 0) {
              const itemSubtotal = detail.total_price;
              const itemTax = itemSubtotal * (itbisRate / 100);
              totalTax += itemTax;
            } else if (detail.unit_price && detail.unit_price > 0 && detail.quantity) {
              // Si total_price no tiene valor, calcular desde unit_price
              const priceWithTax = detail.unit_price;
              const priceWithoutTax = priceWithTax / (1 + itbisRate / 100);
              const itemSubtotal = priceWithoutTax * detail.quantity;
              const itemTax = itemSubtotal * (itbisRate / 100);
              totalTax += itemTax;
            }
          });
        } else {
          // Si no hay detalles, estimar ITBIS desde total_amount (asumiendo 18%)
          // Esto es una aproximación, pero mejor que 0
          const estimatedSubtotal = saleTotal / 1.18;
          const estimatedTax = saleTotal - estimatedSubtotal;
          totalTax += estimatedTax;
        }

        // Agrupar por método de pago
        const paymentMethod = sale.payment_method || 'cash';
        if (!totalByPaymentMethod[paymentMethod]) {
          totalByPaymentMethod[paymentMethod] = 0;
        }
        totalByPaymentMethod[paymentMethod] += saleTotal;
      });

      const subtotal = totalSales - totalTax;

      // Generar HTML del cuadre de caja
      const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
      const isThermal = format === 'POS80' || format === 'POS58';
      const isPOS58 = format === 'POS58';

      // CSS específico para cada formato
      const pageCss = format === 'A4'
        ? '@page { size: A4; margin: 18mm; } .invoice{max-width:800px;margin:0 auto;}'
        : format === 'POS80'
          ? '@page { size: 80mm auto; margin: 2mm 1mm; } .invoice{width:76mm;margin:0 auto;font-size:9px;}'
          : '@page { size: 58mm auto; margin: 2mm 1mm; } .invoice{width:54mm;margin:0 auto;font-size:8px;}';

      const thermalCss = isThermal ? `
        body { font-size: ${isPOS58 ? '8px' : '9px'}; font-family: 'Courier New', monospace; }
        .invoice { width: ${isPOS58 ? '54mm' : '76mm'}; margin: 0 auto; }
        .header { padding: 4px 0; border-bottom: 1px solid #000; text-align: center; }
        .brand-name { font-size: ${isPOS58 ? '10px' : '12px'}; font-weight: bold; margin: 2px 0; }
        .brand-meta { font-size: ${isPOS58 ? '7px' : '8px'}; margin: 1px 0; }
        .section { padding: 4px 0; margin: 4px 0; border: none; }
        .section-title { font-size: ${isPOS58 ? '8px' : '9px'}; font-weight: bold; margin-bottom: 2px; }
        .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
        .label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
        th, td { padding: 2px 1px; border-bottom: 1px dashed #ccc; }
        thead th { background: transparent; border-bottom: 1px solid #000; font-size: ${isPOS58 ? '7px' : '8px'}; }
        .total-row { font-weight: bold; border-top: 2px solid #000; }
        .text-right { text-align: right; }
        .text-center { text-align: center; }
      ` : '';

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Cuadre de Caja - ${salesDateFrom && salesDateTo 
            ? `${new Date(salesDateFrom).toLocaleDateString('es-DO')} - ${new Date(salesDateTo).toLocaleDateString('es-DO')}`
            : `${startDate.toLocaleDateString('es-DO')}`}</title>
          <style>
            ${pageCss}
            ${thermalCss}
            body { font-family: ${isThermal ? "'Courier New', monospace" : 'Arial, sans-serif'}; margin: 0; padding: 10px; }
            .invoice { padding: ${isThermal ? '4px' : '20px'}; }
            .header { text-align: center; margin-bottom: ${isThermal ? '4px' : '20px'}; }
            .brand-name { font-size: ${isThermal ? (isPOS58 ? '10px' : '12px') : '24px'}; font-weight: bold; }
            .brand-meta { font-size: ${isThermal ? (isPOS58 ? '7px' : '8px') : '12px'}; color: #666; }
            .doc-type { font-size: ${isThermal ? (isPOS58 ? '10px' : '12px') : '18px'}; font-weight: bold; margin: ${isThermal ? '4px' : '10px'} 0; }
            .section { margin: ${isThermal ? '4px' : '15px'} 0; }
            .section-title { font-weight: bold; margin-bottom: ${isThermal ? '2px' : '10px'}; }
            table { width: 100%; border-collapse: collapse; margin: ${isThermal ? '4px' : '10px'} 0; }
            th, td { padding: ${isThermal ? '2px 1px' : '8px'}; text-align: left; border-bottom: 1px ${isThermal ? 'dashed' : 'solid'} #ccc; }
            thead th { background: ${isThermal ? 'transparent' : '#f5f5f5'}; font-weight: bold; border-bottom: 1px solid #000; }
            .total-row { font-weight: bold; border-top: 2px solid #000; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="invoice">
            <div class="header">
              <div class="brand-name">${companyName}</div>
              ${companyAddress ? `<div class="brand-meta">${companyAddress}</div>` : ''}
              ${companyPhone ? `<div class="brand-meta">Tel: ${companyPhone}</div>` : ''}
              <div class="doc-type">CUADRE DE CAJA</div>
              <div class="brand-meta">Fecha: ${salesDateFrom && salesDateTo 
                ? `${new Date(salesDateFrom).toLocaleDateString('es-DO')} - ${new Date(salesDateTo).toLocaleDateString('es-DO')}`
                : `${startDate.toLocaleDateString('es-DO')} ${startDate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`}</div>
            </div>

            <div class="section">
              <div class="section-title">RESUMEN DEL DÍA</div>
              <table>
                <tr>
                  <td>Total de Ventas:</td>
                  <td class="text-right">${enrichedSales.length}</td>
                </tr>
                <tr>
                  <td>Subtotal:</td>
                  <td class="text-right">${money(subtotal)}</td>
                </tr>
                <tr>
                  <td>ITBIS:</td>
                  <td class="text-right">${money(totalTax)}</td>
                </tr>
                <tr class="total-row">
                  <td>TOTAL:</td>
                  <td class="text-right">${money(totalSales)}</td>
                </tr>
              </table>
            </div>

            <div class="section">
              <div class="section-title">POR MÉTODO DE PAGO</div>
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th class="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(totalByPaymentMethod).map(([method, amount]) => {
                    const methodNames: Record<string, string> = {
                      'cash': 'Efectivo',
                      'card': 'Tarjeta',
                      'transfer': 'Transferencia',
                      'check': 'Cheque',
                      'financing': 'Financiamiento'
                    };
                    return `
                      <tr>
                        <td>${methodNames[method] || method}</td>
                        <td class="text-right">${money(amount)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">DETALLE DE VENTAS</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Hora</th>
                    <th>Cliente</th>
                    <th>Productos</th>
                    <th class="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  ${enrichedSales.map((sale: any, index: number) => {
                    const saleDate = new Date(sale.created_at);
                    let saleTotal = 0;
                    let productsList = 'N/A';
                    
                    // Si hay sale_details, calcular desde ellos y obtener productos
                    if (sale.sale_details && sale.sale_details.length > 0) {
                      const mappedDetails = sale.sale_details.map((detail: any) => ({
                        ...detail,
                        product: detail.products || detail.product
                      }));
                      const saleWithMappedDetails = { ...sale, details: mappedDetails };
                      saleTotal = calculateSaleTotalWithTax(saleWithMappedDetails as SaleWithDetails);
                      
                      // Construir lista de productos con nombres reales
                      productsList = sale.sale_details.map((detail: any) => {
                        const productName = detail.products?.name || detail.product?.name || 'Producto desconocido';
                        return `${detail.quantity}x ${productName}`;
                      }).join(', ');
                    } else {
                      // Si no hay detalles, usar total_amount directamente
                      // Si total_amount es 0 o null, intentar calcular desde unit_price si está disponible
                      if (sale.total_amount && sale.total_amount > 0) {
                        saleTotal = sale.total_amount;
                      } else if (sale.unit_price && sale.quantity) {
                        // Para ventas antiguas sin sale_details, usar unit_price * quantity
                        saleTotal = sale.unit_price * sale.quantity;
                      } else {
                        saleTotal = 0;
                      }
                      // Intentar obtener nombre del producto desde sale_details enriquecidos o sale.product_name
                      // Los productos ya deberían estar en sale.sale_details si fueron enriquecidos
                      if (sale.sale_details && sale.sale_details.length > 0) {
                        // Si hay sale_details enriquecidos, usarlos
                        productsList = sale.sale_details.map((detail: any) => {
                          const productName = detail.products?.name || detail.product?.name || 'Producto desconocido';
                          return `${detail.quantity || 1}x ${productName}`;
                        }).join(', ');
                      } else if (sale.product_id) {
                        // Si no hay sale_details pero hay product_id, intentar desde sale.product_name
                        if (sale.product_name) {
                          productsList = `${sale.quantity || 1}x ${sale.product_name}`;
                        } else {
                          productsList = 'Producto desconocido';
                        }
                      } else if (sale.product_name) {
                        productsList = `${sale.quantity || 1}x ${sale.product_name}`;
                      } else {
                        productsList = 'Sin productos';
                      }
                    }
                    
                    // Limitar longitud de productos para impresión térmica, pero mostrar más información
                    const maxProductLength = isPOS58 ? 25 : 40;
                    if (productsList.length > maxProductLength) {
                      productsList = productsList.substring(0, maxProductLength - 3) + '...';
                    }
                    
                    return `
                      <tr>
                        <td>${index + 1}</td>
                        <td>${saleDate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${sale.clients?.full_name || sale.customer_name || 'Cliente General'}</td>
                        <td>${productsList}</td>
                        <td class="text-right">${money(saleTotal)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td colspan="4">TOTAL</td>
                    <td class="text-right">${money(totalSales)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </body>
        </html>
      `;

      // Abrir ventana de impresión
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    } catch (error: any) {
      console.error('Error generando cuadre de caja:', error);
      toast.error(`Error al generar cuadre de caja: ${error.message}`);
    }
  };



  const generateReceiptFromSale = async (sale: SaleWithDetails, format: 'A4' | 'POS80' | 'POS58' = 'POS80') => {
    // Obtener información de la empresa
    let companyName = 'SH Computers';
    let companyAddress = '';
    let companyPhone = '';
    
    try {
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('company_name, address, phone')
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (companySettings) {
        companyName = companySettings.company_name || companyName;
        companyAddress = companySettings.address || '';
        companyPhone = companySettings.phone || '';
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
    
    const invoiceNumber = `${sale.id.substring(0, 8)}`;
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    const isThermal = format === 'POS80' || format === 'POS58';
    const isPOS58 = format === 'POS58';
    
    // Calcular subtotal e ITBIS desde los detalles
    let subtotal = 0;
    let totalTax = 0;
    
    const itemsRows = sale.details.map(detail => {
      const itbisRate = detail.product?.itbis_rate ?? 18;
      
      // unit_price se guarda CON ITBIS, total_price se guarda SIN ITBIS (subtotal)
      // Calcular el total con ITBIS: total_price (sin ITBIS) + ITBIS
      const itemSubtotal = detail.total_price; // Ya es sin ITBIS
      const itemTax = itemSubtotal * (itbisRate / 100);
      const itemTotalWithTax = itemSubtotal + itemTax;
      
      subtotal += itemSubtotal;
      totalTax += itemTax;
      
      // El precio unitario con ITBIS es unit_price (que ya tiene ITBIS)
      // O calcularlo: (total_price / cantidad) * (1 + itbisRate / 100)
      const unitPriceWithTax = detail.unit_price; // Ya tiene ITBIS
      
      const maxNameLength = isPOS58 ? 18 : 28;
      const productName = (detail.product?.name || 'Producto desconocido').length > maxNameLength 
        ? (detail.product?.name || 'Producto desconocido').substring(0, maxNameLength - 3) + '...' 
        : (detail.product?.name || 'Producto desconocido');
      
      const discountCol = isPOS58 ? '' : '<td class="right">0%</td>';
      const unitPrice = `<td class="right">${money(unitPriceWithTax)}</td>`;
      
      return `
        <tr>
          <td>${productName}</td>
        <td class="right">${detail.quantity}</td>
          ${unitPrice}
          ${discountCol}
          <td class="right">${money(itemTotalWithTax)}</td>
      </tr>
      `;
    }).join('');

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
      .field { margin: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; display: flex; justify-content: space-between; }
      .label { font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      th, td { padding: 2px 1px; border-bottom: 1px dashed #ccc; }
      thead th { background: transparent; border-bottom: 1px solid #000; font-size: ${isPOS58 ? '7px' : '8px'}; }
      tbody td { font-size: ${isPOS58 ? '7px' : '8px'}; }
      .summary { padding: 4px 0; border-top: 1px solid #000; margin-top: 4px; }
      .sum-row { padding: 1px 0; font-size: ${isPOS58 ? '7px' : '8px'}; }
      .sum-row.total { border-top: 1px solid #000; padding-top: 2px; font-weight: bold; font-size: ${isPOS58 ? '9px' : '10px'}; }
      .footer { margin-top: 8px; font-size: ${isPOS58 ? '7px' : '8px'}; text-align: center; }
      .divider { border-top: 1px dashed #000; margin: 2px 0; }
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
          .divider { border-top: 1px dashed #000; margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="invoice">
          <div class="header">
            <div class="brand-name">${companyName}</div>
            ${companyAddress ? `<div class="brand-meta">${companyAddress}</div>` : ''}
            ${companyPhone ? `<div class="brand-meta">${companyPhone}</div>` : ''}
            <div class="doc-type">FACTURA</div>
            <div class="doc-number">Venta #${invoiceNumber}</div>
          </div>

          <div class="section">
            <div class="section-title">Cliente</div>
            <div class="field"><span class="label">Nombre:</span><span>${sale.client_name || 'Cliente General'}</span></div>
            <div class="section-title" style="margin-top:4px;">Venta</div>
            <div class="field"><span class="label">Fecha:</span><span>${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') + ' ' + new Date(sale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</span></div>
            <div class="field"><span class="label">Método de Pago:</span><span>${(() => {
              const methodNames: Record<string, string> = {
                'cash': 'Efectivo',
                'card': 'Tarjeta',
                'transfer': 'Transferencia',
                'check': 'Cheque',
                'financing': 'Financiamiento'
              };
              return methodNames[sale.payment_method || 'cash'] || sale.payment_method || 'Efectivo';
            })()}</span></div>
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
            <div class="sum-row"><span>Subtotal:</span><span>${money(subtotal)}</span></div>
            <div class="sum-row"><span>ITBIS:</span><span>${money(totalTax)}</span></div>
            <div class="sum-row total"><span>TOTAL:</span><span>${money(subtotal + totalTax)}</span></div>
          </div>

          <div class="footer">
            <div>Gracias por su preferencia</div>
            <div>${sale.sale_date ? new Date(sale.sale_date).toLocaleDateString('es-DO') + ' ' + new Date(sale.sale_date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleDateString('es-DO')}</div>
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
            <div><strong>Método de pago:</strong> ${(() => {
              const methodNames: Record<string, string> = {
                'cash': 'Efectivo',
                'card': 'Tarjeta',
                'transfer': 'Transferencia',
                'check': 'Cheque',
                'financing': 'Financiamiento'
              };
              return methodNames[sale.payment_method || 'cash'] || sale.payment_method || 'Efectivo';
            })()}</div>
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
            <div class="sum-row"><span>Subtotal:</span><span>${money(subtotal)}</span></div>
            <div class="sum-row"><span>ITBIS:</span><span>${money(totalTax)}</span></div>
            <div class="sum-row total">
              <span>Total</span>
              <span>${money(subtotal + totalTax)}</span>
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

  const downloadReceiptFromSale = async (sale: SaleWithDetails) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    
    const invoiceNumber = `${sale.id.substring(0, 8)}`;
    const companyName = 'SH Computers';
    const money = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n || 0);
    
    // Traducir método de pago
    const translatePaymentMethod = (method: string | null) => {
      const methods: { [key: string]: string } = {
        'cash': 'Efectivo',
        'card': 'Tarjeta',
        'transfer': 'Transferencia',
        'check': 'Cheque',
        'financing': 'Financiamiento'
      };
      return methods[method || 'cash'] || method || 'Efectivo';
    };
    
    // Obtener información de la empresa
    const { data: companySettings } = await supabase
      .from('company_settings')
      .select('company_name, address, phone')
      .eq('user_id', user?.id)
      .maybeSingle();
    
    const finalCompanyName = companySettings?.company_name || companyName;
    const companyAddress = companySettings?.address || '';
    const companyPhone = companySettings?.phone || '';

    // Calcular subtotal e ITBIS desde los detalles
    let subtotal = 0;
    let totalTax = 0;
    
    const tableData = sale.details.map(detail => {
      const itbisRate = detail.product?.itbis_rate ?? 18;
      const itemSubtotal = detail.total_price; // Ya es sin ITBIS
      const itemTax = itemSubtotal * (itbisRate / 100);
      const itemTotalWithTax = itemSubtotal + itemTax;
      
      subtotal += itemSubtotal;
      totalTax += itemTax;
      
      return [
        detail.product?.name || 'Producto desconocido',
        detail.quantity.toString(),
        money(detail.unit_price), // Precio unitario con ITBIS
        money(itemTotalWithTax) // Total del item con ITBIS
      ];
    });
    
    // Calcular total con ITBIS usando la función existente
    const totalWithTax = calculateSaleTotalWithTax(sale);

    // Crear documento PDF
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    let yPos = margin;

    // Encabezado
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(finalCompanyName, margin, yPos);
    yPos += 7;

    if (companyAddress) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(companyAddress, margin, yPos);
      yPos += 5;
    }

    if (companyPhone) {
      doc.setFontSize(10);
      doc.text(`Tel: ${companyPhone}`, margin, yPos);
      yPos += 5;
    }

    // Línea separadora
    yPos += 3;
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Título del documento
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', margin, yPos);
    yPos += 5;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Número: ${invoiceNumber}`, margin, yPos);
    yPos += 8;

    // Información del cliente y fecha
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Cliente:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(sale.client_name || 'Cliente General', margin + 25, yPos);
    yPos += 6;

    const saleDate = sale.sale_date 
      ? new Date(sale.sale_date).toLocaleDateString('es-DO', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      : sale.created_at
        ? new Date(sale.created_at).toLocaleDateString('es-DO', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })
        : 'N/A';
    
    doc.setFont('helvetica', 'bold');
    doc.text('Fecha:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(saleDate, margin + 25, yPos);
    yPos += 6;

    // Método de pago
    doc.setFont('helvetica', 'bold');
    doc.text('Método de pago:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(translatePaymentMethod(sale.payment_method), margin + 40, yPos);
    yPos += 10;

    // Agregar tabla con autoTable
    autoTable(doc, {
      head: [['Descripción', 'Cant.', 'Precio', 'Importe']],
      body: tableData,
      startY: yPos,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { 
        fillColor: [66, 139, 202], 
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      margin: { left: margin, right: margin },
      didDrawPage: (data) => {
        yPos = data.cursor.y;
      }
    });

    // Obtener la posición final después de la tabla
    const finalY = (doc as any).lastAutoTable.finalY || yPos + 20;
    yPos = finalY + 10;

    // Resumen con subtotal, ITBIS y total
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    const subtotalText = `Subtotal: ${money(subtotal)}`;
    const subtotalWidth = doc.getTextWidth(subtotalText);
    doc.text(subtotalText, pageWidth - margin - subtotalWidth, yPos);
    yPos += 6;

    const taxText = `ITBIS: ${money(totalTax)}`;
    const taxWidth = doc.getTextWidth(taxText);
    doc.text(taxText, pageWidth - margin - taxWidth, yPos);
    yPos += 8;

    // Total con ITBIS
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    const totalText = `Total: ${money(totalWithTax)}`;
    const totalWidth = doc.getTextWidth(totalText);
    doc.text(totalText, pageWidth - margin - totalWidth, yPos);

    // Pie de página
    yPos = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Gracias por su preferencia', pageWidth / 2, yPos, { align: 'center' });
    yPos += 5;
    doc.text(
      `Generado el: ${new Date().toLocaleDateString('es-DO')} ${new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`,
      pageWidth / 2,
      yPos,
      { align: 'center' }
    );

    // Descargar PDF
    doc.save(`factura_${invoiceNumber}_${new Date().toISOString().split('T')[0]}.pdf`);
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
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4">
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
                      value={salesProductFilterName}
                      onChange={(e) => {
                        const searchValue = e.target.value;
                        setSalesProductFilterName(searchValue);
                        // Si se borra el texto, limpiar también el filtro
                        if (!searchValue.trim()) {
                          setSalesProductFilter('');
                      setSalesProductFilterName('');
                        }
                        handleSalesProductSearch(searchValue);
                      }}
                      onFocus={() => {
                        if (salesProductFilterName.trim()) {
                          handleSalesProductSearch(salesProductFilterName);
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
                              setSalesProductFilter(product.id); // Guardar ID para filtrar
                              setSalesProductFilterName(product.name); // Mostrar nombre en el campo
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
                <div>
                  <Label>Empleado</Label>
                  <Select
                    value={salesEmployeeFilter || 'all'}
                    onValueChange={(value) => setSalesEmployeeFilter(value === 'all' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los empleados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los empleados</SelectItem>
                      {employees.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSalesDateFrom(getTodayStart());
                      setSalesDateTo(getTodayEnd());
                      setSalesProductFilter('');
                      setSalesProductFilterName('');
                      setSalesCategoryFilter('');
                      setSalesBrandFilter('');
                      setSalesEmployeeFilter('');
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
                  ${sales.reduce((sum, s) => sum + calculateSaleTotalWithTax(s), 0).toLocaleString()}
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
                    ? (sales.reduce((sum, s) => sum + calculateSaleTotalWithTax(s), 0) / sales.length).toFixed(2)
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

          {/* Botón de Cuadre de Caja */}
          <Card>
            <CardContent className="pt-6">
              <Button
                variant="default"
                size="lg"
                onClick={() => setShowCashRegister(true)}
                className="w-full"
              >
                <FileText className="h-5 w-5 mr-2" />
                Generar Cuadre de Caja
              </Button>
            </CardContent>
          </Card>

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
                            ${calculateSaleTotalWithTax(sale).toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div className="border-t pt-3 mt-3">
                        <h4 className="font-medium mb-2">Productos:</h4>
                        <div className="space-y-2">
                          {sale.details.map((detail) => {
                            // Calcular el total con ITBIS para mostrar
                            const itbisRate = detail.product?.itbis_rate ?? 18;
                            const itemSubtotal = detail.total_price; // Ya es sin ITBIS
                            const itemTax = itemSubtotal * (itbisRate / 100);
                            const itemTotalWithTax = itemSubtotal + itemTax;
                            
                            return (
                            <div key={detail.id} className="flex justify-between text-sm bg-gray-50 p-2 rounded">
                              <span>
                                {detail.product?.name || 'Producto desconocido'} 
                                {detail.product?.sku && ` (Código: ${detail.product.sku})`}
                              </span>
                              <span className="font-medium">
                                  {detail.quantity} x ${detail.unit_price.toFixed(2)} = ${itemTotalWithTax.toFixed(2)}
                              </span>
                            </div>
                            );
                          })}
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
                            onClick={() => {
                              setEditingSale(sale);
                              setShowEditSaleModal(true);
                            }}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
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
                      value={movementProductFilterName}
                      onChange={(e) => {
                        const searchValue = e.target.value;
                        setMovementProductFilterName(searchValue);
                        // Si se borra el texto, limpiar también el filtro
                        if (!searchValue.trim()) {
                          setMovementProductFilter('');
                        }
                        handleMovementProductSearch(searchValue);
                      }}
                      onFocus={() => {
                        if (movementProductFilterName.trim()) {
                          handleMovementProductSearch(movementProductFilterName);
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
                              setMovementProductFilter(product.id); // Guardar ID para filtrar
                              setMovementProductFilterName(product.name); // Mostrar nombre en el campo
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
                      setMovementProductFilterName('');
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
                      ${sales.reduce((sum, s) => sum + calculateSaleTotalWithTax(s), 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio por venta:</span>
                    <span className="font-semibold">
                      ${sales.length > 0 
                        ? (sales.reduce((sum, s) => sum + calculateSaleTotalWithTax(s), 0) / sales.length).toFixed(2)
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
                    Total: ${selectedSale ? calculateSaleTotalWithTax(selectedSale).toFixed(2) : '0.00'}
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
                    // Recalcular SOLO los precios CON ITBIS basándose en los precios SIN ITBIS
                    // El precio sin ITBIS NO debe cambiar cuando cambia el ITBIS
                    if (purchaseNoTax > 0) {
                      setPurchaseWithTax(Number((purchaseNoTax * (1 + rate / 100)).toFixed(2)));
                    }
                    if (sellingNoTax > 0) {
                      setSellingWithTax(Number((sellingNoTax * (1 + rate / 100)).toFixed(2)));
                    }
                    // NO recalcular los precios sin ITBIS cuando cambia el ITBIS
                    // Los precios sin ITBIS deben mantenerse constantes
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

      {/* Edit Sale Dialog */}
      <Dialog open={showEditSaleModal} onOpenChange={(open) => {
        setShowEditSaleModal(open);
        if (!open) {
          setEditingSale(null);
          setEditSaleSelectedClient(null);
          setEditSaleClientSearch('');
          setEditSaleProducts([]);
          setEditSalePaymentMethod('cash');
          setEditSaleNotes('');
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Venta #{editingSale?.sale_number || editingSale?.id.substring(0, 8)}</DialogTitle>
          </DialogHeader>
          {editingSale && (
            <div className="space-y-4">
              {/* Cliente */}
              <div>
                <Label>Cliente</Label>
                <div className="relative">
                  <Input
                    placeholder="Buscar cliente..."
                    value={editSaleClientSearch}
                    onChange={async (e) => {
                      const search = e.target.value;
                      setEditSaleClientSearch(search);
                      if (search.length > 0 && companyId) {
                        const { data } = await supabase
                          .from('clients')
                          .select('id, full_name, dni, phone')
                          .eq('user_id', companyId)
                          .ilike('full_name', `%${search}%`)
                          .limit(10);
                        setEditSaleFilteredClients(data || []);
                        setShowEditSaleClientDropdown(true);
                      } else {
                        setEditSaleFilteredClients([]);
                        setShowEditSaleClientDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      if (editSaleClientSearch.length > 0) {
                        setShowEditSaleClientDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowEditSaleClientDropdown(false), 200);
                    }}
                  />
                  {showEditSaleClientDropdown && editSaleFilteredClients.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      {editSaleFilteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setEditSaleSelectedClient(client);
                            setEditSaleClientSearch(client.full_name);
                            setShowEditSaleClientDropdown(false);
                          }}
                        >
                          <div className="font-medium">{client.full_name}</div>
                          <div className="text-sm text-gray-600">DNI: {client.dni} | Tel: {client.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {editSaleSelectedClient && (
                  <p className="text-sm text-gray-600 mt-1">Cliente seleccionado: {editSaleSelectedClient.full_name}</p>
                )}
              </div>

              {/* Productos */}
              <div>
                <Label>Productos</Label>
                <div className="relative mb-2">
                  <Input
                    placeholder="Buscar producto para agregar..."
                    value={editSaleProductSearch}
                    onChange={async (e) => {
                      const search = e.target.value;
                      setEditSaleProductSearch(search);
                      if (search.length > 0) {
                        const filtered = products.filter(p => 
                          p.name.toLowerCase().includes(search.toLowerCase()) ||
                          (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
                        ).slice(0, 10);
                        setEditSaleFilteredProducts(filtered);
                        setShowEditSaleProductDropdown(true);
                      } else {
                        setShowEditSaleProductDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      if (editSaleProductSearch.length > 0) {
                        setShowEditSaleProductDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => setShowEditSaleProductDropdown(false), 200);
                    }}
                  />
                  {showEditSaleProductDropdown && editSaleFilteredProducts.length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto mt-1">
                      {editSaleFilteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const itbisRate = product.itbis_rate ?? 18;
                            const priceWithTax = product.selling_price;
                            const priceWithoutTax = priceWithTax / (1 + itbisRate / 100);
                            setEditSaleProducts([...editSaleProducts, {
                              id: `temp-${Date.now()}`,
                              product_id: product.id,
                              product: product,
                              quantity: 1,
                              unit_price: priceWithTax,
                              total_price: priceWithoutTax
                            }]);
                            setEditSaleProductSearch('');
                            setShowEditSaleProductDropdown(false);
                          }}
                        >
                          <div className="font-medium">{product.name}</div>
                          <div className="text-sm text-gray-600">
                            {product.sku && `Código: ${product.sku} | `}
                            Precio: ${product.selling_price.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2 border rounded-lg p-3 max-h-60 overflow-y-auto">
                  {editSaleProducts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">No hay productos agregados</p>
                  ) : (
                    editSaleProducts.map((item, index) => {
                      const itbisRate = item.product?.itbis_rate ?? 18;
                      const itemSubtotal = item.total_price;
                      const itemTax = itemSubtotal * (itbisRate / 100);
                      const itemTotalWithTax = itemSubtotal + itemTax;
                      return (
                        <div key={item.id || index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex-1">
                            <p className="font-medium">{item.product?.name || 'Producto'}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <div>
                                <Label className="text-xs">Cantidad</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const qty = Number(e.target.value) || 1;
                                    const newItems = [...editSaleProducts];
                                    newItems[index].quantity = qty;
                                    newItems[index].total_price = (item.unit_price / (1 + itbisRate / 100)) * qty;
                                    setEditSaleProducts(newItems);
                                  }}
                                  className="w-20 h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Precio Unit.</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.unit_price}
                                  onChange={(e) => {
                                    const price = Number(e.target.value) || 0;
                                    const newItems = [...editSaleProducts];
                                    newItems[index].unit_price = price;
                                    newItems[index].total_price = (price / (1 + itbisRate / 100)) * item.quantity;
                                    setEditSaleProducts(newItems);
                                  }}
                                  className="w-24 h-8"
                                />
                              </div>
                              <div>
                                <p className="text-xs text-gray-600">Total: ${itemTotalWithTax.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditSaleProducts(editSaleProducts.filter((_, i) => i !== index));
                            }}
                            className="ml-2 text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </Button>
    </div>
  );
                    })
                  )}
                </div>
              </div>

              {/* Método de Pago */}
              <div>
                <Label>Método de Pago</Label>
                <Select value={editSalePaymentMethod} onValueChange={setEditSalePaymentMethod}>
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

              {/* Notas */}
              <div>
                <Label>Notas</Label>
                <Textarea
                  value={editSaleNotes}
                  onChange={(e) => setEditSaleNotes(e.target.value)}
                  placeholder="Notas adicionales..."
                  rows={3}
                />
              </div>

              {/* Total */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total:</span>
                  <span className="text-2xl font-bold text-green-600">
                    ${editSaleProducts.reduce((sum, item) => {
                      const itbisRate = item.product?.itbis_rate ?? 18;
                      const itemSubtotal = item.total_price;
                      const itemTax = itemSubtotal * (itbisRate / 100);
                      return sum + itemSubtotal + itemTax;
                    }, 0).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-2 justify-end pt-4 border-t">
                <Button variant="outline" onClick={() => {
                  setShowEditSaleModal(false);
                  setEditingSale(null);
                }}>
                  Cancelar
                </Button>
                <Button onClick={async () => {
                  if (editSaleProducts.length === 0) {
                    toast.error('Debe agregar al menos un producto');
                    return;
                  }
                  const totalAmount = editSaleProducts.reduce((sum, item) => {
                    const itbisRate = item.product?.itbis_rate ?? 18;
                    const itemSubtotal = item.total_price;
                    const itemTax = itemSubtotal * (itbisRate / 100);
                    return sum + itemSubtotal + itemTax;
                  }, 0);
                  const updatedSale: SaleWithDetails = {
                    ...editingSale,
                    client_id: editSaleSelectedClient?.id || editingSale.client_id,
                    payment_method: editSalePaymentMethod,
                    notes: editSaleNotes,
                    total_amount: totalAmount,
                    details: editSaleProducts.map(item => ({
                      id: item.id,
                      sale_id: editingSale.id,
                      product_id: item.product_id,
                      quantity: item.quantity,
                      unit_price: item.unit_price,
                      total_price: item.total_price,
                      product: item.product
                    }))
                  };
                  await handleEditSale(updatedSale);
                }}>
                  Guardar Cambios
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cash Register Dialog */}
      <Dialog open={showCashRegister} onOpenChange={setShowCashRegister}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generar Cuadre de Caja</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Seleccione el formato para imprimir el cuadre de caja.
              {salesDateFrom && salesDateTo ? (
                <span className="block mt-1 font-medium">
                  Período: {new Date(salesDateFrom).toLocaleDateString('es-DO')} - {new Date(salesDateTo).toLocaleDateString('es-DO')}
                </span>
              ) : (
                <span className="block mt-1 font-medium">
                  Período: Día de hoy
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  generateCashRegister('POS80');
                  setShowCashRegister(false);
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                POS80
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  generateCashRegister('POS58');
                  setShowCashRegister(false);
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                POS58
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  generateCashRegister('A4');
                  setShowCashRegister(false);
                }}
              >
                <Printer className="h-4 w-4 mr-2" />
                A4
              </Button>
            </div>
            <Button variant="outline" onClick={() => setShowCashRegister(false)} className="w-full">
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => {
          setShowPasswordVerification(false);
          setProductToDelete(null);
        }}
        onVerify={() => {
          setShowPasswordVerification(false);
          confirmDelete();
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación del producto."
        entityName="producto"
      />
    </div>
  );
};

export default InventoryModule;
