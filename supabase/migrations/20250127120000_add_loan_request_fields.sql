-- Add new columns to loan_requests table for expanded loan data
-- This migration adds all the fields that were added to the request form

-- Add loan-specific fields
ALTER TABLE loan_requests 
ADD COLUMN IF NOT EXISTS interest_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS term_months INTEGER,
ADD COLUMN IF NOT EXISTS loan_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS amortization_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(50),
ADD COLUMN IF NOT EXISTS first_payment_date DATE,
ADD COLUMN IF NOT EXISTS closing_costs DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS late_fee BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS minimum_payment_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS minimum_payment_percentage DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS guarantor_required BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS guarantor_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS guarantor_phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS guarantor_dni VARCHAR(20),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add default values for required fields
UPDATE loan_requests 
SET 
  interest_rate = 0,
  term_months = 12,
  loan_type = 'personal',
  amortization_type = 'simple',
  payment_frequency = 'monthly',
  first_payment_date = CURRENT_DATE + INTERVAL '1 month',
  closing_costs = 0,
  late_fee = FALSE,
  minimum_payment_type = 'interest',
  minimum_payment_percentage = 100,
  guarantor_required = FALSE
WHERE 
  interest_rate IS NULL 
  OR term_months IS NULL 
  OR loan_type IS NULL 
  OR amortization_type IS NULL 
  OR payment_frequency IS NULL 
  OR first_payment_date IS NULL 
  OR closing_costs IS NULL 
  OR late_fee IS NULL 
  OR minimum_payment_type IS NULL 
  OR minimum_payment_percentage IS NULL 
  OR guarantor_required IS NULL;

-- Add constraints for data validation
ALTER TABLE loan_requests 
ADD CONSTRAINT check_interest_rate CHECK (interest_rate >= 0),
ADD CONSTRAINT check_term_months CHECK (term_months > 0),
ADD CONSTRAINT check_closing_costs CHECK (closing_costs >= 0),
ADD CONSTRAINT check_minimum_payment_percentage CHECK (minimum_payment_percentage >= 0 AND minimum_payment_percentage <= 100);

-- Add check constraints for enum-like values
ALTER TABLE loan_requests 
ADD CONSTRAINT check_loan_type CHECK (loan_type IN ('personal', 'business', 'mortgage', 'auto', 'education')),
ADD CONSTRAINT check_amortization_type CHECK (amortization_type IN ('simple', 'german', 'american', 'indefinite')),
ADD CONSTRAINT check_payment_frequency CHECK (payment_frequency IN ('monthly', 'biweekly', 'weekly', 'daily')),
ADD CONSTRAINT check_minimum_payment_type CHECK (minimum_payment_type IN ('interest', 'principal', 'both'));

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_loan_requests_loan_type ON loan_requests(loan_type);
CREATE INDEX IF NOT EXISTS idx_loan_requests_amortization_type ON loan_requests(amortization_type);
CREATE INDEX IF NOT EXISTS idx_loan_requests_payment_frequency ON loan_requests(payment_frequency);
CREATE INDEX IF NOT EXISTS idx_loan_requests_first_payment_date ON loan_requests(first_payment_date);

-- Add comments for documentation
COMMENT ON COLUMN loan_requests.interest_rate IS 'Interest rate percentage for the loan';
COMMENT ON COLUMN loan_requests.term_months IS 'Loan term in months';
COMMENT ON COLUMN loan_requests.loan_type IS 'Type of loan (personal, business, mortgage, auto, education)';
COMMENT ON COLUMN loan_requests.amortization_type IS 'Amortization method (simple, german, american, indefinite)';
COMMENT ON COLUMN loan_requests.payment_frequency IS 'Payment frequency (monthly, biweekly, weekly, daily)';
COMMENT ON COLUMN loan_requests.first_payment_date IS 'Date of the first payment';
COMMENT ON COLUMN loan_requests.closing_costs IS 'Additional closing costs for the loan';
COMMENT ON COLUMN loan_requests.late_fee IS 'Whether late fees apply to this loan';
COMMENT ON COLUMN loan_requests.minimum_payment_type IS 'Type of minimum payment (interest, principal, both)';
COMMENT ON COLUMN loan_requests.minimum_payment_percentage IS 'Percentage of minimum payment';
COMMENT ON COLUMN loan_requests.guarantor_required IS 'Whether a guarantor is required';
COMMENT ON COLUMN loan_requests.guarantor_name IS 'Name of the guarantor';
COMMENT ON COLUMN loan_requests.guarantor_phone IS 'Phone number of the guarantor';
COMMENT ON COLUMN loan_requests.guarantor_dni IS 'DNI of the guarantor';
COMMENT ON COLUMN loan_requests.notes IS 'Additional notes about the loan request';
