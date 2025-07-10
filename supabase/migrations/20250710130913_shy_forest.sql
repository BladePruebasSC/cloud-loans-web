/*
  # Add inventory management tables

  1. New Tables
    - `products` - Product catalog
    - `suppliers` - Supplier information
    - `purchases` - Purchase orders
    - `purchase_details` - Purchase order line items
    - `sales` - Sales transactions
    - `sale_details` - Sales transaction line items
    - `quotes` - Price quotes
    - `quote_details` - Quote line items

  2. Security
    - Enable RLS on all tables
    - Add policies for users to manage their inventory
*/

-- Products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  category TEXT,
  brand TEXT,
  unit_type TEXT DEFAULT 'unit',
  purchase_price NUMERIC,
  selling_price NUMERIC,
  current_stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'discontinued')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  tax_id TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Purchases table
CREATE TABLE IF NOT EXISTS public.purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  supplier_id UUID REFERENCES public.suppliers(id),
  purchase_number TEXT NOT NULL,
  purchase_date DATE,
  total_amount NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Purchase details table
CREATE TABLE IF NOT EXISTS public.purchase_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_id UUID REFERENCES public.purchases(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sales table
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  sale_number TEXT NOT NULL,
  sale_date DATE,
  total_amount NUMERIC,
  payment_method TEXT DEFAULT 'cash',
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Sale details table
CREATE TABLE IF NOT EXISTS public.sale_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID REFERENCES public.sales(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Quotes table
CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id),
  quote_number TEXT NOT NULL,
  quote_date DATE,
  valid_until DATE,
  total_amount NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Quote details table
CREATE TABLE IF NOT EXISTS public.quote_details (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quote_id UUID REFERENCES public.quotes(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_details ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their products" ON public.products
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their suppliers" ON public.suppliers
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their purchases" ON public.purchases
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view purchase details for their purchases" ON public.purchase_details
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.purchases 
      WHERE purchases.id = purchase_details.purchase_id 
      AND purchases.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their sales" ON public.sales
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view sale details for their sales" ON public.sale_details
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.sales 
      WHERE sales.id = sale_details.sale_id 
      AND sales.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their quotes" ON public.quotes
  FOR ALL TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can view quote details for their quotes" ON public.quote_details
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.quotes 
      WHERE quotes.id = quote_details.quote_id 
      AND quotes.user_id = auth.uid()
    )
  );