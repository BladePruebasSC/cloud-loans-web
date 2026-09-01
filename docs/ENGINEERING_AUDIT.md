# Auditoría de ingeniería — Cloud Loans

**Fecha:** 2026-09-01 · **Alcance:** `src/`, `supabase/migrations` (120), `supabase/functions` (5), documentación existente
**Método:** lectura del código y de las migraciones + ejecución de build, lint, comprobación de tipos y pruebas.

---

## ⚠️ Léase primero

Esta auditoría encontró **una cadena de toma de control de cuentas entre empresas** y **tres
tablas con datos financieros sin ninguna protección a nivel de base de datos**. Si el sistema
está en producción con más de una empresa, esto es urgente. Detalle en §5.

**Limitación importante:** las migraciones **no describen el esquema real**. Hay tablas que el
código usa (`documents`, `notifications`) que **no se crean en ninguna migración**, dos archivos
de migración vacíos, y timestamps incoherentes con las dependencias. Parte del esquema y de las
políticas se aplicó a mano por el panel de Supabase. **No he podido verificar el estado real de
la base de datos desde el repositorio**; todo lo que sigue describe lo que el repositorio
declara. Confirmar cada hallazgo contra la base real es el primer paso obligatorio.

---

## 1. Estado medido

| Métrica | Valor |
|---|---|
| Archivos TS/TSX | 130 |
| Líneas | 97.461 |
| Migraciones SQL | 120 |
| Edge Functions | 5 |
| **Pruebas antes de la auditoría** | **0** |
| Pruebas después | 103 casos (~690 aserciones) |
| Cobertura `src/utils` + `src/data` | 40,46 % |
| Cobertura de componentes, hooks, SQL, RLS | **0 %** |
| `npm run build` | ✅ correcto |
| `npm run typecheck` | ✅ 0 errores |
| `npm run lint` | ❌ **1.178 errores, 138 avisos** |

### Lint por regla

| Nº | Regla |
|---|---|
| 1.075 | `@typescript-eslint/no-explicit-any` |
| 124 | `react-hooks/exhaustive-deps` |
| 76 | `no-case-declarations` |
| 16 | `prefer-const` |
| 12 | `react-refresh/only-export-components` |

`no-case-declarations` no es cosmético: son declaraciones dentro de un `switch` sin bloque, que
se filtran entre `case`. En `LoanUpdateForm.tsx` —un `switch` gigante sobre el tipo de
actualización— es una fuente real de errores.

---

## 2. Fortalezas

No todo está mal, y conviene no romper lo que funciona:

1. **Existe una capa de lógica pura correcta.** `frequencyUtils`, `loanBalanceBreakdown`,
   `installmentLateFeeCalculator`, `installmentDues`, `loanRescheduling`, `portfolioMetrics`
   están bien escritas, comentadas y documentan sus decisiones.
2. **Las convenciones de negocio están fijadas y son coherentes** (tasa mensual, plazo en
   períodos, recorte de fin de mes). La auditoría de cálculos de 2026-08-28 hizo un trabajo
   real.
3. **El módulo legal es el mejor diseño del proyecto**: RLS de solo lectura, toda escritura por
   funciones `SECURITY DEFINER` que validan la empresa, dos funciones internas con `REVOKE`
   explícito, y auditoría inmutable.
4. **Los buckets `legal-evidence` y `jce-photos` están bien**: privados, con alcance por empresa
   o servidos por URL firmada desde la Edge Function.
5. **La Edge Function `jce-lookup`** guarda la API key en el servidor, revalida consentimiento y
   dígito verificador, nunca persiste la cédula en claro y audita cada consulta.
6. **`reset_company_data`** valida `auth.uid() = p_owner_id`. Es el patrón que deberían seguir
   las demás.

---

## 3. Problemas CRÍTICOS

### C1 · Cadena de toma de control entre empresas (Edge Functions)
**Severidad: CRITICAL · Área: Seguridad / Multi-empresa**

Tres funciones encadenadas permiten que un usuario autenticado tome el control de la cuenta del
dueño de otra empresa:

1. `supabase/functions/confirm-employee-email/index.ts` — **no verifica autenticación en
   absoluto** (no lee la cabecera `Authorization`). Confirma la cuenta de cualquier empleado de
   cualquier empresa usando `service_role`.
2. `supabase/functions/create-employee/index.ts:82-166` — si el correo indicado ya pertenece a
   un usuario existente (por ejemplo, **el dueño de otra empresa**), lo **reutiliza**:
   sobrescribe su `user_metadata.company_owner_id` con el del atacante e inserta una fila en
   `employees` con `auth_user_id` de la víctima. No comprueba que quien llama sea dueño.
   → `get_user_company_id()` de la víctima pasa a devolver el UUID del atacante.
3. `supabase/functions/change-employee-password/index.ts:71-105` — valida
   `company_owner_id = user.id`, que tras el paso 2 **ya se cumple**. Ejecuta
   `updateUserById(..., { password })` sobre la cuenta de la víctima.

**Impacto:** control total de otra empresa. Las tres usan además `Access-Control-Allow-Origin: *`.

### C2 · `employees` permite escalada de privilegios y salto de empresa
**Severidad: CRITICAL · `20250717121412_flat_shrine.sql:49-54`**

```sql
CREATE POLICY "Employees can update their basic info" ON public.employees
  FOR UPDATE TO authenticated
  USING (auth.uid() = auth_user_id) WITH CHECK (auth.uid() = auth_user_id);
```

El `WITH CHECK` solo fija `auth_user_id`. Un empleado puede modificar en su propia fila:
`role` (`'admin'` da todo), `permissions`, `status` (reactivarse tras ser dado de baja) y
**`company_owner_id`** — con lo que pasa a leer y escribir los datos de otra empresa.

### C3 · `installments`, `documents` y `notifications` sin RLS
**Severidad: CRITICAL**

- `installments` — `20250106_create_installments_table.sql` crea la tabla y **no activa RLS ni
  define ninguna política**. Ninguna de las otras 120 migraciones lo hace después. Se consulta
  desde el navegador en 25 archivos. ⇒ el cuadro de amortización de **todas** las empresas
  quedaría legible y escribible por cualquier autenticado.
- `documents` y `notifications` — **no se crean en ninguna migración**. Contienen `file_url` de
  cédulas y contratos, y datos personales.

### C4 · El bucket `documents` es PÚBLICO y guarda cédulas y contratos
**Severidad: CRITICAL · `20250131000004_fix_storage_policies_for_client_files.sql:14-16, 28-30`**

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('documents','documents', true)
  ON CONFLICT (id) DO UPDATE SET public = true;
CREATE POLICY "Public read access to documents" ON storage.objects
  FOR SELECT USING (bucket_id = 'documents');
```

Sin `TO authenticated` ⇒ aplica a `anon`. Con el bucket marcado público, la lectura es directa
por URL, sin token: basta conocer o adivinar la ruta `user-{uuid}/…`. Ahí viven
`client-photos/` y `client-attachments/`.

Efecto secundario: la escritura se acota por `auth.uid()`, no por empresa, así que **un empleado
no puede subir documentos a la carpeta de su empresa**.

### C5 · `registration_codes` abierta a `anon`
**Severidad: CRITICAL · `20250819125500_fix_registration_codes_policies.sql:13-20`**

```sql
CREATE POLICY "Allow all operations" ON public.registration_codes
  FOR ALL USING (true) WITH CHECK (true);
```

Sin cláusula `TO` ⇒ `public`, que incluye `anon`. Con la clave anónima se listan, crean, usan y
borran todos los códigos de registro. Es el estado final del repositorio.

---

## 4. Problemas ALTOS

| # | Problema | Ubicación |
|---|---|---|
| A1 | `update_all_late_fees()` / `update_all_late_fees_from_scratch()` recorren **todos los préstamos de todas las empresas** sin filtro, son `SECURITY DEFINER` y están expuestas como RPC | `20260825000000:143-210` |
| A2 | `legal_get_settings(p_company)` no valida el parámetro contra `get_user_company_id()` y se llama desde el navegador ⇒ IDOR: cualquiera lee la configuración de cualquier empresa | `20260829000001:58-81` + `useLegalCases.tsx:129` |
| A3 | `system_settings` con `FOR ALL USING (auth.role()='authenticated')` ⇒ cualquiera modifica la configuración global de mora | `20250130000000_create_system_settings.sql:24` |
| A4 | `company_settings` legible por `anon` **con todas las columnas** (nombre, dirección, teléfono, código de empresa, tasas, logo, config de WhatsApp y legal) | `20250823150000_fix_company_settings_rls.sql:42-46` |
| A5 | **Dos definiciones en conflicto de `get_user_company_id()`**; una ignora `status`, con lo que un empleado suspendido conservaría acceso | `flat_tree:31-62` vs `20250205000001:166-176` |
| A6 | `legal_has_permission` es **fail-open**: sin fila en `employees` devuelve `true` | `20260829000001:17-33` |
| A7 | Tasa sin ajustar a la frecuencia en 18 sitios ⇒ el doble en quincenal, 30× en diario | ver `FINANCIAL_RULES.md` §3.1 |
| A8 | El Punto de Venta crea préstamos con otra aritmética y `next_payment_date` siempre a +1 mes | `PointOfSaleModule.tsx:979-1007` |
| A9 | `QuickCollectionModule` calcula el saldo como `remaining_balance − monto` y avanza la fecha un mes fijo en UTC | `QuickCollectionModule.tsx:590, 594` |
| A10 | Los motores financieros más consumidos (mora, saldo) tienen **0 % de cobertura** | ver `TESTING_STRATEGY.md` §5 |

---

## 5. Riesgos financieros

Detalle completo en `FINANCIAL_RULES.md` §3. Resumen:

| Concepto | Implementaciones | Divergencia real |
|---|---|---|
| Saldo pendiente | **7** | `QuickCollectionModule` resta en crudo; dos pantallas usan «si difiere < RD$5 usa la BD» |
| Interés pendiente | **5** | Dos cuentan **meses de calendario** en préstamos diarios/quincenales |
| Capital pendiente | **8** | Tres respuestas distintas para un mismo préstamo indefinido |
| Mora | **4** | Un fallback usa `/30` fijo en vez del período de la frecuencia |
| Cuota | **6** | El POS ignora el factor de frecuencia; `UtilitiesModule` divide entre 12 |
| Sumar un período | **6** | Dos avanzan siempre un mes y desplazan un día por UTC |
| Pago aplicado a cada cuota | **9** | Una ignora `due_date` por completo |

**No es deuda técnica: son cifras distintas para el mismo préstamo según la pantalla.**

---

## 6. Riesgos de base de datos

1. **Las migraciones no son replicables.** Timestamps incoherentes con las dependencias
   (`20250128000000` referencia columnas creadas en `20250130000001`). Dos archivos vacíos
   (`20250126000001_add_loan_history_rls.sql`, `20250120000000_add_company_code.sql`).
   Levantar el proyecto desde cero **no reproduce** la base actual.
2. **Políticas que apuntan a objetos inexistentes.** `collection_tracking` usa una tabla
   `companies` que no existe, `employees.user_id` que tampoco, y un `UNION` dentro de un `=`
   escalar ⇒ error en ejecución.
3. **Política huérfana sobre `clients`** (`20250130000001_fix_late_fee_reports.sql:27-34`) que
   usa `company_id` en vez de `user_id` y `auth.users.user_metadata` (columna inexistente). Las
   políticas permissive se combinan con **OR**, así que *amplía* el alcance.
4. **Políticas viejas nunca borradas** que quedan OR-eadas con las nuevas (`sales`,
   `pawn_items`).
5. **`loans` y `payments` sin política de DELETE.** Parece intencional (el sistema usa
   `deleted_at`) pero no está documentado.
6. Solo **dos funciones** en todo el proyecto tienen `REVOKE EXECUTE`.

---

## 7. Deuda técnica

1. **Componentes gigantes.** `LoanUpdateForm.tsx` 6.758 líneas, `PawnShopModule` 5.303,
   `LoansModule` 4.718. Es la causa directa de la duplicación: nadie encuentra la utilidad
   correcta dentro de esos archivos.
2. **No hay capa de servicios.** Cada componente habla con Supabase por su cuenta; las mismas
   consultas están repetidas en decenas de sitios.
3. **1.075 `any`.** Anulan TypeScript justo donde más falta hace: los tipos generados de
   Supabase están desactualizados y el código los esquiva con `any` en vez de regenerarlos.
4. **`src/integrations/supabase/types.ts` está obsoleto.** No incluye columnas añadidas después
   (`province`, `municipality`, `sector`, `first_name`, `document_type`, `latitude`…). Por eso
   proliferan los `any`.
5. **Cuatro nombres para «empresa»**: `user_id`, `loan_officer_id`, `company_id`,
   `company_owner_id`. Ya provocó un fallo real (ingresos subestimados por filtrar por
   `created_by`).
6. **No hay integración continua.** Nada impide subir código que no compila o que rompe pruebas.

---

## 8. Problemas de UX

1. **El mismo dato con cifras distintas según la pantalla** (§5). Es un problema de UX antes que
   técnico: destruye la confianza del usuario en el sistema.
2. **Conceptos sin definir en la interfaz.** «Días de atraso» significa dos cosas distintas
   según dónde se mire, sin ninguna indicación.
3. **Operaciones destructivas sin fricción proporcional.** La extensión de plazo **elimina
   pagos** del historial; hoy avisa, pero conviene una confirmación explícita.
4. **Sin auditoría visible.** No hay pantalla donde ver quién hizo qué en un préstamo.

---

## 9. Rendimiento

No he medido; solo señalo lo evidente por lectura. **No optimizar sin medir antes.**

1. `dist/assets/index.js` pesa **4 MB** (1 MB comprimido). No hay división de código: la
   aplicación entera se descarga para ver la pantalla de inicio.
2. Consultas en bucle sobre cuotas y pagos en varios componentes (patrón N+1).
3. Recálculos financieros en cada render por falta de memoización en los componentes grandes.
4. `useAuth` tiene varios `setTimeout` de 3-5 segundos como red de seguridad contra cargas
   infinitas, lo que sugiere un problema de carga no resuelto debajo.

---

## 10. Documentación existente frente al código

| Documento | Estado |
|---|---|
| `AUDITORIA_CALCULOS_2026-08-28.md` | Coherente. Las correcciones que describe están en el código |
| `LEGAL_COBRANZA_PLAN.md` | Coherente. El módulo legal es como se describe |
| `INICIO_Y_DASHBOARD.md` | Coherente |
| `PAGO_AVANZADO_Y_EXTENSION.md` | **Desactualizado**: describe que el abono se acredita a la cuota. La regla cambió el 2026-09-01 y ahora el abono **se elimina** |
| `ALTA_DE_CLIENTES.md` | Coherente |
| `JCE_GPS_Y_RUTA_DE_COBRO.md` | Coherente |

Ninguno documentaba los riesgos de seguridad, porque ninguno los había buscado.

---

## 11. Contradicción entre documentación y realidad

`AUDITORIA_CALCULOS_2026-08-28.md` y los documentos posteriores afirman «tsc 0 errores» como
prueba de calidad. **Esa comprobación era vacía**: el `tsconfig.json` raíz compila cero
archivos. Verificado con `--listFiles`. Corregido en esta auditoría con `npm run typecheck`.

---

## 12. Recomendaciones inmediatas

1. **Verificar contra la base de datos real** cuáles de los hallazgos de §3 y §4 están vivos.
   Las migraciones no son fiables como espejo del esquema.
2. **Cerrar C1 a C5 antes que cualquier otra cosa.** Son acceso indebido a datos de terceros.
3. **Regenerar `types.ts`** desde el esquema real. Es el paso que desbloquea eliminar `any`.
4. **Cubrir con pruebas el motor de mora y el desglose de saldo** antes de tocarlos.
5. **Unificar por concepto, empezando por el saldo**, con pruebas de equivalencia entre las
   implementaciones actuales.

El plan ordenado está en `ENGINEERING_ROADMAP.md`.

---

## 13. Qué NO se hizo en esta auditoría

Por honestidad sobre el alcance:

- **No se modificó código de producción.** Solo se añadió infraestructura de pruebas y estos
  documentos.
- **No se verificó la base de datos real.** No hay acceso desde este entorno.
- **No se ejecutaron las pruebas SQL.** No hay proyecto Supabase de pruebas.
- **No se midió el rendimiento.** Lo de §9 es lectura, no medición.
- **No se auditó a fondo** `PawnShopModule` (5.303 líneas), `InventoryModule` ni el POS más
  allá de su interacción con préstamos.
- **Los hallazgos de seguridad no se han explotado** para confirmarlos: se derivan de leer las
  políticas y el código de las funciones.
