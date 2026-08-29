# Auditoría de cálculos de préstamos — 28 de agosto de 2026

Revisión de la lógica de **amortización, frecuencias de pago, préstamos indefinidos, mora y
actualización de préstamos**. Se encontraron **39 defectos** y se corrigieron **todos**.

Todos los cambios están comentados en el código con el prefijo `CORRECCIÓN (auditoría 2026-08-28)`
explicando qué hacía antes, por qué estaba mal y qué consecuencia tenía.

**Estado:** `npm run build` correcto. Errores de TypeScript: **34 → 0**.
44 pruebas automatizadas, todas correctas.

> La auditoría se hizo en tres rondas. La primera cerró 26 defectos de cálculo y dejó 5 hallazgos
> pendientes de decisión, más 16 errores de tipos preexistentes. La **segunda ronda** cerró esos 21
> puntos y descubrió 2 defectos adicionales al hacerlo. La **tercera** corrigió el interés de la
> cuota en curso, reportado desde producción.

---

## La causa raíz: ocho definiciones distintas de "un período"

El problema de fondo no era un error aislado sino que **la misma pregunta se respondía distinto en
cada archivo**. Ejemplo real: *¿cuánto dura una quincena?*

| Archivo | Respuesta |
|---|---|
| `LoanForm.getNextBusinessDay()` (vista previa) | **15 días** |
| `LoanForm.generateOriginalInstallments()` (lo que se guarda) | **14 días** |
| `installmentLateFeeCalculator.ts` (mora) | 14 días |
| `loanBalanceBreakdown.ts` (saldo) | 14 días |
| `AmortizationTable.tsx` (simulador) | 14 días |
| Funciones SQL | siempre meses |

Y *¿qué pasa el 31 de enero + 1 mes?*

| Archivo | Respuesta |
|---|---|
| `loanBalanceBreakdown.addPeriod()` | **3 de marzo** (desborda) |
| `installmentLateFeeCalculator` | **28 de febrero** (recorta) |
| `LoanForm` (primera cuota) | **3 de marzo** |
| `PaymentForm` (avance de fecha) | **3 de marzo** |
| `AmortizationTable` | **30 días exactos**, ni siquiera meses |

Por eso las cifras no cuadraban entre pantallas: cada una calculaba sobre un calendario diferente.

### Solución: `src/utils/frequencyUtils.ts` (archivo nuevo)

Fuente única de verdad con los convenios del negocio explícitos:

- `loans.interest_rate` es **siempre una tasa mensual**.
- `loans.term_months` está en **períodos de la frecuencia**, no en meses.
- Tasa de período = mensual × factor (quincenal ½, semanal ¼, diario 1/30, trimestral 3, anual 12).
- La primera cuota vence **un período después** del inicio.
- En frecuencias mensuales se **recorta** al último día del mes (31-ene → 28-feb), nunca desborda.

Su equivalente en SQL (`loan_add_periods`, `loan_frequency_rate_factor`,
`loan_frequency_period_days`, `loan_count_elapsed_periods`) va en la migración nueva.

---

## Defectos críticos corregidos

### 1. Los tipos alemán y americano nunca se guardaban
`LoanForm.tsx` → `generateOriginalInstallments()`

La función solo contemplaba `french` e `indefinite`. **Alemán y americano caían en el `else` de
"interés simple"**. El cliente veía e imprimía una tabla correcta (cuota decreciente para alemán;
solo intereses con capital al final para americano) pero en `installments` se guardaban cuotas
planas de interés simple. **El cronograma real del préstamo no se parecía al contratado.**

En un americano (línea de crédito) el efecto era el contrario de lo pactado: se repartía capital en
todas las cuotas en vez de dejarlo íntegro al final.

→ Ambos tipos implementados igual que la vista previa.

### 2. La mora se cobraba en préstamos con la mora desactivada
`installmentLateFeeCalculator.ts`

`getLateFeeBreakdownFromInstallments` declaraba `late_fee_enabled` en su interfaz y **todas** las
pantallas se lo pasaban, pero **la función nunca lo leía**. Un préstamo con mora desactivada seguía
acumulando y mostrando mora en estado de cuenta, detalle, cobro, listado y estadísticas. Solo
`useLateFee.updateAllLateFees` se salvaba porque filtraba por SQL antes de llamar.

→ Se devuelve mora cero cuando `late_fee_enabled === false`.

### 3. Los morosos indefinidos aparecían al día
Migración SQL — `calculate_loan_next_payment_date`

```sql
IF v_next_payment_month <= CURRENT_DATE THEN
    v_next_payment_month := <sumar otro período>;   -- ← empujaba la fecha al futuro
```

Si el cliente estaba **atrasado**, en lugar de dejar la fecha vencida la movía hacia adelante. Y
como el motor de mora usa `next_payment_date` como corte de *"todo lo anterior está pagado"*, esto
**marcaba como pagadas cuotas realmente vencidas y ponía su mora en cero**.

→ Eliminado el empuje: la fecha se queda en el pasado cuando hay atraso.

### 4. Interés hasta 30× mayor al editar un préstamo
`LoanUpdateForm.tsx` → `edit_loan`

```js
const totalInterest = (finalAmount * data.edit_interest_rate * data.edit_term_months) / 100;
```

Trataba el plazo como si siempre fueran meses. Un préstamo **diario de 30 días al 10 % mensual**
quedaba con **300 %** de interés total (10 % × 30). Ese `total_amount` inflado se guarda y es la
base del `remaining_balance` que calcula el trigger: **el cliente terminaba debiendo varias veces lo
pactado**.

→ Se aplica el factor de frecuencia.

### 5. El estado de cuenta mostraba el interés multiplicado
`AccountStatement.tsx` → `calculateAmortizationSchedule`

Las ramas francés, alemán y americano usaban `interestRate / 100` — la tasa **mensual sin ajustar**.
En un préstamo quincenal el estado de cuenta mostraba **el doble** del interés real por cuota; en
uno semanal, **el cuádruple**; en uno diario, **30×**. No coincidía con la vista previa, ni con las
cuotas guardadas, ni con el recibo entregado al cliente.

### 6. "Cobro Rápido" calculaba la mora con datos inventados
`QuickCollectionModule.tsx`

```js
term: 4,                              // plazo fijo inventado
payment_frequency: 'monthly',         // ignora la frecuencia real
start_date: loan.next_payment_date,   // ¡fecha de próximo pago como fecha de inicio!
// y no enviaba amortization_type
```

La consulta a `loans` **ni siquiera traía** `term_months`, `payment_frequency`, `amortization_type`
ni `start_date`. La mora mostrada aquí —**la que se cobraba realmente al cliente**— no podía
coincidir con la del detalle del préstamo. El resultado además se escribía en
`loans.current_late_fee`, propagando el error a notificaciones y reportes.

→ Campos añadidos a la consulta, al tipo y a la llamada.

### 7. `next_payment_date` no avanzaba en indefinidos no mensuales
`PaymentForm.tsx`

```js
const interestPerPayment = (selectedLoan.amount * selectedLoan.interest_rate) / 100;
```

Tasa mensual completa sin ajustar. En un indefinido **quincenal** cada cuota vale la mitad de eso,
así que hacían falta **dos pagos** para que el contador reconociera **una** cuota: la fecha se
quedaba clavada, el préstamo aparecía en mora **estando al día**, y la mora seguía acumulándose
sobre una cuota ya cobrada. En semanal el factor era 4× y en diario 30×.

### 8. La extensión de plazo creaba cuotas ya vencidas
`LoanUpdateForm.tsx` → `term_extension`

Usaba `loan.first_payment_date` como si fuera la primera fecha de **vencimiento**. Pero
`LoanForm.onSubmit` guarda ahí la **fecha de inicio** (la misma que `start_date`); la primera fecha
de vencimiento va en `next_payment_date`. Cada cuota agregada quedaba **un período antes** de lo que
le tocaba, solapándose con las existentes y **apareciendo vencida, con mora, el mismo día de
crearse**.

### 9. Dos fórmulas de mora dentro del mismo préstamo
`installmentLateFeeCalculator.ts`

Para mora tipo `'monthly'`, la rama que procesa cuotas de la BD usaba el período real de la
frecuencia, pero la rama que **genera cuotas dinámicamente** (préstamos indefinidos) tenía `/30`
fijo. En un indefinido diario, 30 días de atraso se cobraban como **1 período en vez de 30**.

### 10. La primera cuota vencía el día del desembolso
`AmortizationTable.tsx`

```js
paymentDate.setDate(paymentDate.getDate() + (dateIncrement * (i - 1)));  // i=1 → +0 días
```

La cuota 1 vencía **el mismo día del desembolso**. Además `dateIncrement` era en días fijos
(mensual = 30, trimestral = 90, anual = 365), así que un préstamo mensual que inicia el 15 de enero
vencía el 14-feb, 16-mar, 15-abr… las fechas se desplazaban y no coincidían con las guardadas.

---

## Defectos importantes corregidos

| # | Archivo | Defecto |
|---|---|---|
| 11 | `LoanForm.tsx` | Quincena de **15 días** en la vista previa vs. 14 en todo lo demás: desfase de 1 día por cuota (cuota 12 = 12 días de diferencia) |
| 12 | `LoanForm.tsx` | `end_date` siempre en meses: un préstamo diario a 30 días vencía **a 30 meses** |
| 13 | `LoanForm.tsx` | Francés: la "primera cuota" usaba la tasa mensual sin factor de frecuencia (el bucle sí lo aplicaba) |
| 14 | `dateUtils.ts` | `toSantoDomingoTime`, `createDateInSantoDomingo` y `getCurrentDateString` usaban `new Date(date.toLocaleString(...))` — el anti-patrón que el propio archivo documentaba como roto. En equipos al este de Santo Domingo **restaba un día a todas las fechas de vencimiento** |
| 15 | `dateUtils.ts` | `formatDateStringForSantoDomingo` reinterpretaba una fecha ya local en otra zona: mostraba **el día anterior** en zonas positivas |
| 16 | `dateUtils.ts` | `formatDateTimeWithOffset` sumaba **"+2 horas" a mano** — un parche que solo cuadraba en el equipo donde se escribió |
| 17 | `installmentLateFeeCalculator.ts` | Comparación `principal_amount === 0` estricta: Postgres devuelve `numeric` como string o `null`, así que **nunca se cumplía** y la mora de las cuotas regulares de indefinidos salía en 0 |
| 18 | `installmentLateFeeCalculator.ts` | Emparejar pagos con cuotas vía `new Date(x).toISOString()`: en zonas positivas el día retrocedía y **los pagos dejaban de emparejar con su cuota**, generando mora ya cobrada |
| 19 | `installmentLateFeeCalculator.ts` | `next_payment_date.split('-')` sin quitar la hora: con un timestamp el día era `NaN` → `Invalid Date` → **mora silenciosamente 0** |
| 20 | `installmentLateFeeCalculator.ts` | La comparación para evitar duplicados no normalizaba la fecha → **cuota duplicada** que sumaba su mora dos veces |
| 21 | `useLoanPaymentStatusSimple.tsx` | `remaining === 0` con punto flotante: una cuota de 1.666,67 pagada exacta dejaba residuo ~1e-10 y quedaba **marcada como pago parcial para siempre** |
| 22 | `loanBalanceBreakdown.ts` | "Hoy" se tomaba del equipo (`new Date()`), no de Santo Domingo: de noche el saldo y la mora se referían a días distintos |
| 23 | `useLateFee.tsx` | `toISOString()` al guardar `last_late_fee_calculation`: después de las 20:00 registraba **la fecha del día siguiente** |
| 24 | `useLateFee.tsx` | El parámetro `calculationDate` se recibía pero **nunca se pasaba** al motor: pedir la mora a una fecha dada devolvía la de hoy |
| 25 | `PaymentForm.tsx` | El recálculo de mora tras cobrar no enviaba `amortization_type`: los indefinidos se recalculaban como plazo fijo |
| 26 | `LateFeeReports.tsx` | Mezclaba `new Date(iso)` (UTC) con `new Date()` (local) al medir el atraso, justo en el umbral que decide si se calcula mora o se reporta 0 |

### En la base de datos (migración nueva)

`supabase/migrations/20260828000000_fix_frequency_aware_sql_calculations.sql`

- **Períodos transcurridos** se calculaban con `AGE()` en **meses** para toda frecuencia: un
  préstamo diario con 45 días de vida reportaba **1 período en vez de 45**, y su interés pendiente
  salía 45 veces menor.
- **Interés por período** usaba siempre la tasa mensual: en indefinidos quincenales el sistema creía
  que cada cuota valía el doble, y `FLOOR(pagado / cuota)` contaba **la mitad** de las cuotas
  pagadas.
- **`days_overdue` devolvía el MÍNIMO** de días de las cuotas pendientes. La última cuota casi nunca
  ha vencido, así que el mínimo era 0 y `update_all_late_fees_from_scratch` **devolvía a `active`
  préstamos con meses de atraso**. El frontend usa el máximo; se unificó al máximo.
- **Mora "mensual"** prorrateada siempre a 30 días.
- **`DECIMAL(10,2)`** (tope 99.999.999,99) en los tipos de retorno: una cartera grande hacía fallar
  el trigger con *numeric field overflow*, **abortando el INSERT del pago**. Ampliado a
  `DECIMAL(14,2)`.
- **`SECURITY DEFINER` sin `SET search_path`** en todas las funciones — permite secuestrar la
  resolución de nombres desde un esquema del atacante. Corregido en todas.

---

---

## Segunda ronda: los 5 hallazgos pendientes + 16 errores de tipos

### 27. Pagos parciales mal asignados en préstamos a plazo fijo
`installmentLateFeeCalculator.ts`

La asignación secuencial entregaba **como máximo un pago por cuota**. Si un cliente abonaba dos
veces sobre la misma cuota (600 y luego 400 sobre una cuota de 1.000), el segundo abono se asignaba
a la cuota **siguiente**: la cuota 1 seguía figurando impaga **y acumulando mora pese a estar
saldada**, y la cuota 2 aparecía "parcialmente pagada" con dinero que nunca fue suyo. El error se
propagaba en cascada a todas las cuotas posteriores.

→ Reemplazado por reparto **en cascada**: se asignan pagos a la misma cuota hasta cubrir su monto
esperado, y solo entonces se pasa a la siguiente, teniendo en cuenta lo ya aportado por la
asignación previa por `due_date`. Cubierto con 8 pruebas, incluida la de no-regresión (un pago
completo por cuota se comporta igual que antes).

*Limitación conocida, sin cambios:* un **sobrepago** no se arrastra a la cuota siguiente (un pago
pertenece a una sola cuota). Es el comportamiento previo y coherente con el resto del sistema.

### 28. Divergencia de `remaining_balance` en indefinidos — **decisión tomada**
Migración SQL

La función sumaba el `interest_amount` de las filas no pagadas de `installments`. Pero un préstamo
indefinido solo tiene **una fila** de cuota regular: los períodos siguientes no existen como filas,
se generan dinámicamente. Aunque hubiera 5 períodos vencidos, **la BD reportaba el interés de uno
solo**. El respaldo por períodos ni siquiera llegaba a ejecutarse, porque solo entraba si la suma
daba exactamente 0.

**Decisión:** la fuente de verdad es el **cálculo por períodos**, que es el correcto
financieramente (se debe el interés de cada período vencido, exista o no la fila). Se replicó en SQL
la misma lógica de `loanBalanceBreakdown.ts` para que BD y pantalla coincidan siempre.

### 29. Pérdida de centavos al crear el préstamo
`LoanForm.tsx` — `monthly_payment`, `total_amount`, `remaining_balance`, `closing_costs`,
`max_late_fee` y `fixed_payment_amount` se guardaban con `Math.round()` (**pesos enteros**) mientras
las cuotas guardan decimales. Un préstamo pagado por completo podía quedar con un saldo residual de
unos pesos, **sin poder cerrarse**. Peor en `monthly_payment`: al redondear la cuota,
`principal = cuota − interés` heredaba el error en **todas** las cuotas. → Redondeo a 2 decimales.

### 30. Los gastos de cierre nunca se cobraban
`LoanForm.tsx` — se mostraban sumados a la última cuota de la tabla (y así se imprimían en el
contrato), pero **nunca se guardaban en `installments`**. El cliente nunca llegaba a deberlos: no
aparecían en el saldo, ni en las cuotas, ni generaban mora. **La empresa simplemente los perdía.**

→ Se persisten como **cuota-cargo** (`interest_amount = 0`, `principal_amount = total_amount`), que
es como el sistema ya representa los cargos en todas partes. Modelarlos como cargo —y no como
capital— evita descuadrar la conciliación de capital.

### 31. `total_amount` significaba cosas distintas según el tipo *(descubierto al corregir el #30)*
`LoanForm.tsx` — `simple` e `indefinite` calculaban `total_amount = capital + interés`, pero
`french`, `german` y `american` lo acumulaban **incluyendo los gastos de cierre**. El mismo campo
tenía dos significados según el tipo de amortización, y la función SQL hace
`total_amount + SUM(cargos)` — así que al persistir el cargo del #30 se habrían **contado dos
veces** en tres de los cinco tipos.

→ Convenio unificado: `total_amount` = capital + interés. Los cargos van aparte, siempre.

### 32. El simulador destruía la tasa del usuario
`AmortizationTable.tsx` — con "Fijar Cuota" activo, un `useEffect` **sobrescribía permanentemente**
la tasa escrita por el usuario con la derivada. Al desmarcar la casilla, la tasa original ya no
volvía: se había perdido. → Efecto eliminado; la tasa derivada ya se muestra en la etiqueta "Tasa
ajustada" y se usa directamente en el cálculo.

### 33. La tasa derivada de la cuota fija se dividía dos veces *(descubierto al corregir el #32)*
`AmortizationTable.tsx` — la derivación devolvía la tasa **del período**, pero el campo del
formulario es **mensual** y más abajo se vuelve a multiplicar por el factor de frecuencia. En un
préstamo quincenal la tasa se partía a la mitad dos veces, así que **la tabla no daba la cuota fija
que el usuario había pedido**.

### 34. El módulo de Días Feriados no renderizaba
`HolidaysModule.tsx` — usaba `<PasswordVerificationDialog>` al final del JSX pero **nunca lo
importaba**. En producción era un identificador inexistente: la pantalla lanzaba `ReferenceError` y
quedaba en blanco. El build de Vite no hace type-check, por eso nunca falló al compilar.

### 35 y 36. La base de mora salía 0 en indefinidos al distribuir un abono
`PaymentForm.tsx` y `QuickCollectionModule.tsx` — el `select` de `installments` no pedía
`interest_amount`, `total_amount` ni `amount`, pero el código los usa como base de mora en
indefinidos (donde `principal_amount` es 0). Venían `undefined` → base 0 → **el abono de mora se
repartía mal y `late_fee_paid` quedaba incorrecto**.

### 37 y 38. Dos `/30` fijos más en la distribución de mora
`PaymentForm.tsx` y `QuickCollectionModule.tsx` — al repartir el abono entre cuotas se prorrateaba
siempre a 30 días, distinto del motor de mora. Se usaba una mora distinta de la mostrada al cliente
y quedaba **saldo pendiente fantasma**.

### Errores de tipos restantes (34 → 0)

No eran solo ruido: además del #34 (crash real), faltaban campos en interfaces que el código ya
leía —`total_amount` en `Installment`, `payment_frequency` en el `Loan` de AccountStatement,
`phone` en el cliente de QuickCollection—, con lo que esos accesos quedaban sin verificación de
tipos. El resto eran literales `{ data: null, error: null }` en ternarios donde solo se
desestructura `data`.

---

## Tercera ronda: el interés de la cuota en curso

### 39. "Interés pend. hoy" y el panel de antigüedad no contaban la cuota en curso
`loanBalanceBreakdown.ts` + migración SQL

En préstamos indefinidos, el interés pendiente se cortaba en el **último período vencido** e
ignoraba la cuota **ya pendiente cuya fecha de vencimiento aún no llegaba**. Eso dejaba tres
pantallas del mismo préstamo contradiciéndose entre sí:

| Panel | Mostraba |
|---|---|
| Interés pend. hoy | RD$5.550 (15 × 370) |
| Balance de interés por antigüedad → "Al día (aún no vence)" | RD$0,00 |
| Ver cuotas → Total a Pagar | RD$20.920 (= 15.000 + **16** × 370) |

La tabla de cuotas sí listaba la cuota en curso (#16, 5 sept); los otros dos paneles no.

→ Ahora se suma el período en curso y se corta ahí (exactamente **un** período futuro: el que se
está devengando). Los períodos posteriores siguen sin contarse, porque aún no se han devengado.

Como el panel de antigüedad ya reconcilia su total contra "Interés pend. hoy" y coloca la
diferencia en el rango "Al día (aún no vence)", **un solo cambio corrige los dos lados**. También
se ajustó la función SQL `calculate_loan_remaining_balance` (`v_periods_elapsed + 1`) para que
`loans.remaining_balance` no vuelva a divergir de la pantalla — `LoanUpdateForm.tsx` lo usa como
fuente de verdad.

Verificado contra el préstamo real de la captura (RD$15.000, quincenal, cuota RD$370, inicio
24-ene-2026):

```
Primera cuota      2026-02-07   ✓ coincide con pantalla (7 feb de 2026)
Períodos vencidos  15           ✓ último 2026-08-22 (#15)
Período en curso    1           ✓ 2026-09-05 (#16, Pendiente)

Interés pendiente   5.550 → 5.920
Balance restante   20.550 → 20.920   ✓ ahora coincide con "Ver cuotas"
"Al día"             0,00 →    370
Fórmula SQL                      5.920   ✓ coincide con el frontend
```

*Nota:* los préstamos a plazo fijo ya lo hacían bien (el panel clasifica en "Al día" toda cuota con
`daysDiff <= 0`, y el interés pendiente suma todas las cuotas impagas, vencidas o no). El fallo era
exclusivo de los indefinidos, donde los períodos se generan dinámicamente.

---

## Cuarta ronda: ajustes reportados desde producción

### 40. El capital por antigüedad ignoraba los abonos parciales
`LoanDetailsView.tsx` → `calculateBalanceByAge` (préstamos a plazo fijo)

Sumaba el capital y el interés **completos** de toda cuota que no estuviera marcada como
pagada. Un abono parcial no movía el panel hasta que la cuota quedara saldada por completo.
→ Ahora descuenta lo pagado por fecha de vencimiento con la misma regla que "Capital/Interés
pend. hoy" (primero interés, luego capital), separa los pagos a cargos de los pagos a cuotas, y
descuenta también los abonos a cargos.

### 42. El primer pago de un indefinido "pagaba" todos los cargos anteriores a la próxima cuota
`installmentLateFeeCalculator.ts` (motor compartido por antigüedad, mora, detalle y estado de cuenta)

Tres defectos encadenados alrededor de los CARGOS:
1. **El atajo por `next_payment_date`** ("todo lo anterior a la próxima cuota está pagado") se
   aplicaba también a los cargos. Sin pagos no se activa, pero al registrar el **primer pago**
   del préstamo, todo cargo con fecha anterior a la próxima cuota se marcaba pagado de golpe:
   el balance por antigüedad caía (7.500 → 2.500 tras abonar 1.000) y la mora de esos cargos
   desaparecía. `next_payment_date` solo rastrea cuotas de interés → el atajo ahora excluye cargos.
2. **Cargo y cuota con la misma fecha**: el pago se asignaba a la primera fila con ese
   `due_date` (podía ser la cuota regular). Ahora los pagos sin interés cuya fecha coincide con
   un cargo se reparten acumulativamente entre los cargos de esa fecha (mismo criterio que
   `loanBalanceBreakdown`) y no tocan la cuota regular.
3. **Abono parcial a un cargo**: el desglose reportaba el monto completo del cargo. Ahora
   reporta el **restante** (total − abonos), así el balance por antigüedad cuadra con
   "Cargos pendientes" (ej. 4.000 + 1.500 + 1.000 = 6.500).

### 43. `legal_evaluate_eligibility` fallaba con "malformed array literal"
Migración `20260829000002` — en plpgsql, `array_texto || 'literal'` sin tipo hace que Postgres
elija la sobrecarga *array || array* y parsee el texto como array. Todos los appends pasan a
`array_append()`. (Corregido también en el archivo original para instalaciones nuevas.)

### 44. Cargos "robaban" períodos del interés por antigüedad en indefinidos
`installmentLateFeeCalculator.ts` — la generación dinámica de períodos partía de
`max(installment_number regular) + 1` y calculaba la fecha **desde el número**
(`primera_cuota + (N−1) períodos`). Pero los cargos roban números de la secuencia
(`installment_number = max(TODOS) + 1`), así que los períodos cuyos números se llevó un cargo
**nunca se generaban**: su interés desaparecía del desglose y el panel "Balance de interés por
antigüedad" lo volcaba al rango **"Al día"** vía la reconciliación, aunque la cuota estuviera
vencida. → La generación ahora recorre **cada período por FECHA** (1..hoy) y crea los que falten,
sin depender de los números.

**Reproducido y verificado con arnés real** (motor completo con stub de Supabase): indefinido
quincenal con 2 cargos que robaron los números #2/#3 — antes faltaban los períodos 20-jun y
04-jul y RD$2.000 caían en "Al día"; después, los 7 períodos impagos existen y cada uno cae en
su rango (8/8 comprobaciones). Se verificó además que los **plazo fijo** con cargo intermedio no
tienen ruta equivalente (7/7): sus cuotas existen como filas y el panel bucketiza por fechas
reales de la BD; la generación por número solo existía en la rama indefinida.

### 41. El historial del préstamo no decía a qué se aplicó cada pago
`LoanHistoryView.tsx` — cada pago muestra ahora **"Aplicado a: Cuota #N/T · vence dd mmm"** o
**"Cargo #N "descripción" · monto · fecha"**, con el mismo criterio de asignación que el resto
del sistema (pagos sin interés con la fecha de un cargo → al cargo, en orden hasta cubrirlo).

---

## Verificación

```
npm run build            ✓ built in 13.32s
npx tsc --noEmit         34 → 0 errores
44 pruebas automatizadas ✓ todas correctas
```

- **28 pruebas de aritmética de frecuencias**: recorte de fin de mes (31-ene → 28-feb, incluido año
  bisiesto), cruce de año, quincena = 14 días, las seis frecuencias, primera cuota = inicio + 1
  período, conversión de tasa mensual a tasa de período, y conteo de períodos vencidos (**una cuota
  que vence mañana no cuenta como vencida hoy**).
- **8 pruebas de asignación de pagos en cascada**: abonos parciales sobre la misma cuota, mezcla con
  asignación por `due_date`, y no-regresión del caso de un pago completo por cuota.
- **8 comprobaciones del interés pendiente** contra el préstamo real de producción: fecha de primera
  cuota, conteo de períodos vencidos, identificación del período en curso, y coincidencia entre el
  frontend, el panel de antigüedad y la fórmula SQL.

---

## Archivos modificados

**Nuevos (2)**
- `src/utils/frequencyUtils.ts`
- `supabase/migrations/20260828000000_fix_frequency_aware_sql_calculations.sql`

**Modificados (17)**
- `src/utils/dateUtils.ts`
- `src/utils/installmentLateFeeCalculator.ts`
- `src/utils/loanBalanceBreakdown.ts`
- `src/components/loans/AmortizationTable.tsx`
- `src/components/loans/LoanForm.tsx`
- `src/components/loans/AccountStatement.tsx`
- `src/components/loans/PaymentForm.tsx`
- `src/components/loans/LoanUpdateForm.tsx`
- `src/components/loans/LateFeeReports.tsx`
- `src/components/loans/InstallmentsTable.tsx`
- `src/components/collections/QuickCollectionModule.tsx`
- `src/components/company/HolidaysModule.tsx`
- `src/components/inventory/InventoryModule.tsx`
- `src/components/reports/ReportsModuleImproved.tsx`
- `src/hooks/useLateFee.tsx`
- `src/hooks/useLoanPaymentStatusSimple.tsx`

---

## Antes de desplegar

1. **La migración recalcula `remaining_balance` y `next_payment_date` de TODOS los préstamos** al
   final. Con las fórmulas corregidas, los préstamos no mensuales y los indefinidos atrasados
   **cambiarán de valor** — es la corrección, pero conviene respaldar y revisar una muestra antes.
   El cambio más visible: el saldo de los **indefinidos atrasados subirá**, porque ahora se
   contabiliza el interés de *todos* los períodos vencidos y no solo de uno.
2. Los **préstamos ya creados** con cuotas mal generadas **no se corrigen solos**: sus filas en
   `installments` ya están escritas. Afecta a los alemán/americano guardados como simple, los
   quincenales desfasados, las extensiones con cuotas adelantadas y los que tenían gastos de cierre
   (que nunca se cobraron). Hay que decidir si se regeneran.
3. Los **cambios de saldo y de mora ya cobrada** no se revierten: las correcciones aplican de aquí
   en adelante. Si algún cliente pagó mora calculada de más (p. ej. por el `/30` fijo o por la
   asignación de pagos parciales), eso requiere una revisión contable aparte.
4. `git` no está instalado en este equipo, así que no pude generar un diff ni comparar contra la
   rama base. Los cambios se identifican buscando `CORRECCIÓN (auditoría 2026-08-28)` en el código.
5. **La migración SQL no se ejecutó**: no hay una base de datos local ni conexión configurada en
   este entorno, así que su sintaxis está revisada pero **no probada contra Postgres**. Conviene
   aplicarla primero en un entorno de prueba.
