-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert loan history for their company loans" ON public.loan_history;
DROP POLICY IF EXISTS "Users can view loan history for their company loans" ON public.loan_history;

-- Create new policies using get_user_company_id() function
CREATE POLICY "Users can insert loan history for their company loans" 
ON public.loan_history 
FOR INSERT 
WITH CHECK (
  loan_id IN (
    SELECT l.id 
    FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.loan_officer_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can view loan history for their company loans" 
ON public.loan_history 
FOR SELECT 
USING (
  loan_id IN (
    SELECT l.id 
    FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.loan_officer_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can update loan history for their company loans" 
ON public.loan_history 
FOR UPDATE 
USING (
  loan_id IN (
    SELECT l.id 
    FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.loan_officer_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);

CREATE POLICY "Users can delete loan history for their company loans" 
ON public.loan_history 
FOR DELETE 
USING (
  loan_id IN (
    SELECT l.id 
    FROM loans l
    JOIN clients c ON l.client_id = c.id
    WHERE l.loan_officer_id = get_user_company_id() 
       OR c.user_id = get_user_company_id()
  )
);