-- Add new fields to pawn_transactions table
-- This migration adds support for different interest rate types and period management

-- Add new columns to pawn_transactions table
ALTER TABLE pawn_transactions 
ADD COLUMN IF NOT EXISTS interest_rate_type VARCHAR(20) DEFAULT 'monthly' CHECK (interest_rate_type IN ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
ADD COLUMN IF NOT EXISTS period_days INTEGER DEFAULT 60 CHECK (period_days > 0);

-- Add comment to explain the new fields
COMMENT ON COLUMN pawn_transactions.interest_rate_type IS 'Type of interest rate: daily, weekly, biweekly, monthly, quarterly, or yearly';
COMMENT ON COLUMN pawn_transactions.period_days IS 'Period in days for the pawn transaction';

-- Update existing records to have default values
UPDATE pawn_transactions 
SET interest_rate_type = 'monthly', period_days = 60 
WHERE interest_rate_type IS NULL OR period_days IS NULL;

-- Create index for better performance on period_days
CREATE INDEX IF NOT EXISTS idx_pawn_transactions_period_days ON pawn_transactions(period_days);

-- Create index for better performance on interest_rate_type
CREATE INDEX IF NOT EXISTS idx_pawn_transactions_interest_rate_type ON pawn_transactions(interest_rate_type);

-- Add RLS policies for the new columns (if RLS is enabled)
-- These policies will inherit from existing RLS policies on the table

-- Add new columns to products table for pawn forfeited items
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS original_transaction_id UUID REFERENCES pawn_transactions(id);

-- Add comment to explain the new fields in products table
COMMENT ON COLUMN products.source IS 'Source of the product: manual, pawn_forfeited, etc.';
COMMENT ON COLUMN products.original_transaction_id IS 'Reference to the original pawn transaction if this product came from a forfeited pawn';

-- Create index for better performance on original_transaction_id
CREATE INDEX IF NOT EXISTS idx_products_original_transaction_id ON products(original_transaction_id);

-- Create index for better performance on source
CREATE INDEX IF NOT EXISTS idx_products_source ON products(source);

-- Update the table comment to reflect the new functionality
COMMENT ON TABLE pawn_transactions IS 'Pawn transactions with flexible interest rate types and period management';
