# Roadmap de ingeniería — Cloud Loans

Derivado de `ENGINEERING_AUDIT.md` (2026-09-01).
Orden de prioridad: **seguridad → integridad de datos → exactitud financiera → corrección
funcional → mantenibilidad → rendimiento → UX**.

---

## Paso 0 — Antes de tocar nada

**Verificar el estado real de la base de datos.** Las migraciones no la describen: hay tablas
que el código usa y que ninguna migración crea, dos archivos vacíos y timestamps incoherentes.
Todo este roadmap parte de lo que el repositorio *declara*.

```sql
-- Qué tablas tienen RLS realmente
SELECT relname, relrowsecurity FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY relrowsecurity, relname;

-- Políticas vivas
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename;

-- Qué versión de get_user_company_id() quedó aplicada
SELECT prosrc FROM pg_proc WHERE proname = 'get_user_company_id';

-- Buckets públicos
SELECT id, public FROM storage.buckets;
```

Con esos resultados, marcar en el audit qué hallazgos están vivos. **No crear migraciones
correctivas a ciegas.**

---

## P0 — Crítico

> Acceso indebido a datos de otras empresas. Si el sistema está en producción con más de una
> empresa, esto va primero que cualquier funcionalidad.

### P0.1 · Cerrar la cadena de toma de control (Edge Functions)
`confirm-employee-email`, `create-employee`, `change-employee-password`

- `confirm-employee-email`: **exigir autenticación** y que quien llama sea dueño de la empresa
  del empleado.
- `create-employee`: **prohibir reutilizar un usuario existente** que ya pertenezca a otra
  empresa. Verificar que quien llama es dueño (`companyId === auth.uid()`), no solo que está
  autenticado.
- Las tres: restringir CORS al dominio de la aplicación, no `*`.

**Prueba:** desde la cuenta de la empresa A, intentar crear un empleado con el correo del dueño
de la empresa B. Debe fallar.

### P0.2 · Arreglar la política UPDATE de `employees`
Nueva migración que sustituya la política por una que **impida modificar** `company_owner_id`,
`role`, `permissions` y `status` desde la propia fila. Lo más simple y seguro: quitar el UPDATE
para `authenticated` y hacer los cambios de perfil por una función `SECURITY DEFINER` que
valide qué campos se tocan.

**Prueba:** un empleado intenta `update employees set role='admin' where auth_user_id = auth.uid()`. Debe fallar.

### P0.3 · Activar RLS en `installments`, `documents` y `notifications`
- `installments`: alcance por el préstamo (`loan_id → loans.loan_officer_id = get_user_company_id()`).
- `documents` y `notifications`: crear primero la migración que las **declare** (hoy no existen
  en el repositorio) y luego sus políticas por `user_id`.

⚠️ Activar RLS en una tabla que la aplicación consulta desde 25 archivos **puede romper
pantallas** si alguna consulta no está acotada. Probar cada una antes de desplegar.

### P0.4 · Cerrar el bucket `documents`
Pasarlo a privado y servir por URL firmada, como ya hace `jce-photos`. Corregir de paso el
alcance de escritura: hoy es por `auth.uid()`, debería ser por empresa, o **los empleados no
pueden subir documentos**.

⚠️ Cambiar el bucket a privado **rompe todas las URLs públicas ya guardadas** en
`documents.file_url` y `clients.photo_url`. Hace falta un plan de migración de esas rutas.

### P0.5 · Cerrar `registration_codes`
Sustituir `FOR ALL USING (true)` por políticas reales. La validación del código en el alta debe
ir por una función `SECURITY DEFINER` acotada, no por acceso directo de `anon` a la tabla.

### P0.6 · Resolver el conflicto de `get_user_company_id()`
Determinar cuál quedó aplicada. Dejar **una sola**, la que exige `status = 'active'`, y añadirle
`SET search_path = public, pg_temp` como el resto de funciones recientes.

---

## P1 — Alto

### P1.1 · Acotar las funciones SQL peligrosas
- `update_all_late_fees*()`: filtrar por empresa, o `REVOKE EXECUTE` de `authenticated` y
  dejarla solo para un proceso programado.
- `legal_get_settings(p_company)`: **ignorar el parámetro** y usar `get_user_company_id()`.
- `legal_days_overdue`, `legal_compute_collection_stage`,
  `recalculate_late_fee_from_scratch`, `calculate_late_fee`: validar la pertenencia del
  `loan_id`.
- `legal_has_permission`: cambiar el **fail-open** por fail-closed.
- Revisar el `REVOKE EXECUTE` de todas las `SECURITY DEFINER` expuestas como RPC.

### P1.2 · Cubrir con pruebas los motores financieros
Antes de unificar nada. Orden: `installmentLateFeeCalculator` (710 líneas, 0 %),
`loanBalanceBreakdown` (281, 0 %), `dateUtils` (218, 0 %),
`nextPaymentDateFromInstallments` (115, 0 %). Ver `TESTING_STRATEGY.md` §6.

### P1.3 · Corregir la tasa sin factor de frecuencia
18 sitios calculan `amount × rate/100` sin el factor: **el doble en quincenal, 30× en diario**.
Sustituir por `getPeriodRate` de `frequencyUtils`. Empezar por los que escriben en la base
(`PointOfSaleModule`, `QuickCollectionModule`), no por los que solo muestran.

### P1.4 · Unificar el saldo pendiente
Con pruebas de equivalencia primero: ejecutar las 7 implementaciones con las mismas entradas y
comparar. Luego dejar `loanBalanceBreakdown.ts` como única, alineada con
`calculate_loan_remaining_balance`.

Prioridad dentro del paso: `QuickCollectionModule:590` (resta cruda, escribe en la base).

### P1.5 · Regenerar `types.ts`
`npx supabase gen types typescript` contra el esquema real. Desbloquea eliminar los 1.075 `any`
y hace que el compilador vuelva a servir para algo.

### P1.6 · Integración continua
Un workflow que ejecute `npm run verify` en cada push. Sin esto, todo lo anterior se degrada
solo.

### P1.7 · Unificar el interés pendiente
Los dos que cuentan **meses de calendario** (`PaymentForm:1727`, `LoanUpdateForm:487`) son los
más urgentes: subestiman el interés en cualquier préstamo que no sea mensual.

---

## P2 — Medio

### P2.1 · Unificar el resto de conceptos duplicados
Capital pendiente (8), mora (4: quitar el fallback `/30` de `LoanDetailsView:1263`), sumar
período (6), reparto de pagos (9), cuota (6).

### P2.2 · Alinear el Punto de Venta con `LoanForm`
Debe crear préstamos con las mismas reglas, o dejar de crearlos y delegar.

### P2.3 · Limpiar las migraciones
No borrar histórico. Crear una migración correctiva que elimine las políticas huérfanas y las
que apuntan a objetos inexistentes (`collection_tracking`, `clients` de
`20250130000001`, `late_fee_history`). Documentar por qué `loans` y `payments` no tienen DELETE.

### P2.4 · Extraer una capa de servicios
Empezando por préstamos, cuotas y pagos. Objetivo modesto: que cada consulta a Supabase esté
escrita **una vez** y con el alcance por empresa aplicado siempre.

### P2.5 · Partir los componentes gigantes
`LoanUpdateForm` (6.758) primero: sacar cada tipo de actualización a su propio archivo. Es la
condición para que P2.1 sea viable.

### P2.6 · Arreglar `no-case-declarations`
76 casos. En un `switch` financiero, una variable que se filtra entre `case` es un bug esperando.

### P2.7 · Definir en la interfaz qué significa cada cifra
Sobre todo «días de atraso», que hoy significa dos cosas distintas.

---

## P3 — Mejoras

- División de código: el bundle de 4 MB se descarga entero para ver la portada.
- `react-hooks/exhaustive-deps`: 124 avisos; algunos esconden estado obsoleto.
- Pantalla de auditoría por préstamo (quién hizo qué).
- Pruebas de componentes con jsdom.
- Pruebas SQL en un proyecto Supabase de pruebas (empezando por
  `legal_workflow_test.sql`, que nunca se ha ejecutado).
- Medir rendimiento antes de optimizar nada.
- Actualizar `PAGO_AVANZADO_Y_EXTENSION.md`, desactualizado respecto a la regla vigente.

---

## Secuencia sugerida

```
Paso 0  Verificar la base real
   ↓
P0      Seguridad  ──────────────────► desplegable de inmediato
   ↓
P1.2    Pruebas de los motores financieros
   ↓
P1.3    Tasa sin factor de frecuencia   (con las pruebas ya puestas)
   ↓
P1.5    Regenerar tipos  +  P1.6 CI
   ↓
P1.4    Unificar el saldo
   ↓
P2      Mantenibilidad
```

**No empezar por refactorizar.** Un refactor sin pruebas sobre lógica financiera duplicada es
la forma más rápida de romper cálculos en silencio. El orden importa: primero se cierra el
acceso indebido, después se protege con pruebas, y solo entonces se unifica.
