-- Add itbis_rate column to products table
-- This allows each product to have its own ITBIS percentage

ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS itbis_rate NUMERIC(5,2) DEFAULT 18.00 CHECK (itbis_rate >= 0 AND itbis_rate <= 100);

-- Update existing products to have default ITBIS rate of 18%
UPDATE public.products 
SET itbis_rate = 18.00 
WHERE itbis_rate IS NULL;

-- Add comment to explain the field
COMMENT ON COLUMN public.products.itbis_rate IS 'ITBIS tax rate percentage for this product (e.g., 18.00, 10.00, 0.00). Default is 18.00%';

