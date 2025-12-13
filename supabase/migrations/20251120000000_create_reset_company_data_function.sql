/*
  # Create function to reset all company data
  
  This function allows a company owner to delete all their company data
  while bypassing RLS policies. It must be called with SECURITY DEFINER
  to have elevated permissions.
  
  The function deletes all data related to a company owner, including:
  - Loans and related data (payments, installments, history, etc.)
  - Pawn transactions and payments
  - Clients
  - Products, suppliers, purchases, sales, quotes
  - Employees (except the owner)
  - All other company-related data
  
  Only company_settings and the owner's profile are preserved.
*/

CREATE OR REPLACE FUNCTION reset_company_data(p_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB := '{"success": true, "deleted": {}, "errors": []}'::JSONB;
  v_count INTEGER;
  v_error TEXT;
BEGIN
  -- Verify that the caller is the owner
  IF auth.uid() IS NULL OR auth.uid() != p_owner_id THEN
    RAISE EXCEPTION 'Unauthorized: Only the company owner can reset company data';
  END IF;

  -- Note: SECURITY DEFINER should bypass RLS, but we'll handle errors gracefully

  BEGIN
    -- 1. Delete pawn payments first (they reference pawn_transactions)
    DELETE FROM public.pawn_payments
    WHERE pawn_transaction_id IN (
      SELECT id FROM public.pawn_transactions WHERE user_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,pawn_payments}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('pawn_payments: ' || v_error));
  END;

  BEGIN
    -- 2. Delete pawn transactions
    DELETE FROM public.pawn_transactions WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,pawn_transactions}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('pawn_transactions: ' || v_error));
  END;

  BEGIN
    -- 3. Delete sale details
    DELETE FROM public.sale_details
    WHERE sale_id IN (
      SELECT id FROM public.sales WHERE user_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,sale_details}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('sale_details: ' || v_error));
  END;

  BEGIN
    -- 4. Delete sales
    DELETE FROM public.sales WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,sales}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('sales: ' || v_error));
  END;

  BEGIN
    -- 5. Delete purchase details
    DELETE FROM public.purchase_details
    WHERE purchase_id IN (
      SELECT id FROM public.purchases WHERE user_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,purchase_details}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('purchase_details: ' || v_error));
  END;

  BEGIN
    -- 6. Delete purchases
    DELETE FROM public.purchases WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,purchases}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('purchases: ' || v_error));
  END;

  BEGIN
    -- 7. Delete quote details
    DELETE FROM public.quote_details
    WHERE quote_id IN (
      SELECT id FROM public.quotes WHERE user_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,quote_details}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('quote_details: ' || v_error));
  END;

  BEGIN
    -- 8. Delete quotes
    DELETE FROM public.quotes WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,quotes}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('quotes: ' || v_error));
  END;

  BEGIN
    -- 9. Delete payments
    DELETE FROM public.payments WHERE created_by = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,payments}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('payments: ' || v_error));
  END;

  BEGIN
    -- 10. Delete installments
    DELETE FROM public.installments
    WHERE loan_id IN (
      SELECT id FROM public.loans WHERE loan_officer_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,installments}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('installments: ' || v_error));
  END;

  BEGIN
    -- 11. Delete late fee history
    DELETE FROM public.late_fee_history
    WHERE loan_id IN (
      SELECT id FROM public.loans WHERE loan_officer_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,late_fee_history}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('late_fee_history: ' || v_error));
  END;

  BEGIN
    -- 12. Delete loan history
    DELETE FROM public.loan_history
    WHERE loan_id IN (
      SELECT id FROM public.loans WHERE loan_officer_id = p_owner_id
    );
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,loan_history}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('loan_history: ' || v_error));
  END;

  BEGIN
    -- 13. Delete collection tracking
    DELETE FROM public.collection_tracking WHERE created_by = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,collection_tracking}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('collection_tracking: ' || v_error));
  END;

  BEGIN
    -- 14. Delete payment agreements
    DELETE FROM public.payment_agreements WHERE created_by = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,payment_agreements}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('payment_agreements: ' || v_error));
  END;

  BEGIN
    -- 15. Delete appointments
    DELETE FROM public.appointments WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,appointments}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('appointments: ' || v_error));
  END;

  BEGIN
    -- 16. Delete loan requests
    DELETE FROM public.loan_requests WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,loan_requests}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('loan_requests: ' || v_error));
  END;

  BEGIN
    -- 17. Delete loans (after all related data is deleted)
    DELETE FROM public.loans WHERE loan_officer_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,loans}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('loans: ' || v_error));
    v_result := jsonb_set(v_result, '{success}', 'false'::jsonb);
  END;

  BEGIN
    -- 18. Delete clients
    DELETE FROM public.clients WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,clients}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('clients: ' || v_error));
  END;

  BEGIN
    -- 19. Delete products
    DELETE FROM public.products WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,products}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('products: ' || v_error));
  END;

  BEGIN
    -- 20. Delete suppliers
    DELETE FROM public.suppliers WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,suppliers}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('suppliers: ' || v_error));
  END;

  BEGIN
    -- 21. Delete expenses
    DELETE FROM public.expenses WHERE created_by = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,expenses}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('expenses: ' || v_error));
  END;

  BEGIN
    -- 22. Delete income
    DELETE FROM public.income WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,income}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('income: ' || v_error));
  END;

  BEGIN
    -- 23. Delete cash movements
    DELETE FROM public.cash_movements WHERE created_by = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,cash_movements}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('cash_movements: ' || v_error));
  END;

  BEGIN
    -- 24. Delete saved reports
    DELETE FROM public.saved_reports WHERE user_id = p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,saved_reports}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('saved_reports: ' || v_error));
  END;

  BEGIN
    -- 25. Delete employees (except the owner)
    DELETE FROM public.employees 
    WHERE company_owner_id = p_owner_id 
    AND auth_user_id != p_owner_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_result := jsonb_set(v_result, '{deleted,employees}', to_jsonb(v_count));
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_result := jsonb_set(v_result, '{errors}', 
      COALESCE(v_result->'errors', '[]'::jsonb) || jsonb_build_array('employees: ' || v_error));
  END;

  RETURN v_result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION reset_company_data(UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION reset_company_data(UUID) IS 'Resets all company data for a given owner. Only the owner can call this function. Preserves company_settings and owner profile.';

