-- Simple sales table creation without complex dependencies
-- This migration creates the sales table with a simpler approach

-- Drop the sales table if it exists (to start fresh)
DROP TABLE IF EXISTS sales CASCADE;

-- Create sales table without foreign key constraints initially
CREATE TABLE sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  customer_rnc VARCHAR(20),
  customer_address TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_price DECIMAL(10,2) NOT NULL CHECK (total_price >= 0),
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'transfer', 'check')),
  sale_type VARCHAR(10) DEFAULT 'cash' CHECK (sale_type IN ('cash', 'credit')),
  ncf_type VARCHAR(2) DEFAULT '01' CHECK (ncf_type IN ('01', '02', '03', '04', '14', '15')),
  ncf_number VARCHAR(20),
  notes TEXT,
  sale_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add comments to explain the table and columns
COMMENT ON TABLE sales IS 'Sales records for point of sale system';
COMMENT ON COLUMN sales.user_id IS 'User who made the sale';
COMMENT ON COLUMN sales.product_id IS 'Product that was sold (optional foreign key)';
COMMENT ON COLUMN sales.customer_name IS 'Name of the customer who made the purchase';
COMMENT ON COLUMN sales.customer_phone IS 'Customer phone number (optional)';
COMMENT ON COLUMN sales.customer_email IS 'Customer email address (optional)';
COMMENT ON COLUMN sales.customer_rnc IS 'Customer RNC (tax ID) for Dominican Republic (required for credit sales)';
COMMENT ON COLUMN sales.customer_address IS 'Customer address (optional)';
COMMENT ON COLUMN sales.quantity IS 'Quantity of items sold';
COMMENT ON COLUMN sales.unit_price IS 'Price per unit';
COMMENT ON COLUMN sales.total_price IS 'Total price of the sale';
COMMENT ON COLUMN sales.payment_method IS 'Method of payment used';
COMMENT ON COLUMN sales.sale_type IS 'Type of sale: cash or credit';
COMMENT ON COLUMN sales.ncf_type IS 'NCF type for Dominican Republic: 01=Factura, 02=Nota Debito, 03=Nota Credito, 04=Comprobante, 14=Exportacion, 15=Importacion';
COMMENT ON COLUMN sales.ncf_number IS 'NCF number for Dominican Republic tax compliance';
COMMENT ON COLUMN sales.notes IS 'Additional notes about the sale';
COMMENT ON COLUMN sales.sale_date IS 'Date and time when the sale was made';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_customer_name ON sales(customer_name);
CREATE INDEX IF NOT EXISTS idx_sales_sale_type ON sales(sale_type);
CREATE INDEX IF NOT EXISTS idx_sales_ncf_type ON sales(ncf_type);
CREATE INDEX IF NOT EXISTS idx_sales_ncf_number ON sales(ncf_number);

-- Create RLS policies
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own sales
CREATE POLICY "Users can view their own sales" ON sales
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own sales
CREATE POLICY "Users can insert their own sales" ON sales
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own sales
CREATE POLICY "Users can update their own sales" ON sales
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own sales
CREATE POLICY "Users can delete their own sales" ON sales
  FOR DELETE USING (auth.uid() = user_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_sales_updated_at_trigger
  BEFORE UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_updated_at();

-- Add foreign key constraint for product_id if products table exists
-- This is done as a separate step to avoid dependency issues
DO $$
BEGIN
  -- Check if products table exists and has the id column
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'products' AND table_schema = 'public'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'id' AND table_schema = 'public'
  ) THEN
    -- Add the foreign key constraint
    BEGIN
      ALTER TABLE sales ADD CONSTRAINT fk_sales_product_id 
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
      RAISE NOTICE 'Foreign key fk_sales_product_id created successfully';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not create foreign key fk_sales_product_id: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'Products table does not exist - foreign key will be added later';
  END IF;
END $$;
