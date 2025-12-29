-- Add late fee related fields to loan_requests table
-- These fields are needed for the loan request form to store late fee configuration

ALTER TABLE public.loan_requests
ADD COLUMN IF NOT EXISTS late_fee_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS late_fee_rate DECIMAL(5,2),
ADD COLUMN IF NOT EXISTS grace_period_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_late_fee DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS late_fee_calculation_type VARCHAR(20) DEFAULT 'daily';

-- Add constraints for data validation
ALTER TABLE public.loan_requests 
DROP CONSTRAINT IF EXISTS check_late_fee_rate;

ALTER TABLE public.loan_requests 
ADD CONSTRAINT check_late_fee_rate CHECK (late_fee_rate IS NULL OR late_fee_rate >= 0),
ADD CONSTRAINT check_grace_period_days CHECK (grace_period_days IS NULL OR grace_period_days >= 0),
ADD CONSTRAINT check_max_late_fee CHECK (max_late_fee IS NULL OR max_late_fee >= 0);

-- Add check constraint for late_fee_calculation_type
ALTER TABLE public.loan_requests 
DROP CONSTRAINT IF EXISTS check_late_fee_calculation_type;

ALTER TABLE public.loan_requests 
ADD CONSTRAINT check_late_fee_calculation_type CHECK (
  late_fee_calculation_type IS NULL OR 
  late_fee_calculation_type IN ('daily', 'monthly', 'compound')
);

-- Add comments for documentation
COMMENT ON COLUMN public.loan_requests.late_fee_enabled IS 'Whether late fees are enabled for this loan request';
COMMENT ON COLUMN public.loan_requests.late_fee_rate IS 'Late fee rate percentage (monthly)';
COMMENT ON COLUMN public.loan_requests.grace_period_days IS 'Grace period in days before late fees are applied';
COMMENT ON COLUMN public.loan_requests.max_late_fee IS 'Maximum late fee amount';
COMMENT ON COLUMN public.loan_requests.late_fee_calculation_type IS 'Type of late fee calculation: daily, monthly, or compound';

