-- ============================================================================
-- EL HISTORIAL DE "AGREGAR CARGO" TAMBIÉN CUENTA LOS GASTOS DE CIERRE
-- ============================================================================
-- FALLO REPORTADO (2026-10-16): "según el historial, antes del cargo tenía como balance 27,000
-- y después del cargo 28,000, pero no es así, porque al crear el préstamo se le indicó que tenía
-- un gasto de cierre de 2,500: el balance anterior al cargo debería ser 29,500 y después 30,500.
-- Afuera, en los datos del preview, sale perfecto; solo es en el historial de modificaciones".
--
-- CAUSA: al agregar un cargo, el "antes" y el "después" se guardaban desde
-- `loans.remaining_balance`, una columna que NACÍA SIN el cargo de los gastos de cierre (ver
-- 20261015000000). Las dos cifras quedaron cortas por ese mismo importe, y una entrada del
-- historial ya escrita no se arregla sola: es un registro, no un cálculo.
--
-- La aplicación ya no las escribe así —ahora las dos salen de `getLoanBalanceBreakdown`, el
-- mismo cálculo de la tarjeta—. Esta migración REPARA las entradas que ya estaban guardadas.
--
-- QUÉ SE CORRIGE Y QUÉ NO. Solo se toca una entrada cuando se puede DEMOSTRAR que se escribió
-- con el saldo corto, es decir, cuando su "antes" es exactamente:
--
--     total_amount del préstamo  +  los cargos de las entradas anteriores
--
-- que es, al céntimo, lo que valía la columna antes de que existiera el cargo del cierre. Si hubo
-- pagos, abonos u otros movimientos por medio, la cuenta no cuadra y la entrada se deja intacta:
-- más vale no tocar un registro que inventarle una cifra.
--
-- Y solo en préstamos con gastos de cierre NO financiados (financiados van dentro del capital, no
-- son un cargo) que de verdad tengan esa cuota-cargo guardada.
--
-- A las dos cifras se les suma el cargo del cierre, así que la diferencia entre ellas —el monto
-- del cargo— no cambia. Es idempotente: una vez corregida, el "antes" ya no coincide con la
-- cuenta de arriba y la entrada no se vuelve a tocar.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_antes NUMERIC;
  v_despues NUMERIC;
  v_ok BOOLEAN;
  v_loan UUID := NULL;
  v_cargos_previos NUMERIC := 0;
  v_corregidas INTEGER := 0;
BEGIN
  FOR r IN
    SELECT h.id,
           h.loan_id,
           h.created_at,
           h.old_value,
           h.new_value,
           ROUND(COALESCE(l.total_amount, 0)::numeric, 2) AS total_amount,
           ROUND(COALESCE(l.closing_costs, 0)::numeric, 2) AS cierre
      FROM public.loan_history h
      JOIN public.loans l ON l.id = h.loan_id
     WHERE h.change_type = 'balance_adjustment'
       AND h.description LIKE 'Agregar Cargo%'
       -- Solo JSON de objeto: cualquier otra cosa no se castea (y no se rompe la migración).
       AND h.old_value LIKE '{%'
       AND h.new_value LIKE '{%'
       AND COALESCE(l.closing_costs, 0) > 0.01
       AND COALESCE(l.closing_costs_financed, false) = false
       AND EXISTS (
         -- La cuota-cargo de los gastos de cierre tiene que existir de verdad.
         SELECT 1
           FROM public.installments i
          WHERE i.loan_id = l.id
            AND ABS(COALESCE(i.interest_amount, 0)) < 0.01
            AND ABS(COALESCE(i.total_amount, 0) - COALESCE(l.closing_costs, 0)) < 0.01
            AND ABS(COALESCE(i.principal_amount, 0) - COALESCE(i.total_amount, 0)) < 0.01
       )
     ORDER BY h.loan_id, h.created_at
  LOOP
    -- Primera entrada de este préstamo: se reinicia la cuenta de cargos anteriores.
    IF v_loan IS DISTINCT FROM r.loan_id THEN
      v_loan := r.loan_id;
      v_cargos_previos := 0;
    END IF;

    v_ok := TRUE;
    BEGIN
      v_antes := ROUND((((r.old_value)::jsonb) ->> 'balance')::numeric, 2);
      v_despues := ROUND((((r.new_value)::jsonb) ->> 'balance')::numeric, 2);
    EXCEPTION WHEN others THEN
      v_ok := FALSE;
    END;

    IF v_ok AND v_antes IS NOT NULL AND v_despues IS NOT NULL THEN
      IF ABS(v_antes - (r.total_amount + v_cargos_previos)) < 0.01 THEN
        UPDATE public.loan_history
           SET old_value = jsonb_set(
                 (old_value)::jsonb, '{balance}', to_jsonb(ROUND(v_antes + r.cierre, 2))
               )::text,
               new_value = jsonb_set(
                 (new_value)::jsonb, '{balance}', to_jsonb(ROUND(v_despues + r.cierre, 2))
               )::text
         WHERE id = r.id;

        v_corregidas := v_corregidas + 1;
        RAISE NOTICE 'Préstamo %: la entrada % pasa de % → % a % → %',
          r.loan_id, r.id, v_antes, v_despues,
          ROUND(v_antes + r.cierre, 2), ROUND(v_despues + r.cierre, 2);
      END IF;

      -- El cargo de esta entrada cuenta para la siguiente del mismo préstamo.
      v_cargos_previos := ROUND(v_cargos_previos + (v_despues - v_antes), 2);
    END IF;
  END LOOP;

  RAISE NOTICE 'Entradas de "Agregar Cargo" corregidas con los gastos de cierre: %', v_corregidas;
END $$;
