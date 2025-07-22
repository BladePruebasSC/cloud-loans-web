/*
  # Update RLS policies for employee-company data sharing

  1. New Function
    - `get_user_company_id()` - Returns the effective company ID for the current user
      - If user is a company owner: returns their own user ID
      - If user is an employee: returns their company_owner_id
      - If user is not found: returns null

  2. Updated RLS Policies
    - Update all data tables to use the new function
    - Employees can now access their company's data
    - Company owners can access their own data and see employee activities

  3. Tables Updated
    - clients
    - loans  
    - payments
    - appointments
    - loan_requests
    - products
    - suppliers
    - purchases
    - sales
    - quotes
    - expenses
    - company_settings
*/

-- Create function to get the effective company ID for the current user
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
  company_id UUID;
  employee_record RECORD;
BEGIN
  -- Get the current authenticated user ID
  user_id := auth.uid();
  
  IF user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Check if the user is an employee
  SELECT company_owner_id, status INTO employee_record
  FROM public.employees 
  WHERE auth_user_id = user_id AND status = 'active'
  LIMIT 1;
  
  -- If user is an active employee, return their company owner ID
  IF FOUND AND employee_record.company_owner_id IS NOT NULL THEN
    RETURN employee_record.company_owner_id;
  END IF;
  
  -- Otherwise, assume user is a company owner and return their own ID
  RETURN user_id;
END;
$$;

-- Drop existing policies and create new ones using the company function

-- Clients table policies
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;

CREATE POLICY "Company users can view company clients"
  ON public.clients
  FOR SELECT
  TO authenticated
  USING (user_id = get_user_company_id());

CREATE POLICY "Company users can create company clients"
  ON public.clients
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = get_user_company_id());

CREATE POLICY "Company users can update company clients"
  ON public.clients
  FOR UPDATE
  TO authenticated
  USING (user_id = get_user_company_id())
  WITH CHECK (user_id = get_user_company_id());

CREATE POLICY "Company users can delete company clients"
  ON public.clients
  FOR DELETE
  TO authenticated
  USING (user_id = get_user_company_id());

-- Loans table policies
DROP POLICY IF EXISTS "Users can view loans for their clients" ON public.loans;
DROP POLICY IF EXISTS "Users can create loans for their clients" ON public.loans;
DROP POLICY IF EXISTS "Users can update loans for their clients" ON public.loans;

CREATE POLICY "Company users can view company loans"
  ON public.loans
  FOR SELECT
  TO authenticated
  USING (
    loan_officer_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = get_user_company_id()
    )
  );

CREATE POLICY "Company users can create company loans"
  ON public.loans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    loan_officer_id = get_user_company_id() AND
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = get_user_company_id()
    )
  );

CREATE POLICY "Company users can update company loans"
  ON public.loans
  FOR UPDATE
  TO authenticated
  USING (
    loan_officer_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = get_user_company_id()
    )
  )
  WITH CHECK (
    loan_officer_id = get_user_company_id() AND
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loans.client_id 
      AND clients.user_id = get_user_company_id()
    )
  );

-- Payments table policies
DROP POLICY IF EXISTS "Users can view payments for their loans" ON public.payments;
DROP POLICY IF EXISTS "Users can create payments for their loans" ON public.payments;

CREATE POLICY "Company users can view company payments"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    created_by = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = payments.loan_id 
      AND (loans.loan_officer_id = get_user_company_id() OR clients.user_id = get_user_company_id())
    )
  );

CREATE POLICY "Company users can create company payments"
  ON public.payments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = get_user_company_id() AND
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = payments.loan_id 
      AND (loans.loan_officer_id = get_user_company_id() OR clients.user_id = get_user_company_id())
    )
  );

CREATE POLICY "Company users can update company payments"
  ON public.payments
  FOR UPDATE
  TO authenticated
  USING (
    created_by = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.loans 
      JOIN public.clients ON loans.client_id = clients.id
      WHERE loans.id = payments.loan_id 
      AND (loans.loan_officer_id = get_user_company_id() OR clients.user_id = get_user_company_id())
    )
  );

-- Appointments table policies
DROP POLICY IF EXISTS "Users can manage their appointments" ON public.appointments;

CREATE POLICY "Company users can manage company appointments"
  ON public.appointments
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Loan requests table policies
DROP POLICY IF EXISTS "Users can manage loan requests for their clients" ON public.loan_requests;

CREATE POLICY "Company users can manage company loan requests"
  ON public.loan_requests
  FOR ALL
  TO authenticated
  USING (
    user_id = get_user_company_id() OR
    EXISTS (
      SELECT 1 FROM public.clients 
      WHERE clients.id = loan_requests.client_id 
      AND clients.user_id = get_user_company_id()
    )
  );

-- Products table policies (if exists)
DROP POLICY IF EXISTS "Users can manage their products" ON public.products;

CREATE POLICY "Company users can manage company products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Suppliers table policies (if exists)
DROP POLICY IF EXISTS "Users can manage their suppliers" ON public.suppliers;

CREATE POLICY "Company users can manage company suppliers"
  ON public.suppliers
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Purchases table policies (if exists)
DROP POLICY IF EXISTS "Users can manage their purchases" ON public.purchases;

CREATE POLICY "Company users can manage company purchases"
  ON public.purchases
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Sales table policies (if exists)
DROP POLICY IF EXISTS "Users can manage their sales" ON public.sales;

CREATE POLICY "Company users can manage company sales"
  ON public.sales
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Quotes table policies (if exists)
DROP POLICY IF EXISTS "Users can manage their quotes" ON public.quotes;

CREATE POLICY "Company users can manage company quotes"
  ON public.quotes
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());

-- Expenses table policies
DROP POLICY IF EXISTS "Users can manage their expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view expenses they created" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;

CREATE POLICY "Company users can manage company expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING (created_by = get_user_company_id());

-- Company settings table policies
DROP POLICY IF EXISTS "Users can manage their company settings" ON public.company_settings;

CREATE POLICY "Company users can manage company settings"
  ON public.company_settings
  FOR ALL
  TO authenticated
  USING (user_id = get_user_company_id());