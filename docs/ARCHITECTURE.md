# Arquitectura — Cloud Loans

> Estado: auditado el **2026-09-01**. Describe el sistema **tal como es**, no como debería ser.
> Donde la realidad se aparta de lo deseable, se dice.

---

## 1. Stack y forma del sistema

| Capa | Tecnología |
|---|---|
| Cliente | React 18 + TypeScript + Vite 5, React Router 6, shadcn/ui (Radix), Tailwind, Recharts, react-hook-form + zod, jsPDF |
| Backend | **Supabase**: PostgreSQL + RLS, funciones `plpgsql SECURITY DEFINER`, triggers, Realtime, Storage, 5 Edge Functions (Deno) |
| Auth | Supabase Auth. `useAuth` resuelve `companyId` |
| Pruebas | vitest 2.1.9 (añadido en la auditoría) |

**No existe un servidor de aplicación.** Es la decisión arquitectónica más importante del
proyecto y condiciona todo lo demás:

- «Validar en el backend» significa **RLS + funciones SQL + Edge Functions**. No hay otro sitio.
- Cualquier lógica que viva solo en un componente de React es, por definición, **no confiable**:
  el navegador puede saltársela llamando a PostgREST directamente.
- Un secreto solo está a salvo dentro de una Edge Function.

```
Navegador (React)
   │
   ├── PostgREST  ──►  PostgreSQL + RLS        ← la puerta que de verdad protege los datos
   ├── Storage    ──►  buckets con policies
   └── Edge Functions (Deno)                    ← única capa con secretos de servidor
```

---

## 2. Enrutado

Peculiar y conviene conocerlo antes de tocar nada:

```
App.tsx           registra CADA ruta apuntando al MISMO componente
   └── pages/Index.tsx
         switch (location.pathname)  →  módulo + comprobación de permiso
```

Las rutas con parámetro se resuelven con regex sobre `pathname`. Añadir una pantalla implica
tocar **tres** archivos: `App.tsx`, `pages/Index.tsx` y `Sidebar.tsx`.

---

## 3. Organización real del código

```
src/
  components/<modulo>/    un componente GRANDE por módulo, con su propio fetch a Supabase
  hooks/                  estado compartido y algo de acceso a datos
  utils/                  lógica pura (aquí vive la aritmética financiera correcta)
  data/                   catálogos (división territorial dominicana)
  integrations/supabase/  cliente y tipos generados
  pages/                  Index (despachador) y poco más
supabase/
  migrations/             120 archivos
  functions/              5 Edge Functions
  tests/                  1 archivo SQL, nunca ejecutado
```

**No hay capa de servicios.** `src/services/` contiene un único archivo mínimo. Cada componente
habla con Supabase por su cuenta.

### Tamaño de los componentes

130 archivos TS/TSX, **97.461 líneas**. Los mayores:

| Líneas | Archivo |
|---|---|
| 6.758 | `components/loans/LoanUpdateForm.tsx` |
| 5.303 | `components/pawnshop/PawnShopModule.tsx` |
| 4.718 | `components/loans/LoansModule.tsx` |
| 4.126 | `components/inventory/InventoryModule.tsx` |
| 3.805 | `components/loans/LoanForm.tsx` |
| 3.803 | `components/loans/PaymentForm.tsx` |
| 3.424 | `components/loans/AccountStatement.tsx` |

Un archivo de 6.758 líneas no es un problema estético: es la causa directa de que la misma
regla financiera esté escrita seis veces en el proyecto (ver `FINANCIAL_RULES.md`).

---

## 4. Multi-empresa

El aislamiento se hace por columna de propiedad, no por esquema:

| Tabla | Columna de empresa |
|---|---|
| `clients` | `user_id` |
| `loans` | `loan_officer_id` |
| `payments` | `company_id` |
| `documents` | `user_id` |
| `sales`, `products` | `user_id` |

En SQL el helper es `get_user_company_id()`. Un empleado pertenece a una empresa vía
`employees.company_owner_id`; un dueño **es** la empresa (`companyId === auth.uid()`).

> **La inconsistencia de nombres es un riesgo real.** Cuatro nombres distintos para el mismo
> concepto hacen fácil escribir `.eq('created_by', companyId)` creyendo que se filtra por
> empresa. Eso ya ocurrió en el panel de inicio: `payments.created_by` es el **usuario** que
> registró el pago, no la empresa, y los ingresos salían subestimados en cualquier empresa con
> más de un usuario.

---

## 5. Permisos

`employees.permissions` es un JSONB con claves `modulo.accion` (`loans.view`, `pagos.crear`,
`crm.view`, `legal.view`…), catalogadas en `EmployeesModule.tsx` (`PERMISSIONS_CONFIG`).

Reglas efectivas:
- Dueño (`!profile.is_employee`) → todo.
- Empleado con `role === 'admin'` → todo.
- Resto → `profile.permissions?.[clave] === true`.

**Esta comprobación vive en el navegador.** Sirve para ocultar botones; no protege datos. Lo
único que protege datos es RLS.

---

## 6. Dónde vive cada cosa (financiero)

Capa pura, sin acceso a datos, testeable:

| Utilidad | Responsabilidad |
|---|---|
| `utils/frequencyUtils.ts` | Aritmética de frecuencia y fechas. **Fuente única declarada** |
| `utils/dateUtils.ts` | Zona horaria de Santo Domingo |
| `utils/installmentLateFeeCalculator.ts` | Motor de mora por cuota |
| `utils/loanBalanceBreakdown.ts` | Desglose de saldo (capital / interés / cargos) |
| `utils/installmentDues.ts` | Cuánto se pagó a cada cuota; reparto de un pago |
| `utils/loanRescheduling.ts` | Reprogramación por extensión de plazo |
| `utils/portfolioMetrics.ts` | PAR, antigüedad, flujo de caja |
| `utils/collectionRoute.ts` | Paradas de la ruta de cobro |
| `utils/clientScoring.ts` | Score CRM |

Y en SQL, las funciones que la base de datos usa por su cuenta mediante triggers:
`calculate_loan_remaining_balance`, `calculate_loan_next_payment_date`,
`recalculate_late_fee_from_scratch`, más los helpers `loan_add_periods`,
`loan_frequency_rate_factor`, `loan_count_elapsed_periods`.

> **El problema no es que falte la capa correcta: es que los componentes no la usan.** Ver
> `ENGINEERING_AUDIT.md` §"Código duplicado".

---

## 7. Triggers

No hay ningún trigger sobre `loans`. El balance se recalcula desde:

- `payments` — AFTER INSERT / UPDATE / DELETE (por fila)
- `installments` — AFTER INSERT / UPDATE / DELETE (por fila)

Consecuencia práctica que ya provocó un fallo: si una operación escribe primero las cuotas y
después `loans.total_amount`, el balance queda calculado con el total **viejo** y nadie lo
recalcula. Toda operación que cambie `total_amount` debe escribir `remaining_balance`
explícitamente o reordenarse.

---

## 8. Edge Functions

| Función | Qué hace |
|---|---|
| `create-employee` | Alta de empleado con service role |
| `confirm-employee-email` / `confirm-employee-emails` | Confirmación de correo |
| `change-employee-password` | Cambio de contraseña |
| `jce-lookup` | Verificación de cédula contra la JCE. Guarda la API key y audita |

---

## 9. Convenciones de negocio vigentes

Establecidas en la auditoría de cálculos de 2026-08-28 y unificadas en `frequencyUtils.ts`:

1. `loans.interest_rate` es **siempre una tasa MENSUAL**. (Se muestra su equivalente anual en
   la tabla de amortización; no se guarda así.)
2. La tasa de un período se obtiene **linealmente**: mensual × factor
   (quincenal ½, semanal ¼, diario 1/30, trimestral 3, anual 12). **No se compone.**
3. `term_months` está en **PERÍODOS** de la frecuencia elegida, no en meses.
4. La primera cuota vence **un período después** de la fecha de inicio.
5. En frecuencias mensuales se **recorta** al último día del mes (31-ene + 1 mes = 28-feb),
   nunca se desborda a marzo.
6. Un **CARGO** se reconoce por `interest_amount ≈ 0` y `principal_amount = total_amount`.
   No existe columna que lo distinga.
7. `loans.total_amount` es **capital + interés**, sin cargos.

---

## 10. Arquitectura objetivo

No es una reescritura: es dejar de duplicar.

```
Componentes (UI)          ← solo presentación y estado de pantalla
      ↓
Hooks                     ← estado compartido, orquestación
      ↓
Services  (a crear)       ← todo el acceso a Supabase, tipado y con alcance por empresa
      ↓
utils/ (lógica pura)      ← YA EXISTE. Aritmética financiera. Testeable.
      ↓
Supabase / PostgreSQL     ← RLS + funciones SQL: la única frontera real de seguridad
```

El paso con más retorno es el más aburrido: **hacer que los componentes grandes llamen a las
utilidades que ya existen** en vez de reimplementarlas.
