# Reglas financieras — Cloud Loans

> Cada concepto financiero debe tener **una sola definición**. Este documento fija esa
> definición y señala dónde el código todavía la contradice.
> Auditado el **2026-09-01**.

---

## 1. Convenciones base

| Regla | Valor |
|---|---|
| `loans.interest_rate` | Tasa **MENSUAL** en porcentaje. Siempre. |
| Tasa de un período | mensual × factor, **lineal, sin componer** |
| Factores | diario 1/30 · semanal ¼ · quincenal ½ · mensual 1 · trimestral 3 · anual 12 |
| `loans.term_months` | **PERÍODOS** de la frecuencia elegida, no meses |
| Primera cuota | vence **un período después** de `start_date` |
| Cierre de mes | se **recorta** al último día (31-ene + 1 mes = 28-feb). Nunca desborda |
| `loans.total_amount` | capital + interés. **Sin cargos** |
| Zona horaria | America/Santo_Domingo, vía `utils/dateUtils.ts` |

**Fuente única:** `src/utils/frequencyUtils.ts` y, en SQL, `loan_frequency_rate_factor` /
`loan_add_periods` / `loan_count_elapsed_periods` (migración `20260828000000`).

> La tasa se **muestra** también en su equivalente anual (× 12) en la tabla de amortización,
> porque es la única cifra comparable entre frecuencias. **No se guarda así.**

---

## 2. Definiciones

### CARGO
Fila de `installments` con `interest_amount ≈ 0` **y** `principal_amount = total_amount`.
No existe columna que lo distinga: es la única señal.

> **Limitación conocida:** en un préstamo al **0 %** toda cuota cumple esa condición. Donde
> importa (`loanRescheduling`) la heurística se desactiva si la tasa de período es 0.

### SALDO PENDIENTE (`remaining_balance`)
Plazo fijo: `total_amount + Σ cargos − Σ pagos (no anulados)`
Indefinido: `amount + interés pendiente por períodos + cargos − Σ capital pagado`

**Fuente única SQL:** `calculate_loan_remaining_balance` (`20260903000000`).
**Espejo en frontend:** `utils/loanBalanceBreakdown.ts`.

### CAPITAL PENDIENTE
`amount − Σ capital efectivamente pagado − abonos directos a capital`

El capital pagado por cuota se deriva del pago aplicado a esa `due_date`, **imputando primero
el interés**. Fuente: `loanBalanceBreakdown.ts`.

### INTERÉS PENDIENTE
- **Plazo fijo:** `Σ max(0, interest_amount − interés pagado de esa cuota)`.
- **Indefinido:** se recorre la rejilla de períodos desde la primera cuota hasta el período
  **en curso incluido** — en un indefinido siempre hay al menos un período devengándose, así que
  nunca es 0 aunque el cliente esté al día.

### MORA
- Se calcula **por cuota**, no sobre el saldo total.
- `díasAtraso = floor(hoy − due_date) − grace_period_days`, mínimo 0.
- `daily`: `base × rate/100 × días`
- `monthly`: `base × rate/100 × ceil(días / díasDelPeríodo)` — **`díasDelPeríodo` depende de la
  frecuencia** (`getLateFeePeriodDays`), no es 30 fijo.
- `compound`: `base × ((1 + rate/100)^días − 1)`
- Tope: `max_late_fee`. Se descuenta `late_fee_paid`.
- Si `late_fee_enabled` es falso, **no hay mora**.

**Fuente única:** `utils/installmentLateFeeCalculator.ts` y
`recalculate_late_fee_from_scratch` (`20260828000000`).

### DÍAS DE ATRASO — ⚠️ dos definiciones legítimas
| Definición | Dónde | Para qué |
|---|---|---|
| Desde la **cuota impaga más antigua** | mora, ruta de cobro | cuánto lleva sin pagar |
| Desde `next_payment_date` | cartera, legal, CRM | qué tan atrasado está el préstamo |

Un préstamo con 5 cuotas vencidas reporta cifras distintas en cada sitio. **No es un bug, pero
no está documentado en la interfaz** y confunde. Decidir cuál se muestra dónde.

### EXTENSIÓN DE PLAZO
Regla de negocio de la empresa (decidida 2026-09-01):
- Se re-amortiza el **capital pendiente** sobre (cuotas pendientes + nuevas).
- Las cuotas **ya pagadas** no se tocan.
- Los abonos a cuotas **sin terminar de pagar se ELIMINAN**: el cliente vuelve a deber ese
  dinero. Queda constancia en el historial del préstamo.
- Los abonos **directos a capital** sí se restan del capital.

**Fuente única:** `utils/loanRescheduling.ts`.

### GASTOS DE CIERRE
- **No financiados** (por defecto): cuota-cargo al final. No devengan interés.
- **Financiados** (`closing_costs_financed`): se suman al capital, devengan interés y se
  reparten entre todas las cuotas. **No se crea el cargo**, o se cobrarían dos veces.

---

## 3. ⚠️ Dónde el código contradice estas reglas

Auditoría de duplicación, 2026-09-01. **Estas son divergencias reales, no estilísticas.**

### 3.1 Tasa sin ajustar a la frecuencia — CRÍTICO
El sistema entero asume tasa mensual × factor. Estos sitios usan `amount × rate/100` **sin el
factor**, así que en un préstamo quincenal calculan el **doble** y en uno diario **treinta veces**:

`LoansModule.tsx:194, 215, 467, 1449` · `LoanDetailsView.tsx:1181, 1303` ·
`AccountStatement.tsx:367, 743, 1247, 1430` · `PaymentForm.tsx:1719` ·
`LoanUpdateForm.tsx:821, 997, 1596, 4325` · `QuickCollectionModule.tsx:331` ·
`PointOfSaleModule.tsx:981, 997, 3048`

Y `UtilitiesModule.tsx:485` divide entre 12: **único sitio que trata la tasa como anual**.

### 3.2 Siete implementaciones del saldo pendiente
`loanBalanceBreakdown.ts` (canónica) · `LoansModule:129` · `LoanDetailsView:1082` ·
`AccountStatement:740` · `InstallmentsTable:1501` · `LoanUpdateForm:431` ·
`QuickCollectionModule:590`

La peor: `QuickCollectionModule:590` hace `remaining_balance − monto`, una resta cruda sin
desglose ni cargos. Un cobro por esa pantalla deja el balance distinto al del trigger SQL.

Y dos pantallas (`AccountStatement:833`, `InstallmentsTable:1617`) aplican la regla *"si difiere
menos de RD$5 usa el valor de la base"* — que las demás no aplican. **Tres cifras posibles para
el mismo préstamo.**

### 3.3 Cinco implementaciones del interés pendiente
La divergencia más grave: `PaymentForm.tsx:1727` y `LoanUpdateForm.tsx:487` cuentan **meses de
calendario** en un préstamo que puede ser diario o quincenal. Subestiman masivamente.

Y `LoansModule:1489` devuelve el interés de **una sola** cuota donde
`loanBalanceBreakdown:223` devuelve la suma de todas las vencidas.

### 3.4 Mora: un fallback con `/30` fijo
`LoanDetailsView.tsx:1263` recalcula la mora por su cuenta cuando `current_late_fee === 0`,
usando `ceil(días/30)` **fijo**. En un préstamo diario o semanal da una mora 30× o 4× menor que
el motor real.

### 3.5 Seis copias de "sumar un período a una fecha"
`frequencyUtils.addPeriodsToDate` es la canónica. Copias locales en
`LoansModule:429` y `:1415`, `AccountStatement:759` y `:1269`.

Las dos peores: `QuickCollectionModule:594` y `PointOfSaleModule:1006` avanzan **siempre un mes**
ignorando la frecuencia, y formatean con `toISOString()` (UTC), lo que desplaza un día.

### 3.6 Nueve implementaciones de "cuánto se pagó a esta cuota"
`installmentDues.computeInstallmentDues` es la canónica (pago avanzado, ruta de cobro,
reprogramación). Conviven repartos propios en `installmentLateFeeCalculator` (tres),
`loanBalanceBreakdown` (dos), `nextPaymentDateFromInstallments` (con tolerancias `×0.99`/`×1.01`
que nadie más usa) y copias manuales en `LoanDetailsView`, `LoansModule`, `InstallmentsTable`,
`LoanUpdateForm`, `AccountStatement`.

`QuickCollectionModule:326` **ignora `due_date` por completo**.

### 3.7 El Punto de Venta crea préstamos con otras reglas
`PointOfSaleModule.tsx:979-1007` crea préstamos con tasa sin ajustar a la frecuencia y
`next_payment_date` siempre a **+1 mes**. Un préstamo creado desde el POS tiene cuota y
calendario distintos a uno creado en `LoanForm`.

---

## 4. Casos de prueba de referencia

Verificados y en el repositorio (`src/utils/__tests__/`).

### Préstamo simple quincenal
```
Capital 10.000 · 15 % mensual · quincenal · 6 cuotas · simple
Interés de período = 15 % × ½ = 7,5 %  →  750 por cuota
Capital por cuota  = 1.666,67
Cuota              = 2.416,67
Total              = 14.500
```

### El mismo, extendido 2 cuotas
```
8 cuotas · capital 1.250 · interés 750 · cuota 2.000 · total 16.000
El capital sigue sumando EXACTAMENTE 10.000
```
> Antes daba cuota 2.750 (ignoraba la frecuencia) y repartía 14.000 de capital en un préstamo
> de 10.000.

### Gastos de cierre
```
Capital 10.000 · 20 % mensual · mensual · 6 cuotas · cierre 2.000

Sin cierre:        interés 12.000 · capital 10.000 · total 22.000
Cierre aparte:     interés 12.000 · capital 10.000 · total 24.000
Cierre financiado: interés 14.400 · capital 12.000 · total 26.400
```

### Reparto de un pago
```
3 cuotas de 2.000 · el cliente trae 5.000
→ cuota 1 saldada, cuota 2 saldada, cuota 3 abono parcial de 1.000
Capital e interés se reparten en la proporción de la cuota
```

### Fechas
```
31-ene + 1 mes  = 28-feb   (recorta, no desborda a marzo)
28-feb + 1 mes  = 28-mar
Quincenal       = +14 días exactos (nunca 15)
```

---

## 5. Reglas pendientes de definir

1. **Sobrepago.** Hoy no se arrastra a la cuota siguiente. Está documentado pero no decidido.
2. **Días de atraso.** Dos definiciones legítimas conviviendo sin criterio de cuál se muestra.
3. **Interés en 'simple' tras un abono a capital.** ¿Sobre el monto original o sobre el
   pendiente? Hoy: sobre el original.
4. **Préstamos al 0 %.** La detección de cargos es ciega. Falta decidir el comportamiento.
