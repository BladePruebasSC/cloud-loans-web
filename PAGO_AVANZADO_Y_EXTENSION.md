# Pago avanzado (varias cuotas) y corrección de la Extensión de Plazo

Fecha: 2026-08-31

---

## 1. Extensión de Plazo — tres errores, no uno

El caso reportado: préstamo **quincenal** de RD$10,000 al 15 % mensual, 6 cuotas de RD$2,416.67.
Se agregan 2 cuotas y aparecen como RD$2,750.00 mientras las 6 originales siguen en RD$2,416.67,
y el total cambia según dónde se mire.

### 1.1 La fórmula ignoraba la frecuencia

```ts
// ANTES (LoanUpdateForm.tsx)
const totalInterest = (loan.amount * loan.interest_rate * newTotalPayments) / 100;
```

Esto trata el plazo como si siempre fueran **meses**. En un préstamo quincenal la tasa de período
es la mitad de la mensual:

| | Interés total | Cuota |
|---|---|---|
| Fórmula anterior | 10,000 × 15 % × 8 = **12,000** | 22,000 ÷ 8 = **2,750.00** |
| Correcto (× 0.5 quincenal) | 10,000 × 15 % × 0.5 × 8 = **6,000** | 16,000 ÷ 8 = **2,000.00** |

De ahí salían exactamente los RD$2,750 de la captura. En un préstamo **diario** el error era de
30×; en uno **semanal**, de 4×.

### 1.2 No se recalculaban las cuotas existentes

Solo se hacía `INSERT` de las cuotas nuevas. Las anteriores conservaban su reparto de capital, así
que el capital quedaba repartido de más:

```
6 × 1,666.67  +  2 × 2,000.00  =  14,000  repartidos en un préstamo de 10,000
```

Además `loans.total_amount` **no se actualizaba**, y como el trigger de la base de datos recalcula
el balance desde ese campo, la BD decía 16,000, la vista previa 14,500 y la tabla de amortización
otra cosa. Los tres números que no cuadraban.

### 1.3 Vista previa y guardado contaban cosas distintas

El importe se calculaba sobre `term_months + adicionales` (incluye cuotas **ya pagadas**) mientras
la vista previa mostraba `cuotas pendientes + adicionales`. Con cualquier cuota pagada, el número
que se veía y el que se aplicaba no eran el mismo.

### 1.4 Cómo quedó

Todo el cálculo vive ahora en **`src/utils/loanRescheduling.ts`**, una función pura
(`computeExtendedSchedule`) que llaman los tres sitios: la vista previa, el guardado y el texto del
historial. Con las mismas entradas no pueden dar resultados distintos.

Al extender se **re-amortiza el tramo pendiente completo**:

- Las cuotas **pagadas no se tocan** (son historia).
- El **capital pendiente** se reparte entre las cuotas pendientes + las nuevas.
- Se respeta el tipo de amortización: simple (cuota uniforme), francesa (cuota fija, interés sobre
  saldo), alemana (capital fijo, cuota decreciente) y línea de crédito (solo interés).
- Las cuotas existentes **conservan su número y su fecha** — renumerarlas rompería
  `loans.paid_installments` y el historial; solo cambia el reparto capital/interés.
- Las cuotas nuevas se numeran desde el número más alto del préstamo, **incluidos los cargos**, que
  consumen números de la misma secuencia. Sin esto, una cuota nueva podía nacer con el mismo número
  que un cargo existente.
- Se actualizan `term_months`, `monthly_payment`, **`total_amount`** y `end_date`.

### 1.5 "Meses" → "Cuotas"

- La etiqueta del campo pasa de **"Meses Adicionales"** a **"Cuotas Adicionales"**, con una nota
  bajo el campo: *"Cada cuota que agregues equivale a 1 quincena, que es la frecuencia de pago de
  este préstamo"* (se adapta a día/semana/quincena/mes/trimestre/año).
- El texto del historial multiplicaba por 30/4/2 para convertir "meses" a períodos, y era
  aproximado ("30 días" por mes). Ahora registra las cuotas reales y nombra la frecuencia.
- El nombre interno del campo (`additional_months`) se conserva por compatibilidad con el historial
  ya guardado; su unidad son cuotas.

### 1.6 La vista previa ahora explica el reparto

Además de los totales, muestra una **tabla cuota por cuota** con fecha, capital, interés e importe,
marcando cuáles son nuevas, y una frase que describe el reparto. Lo que se ve ahí es exactamente lo
que se guarda.

---

## 2. Pago avanzado — abonar a varias cuotas de una vez

El modo normal cobra **siempre la cuota más antigua pendiente**. Cuando un cliente llega con dinero
para varias cuotas, había que registrar un pago por cuota y confiar en que el reparto saliera bien.

Un interruptor **"Pago avanzado"** en el formulario de pagos abre un panel donde el empleado:

1. Ve todas las cuotas y cargos pendientes, con total, pagado y pendiente de cada uno, y marca
   los vencidos.
2. Marca las que quiere cobrar (con atajos: *la más antigua*, *2 más antiguas*, *todas*).
3. Escribe el monto total que entrega el cliente — puede ser mayor al de una sola cuota.
4. Ve **en la misma tabla** cuánto va a cada cuota y si queda saldada o con abono parcial, antes de
   guardar.

El reparto es cronológico: satura cada cuota antes de pasar a la siguiente. Si el monto supera lo
pendiente de lo seleccionado, se avisa y no se deja guardar — los excedentes no se arrastran solos a
la cuota siguiente (comportamiento ya existente del sistema, ahora explícito en pantalla).

**Se registra un pago por cuota**, cada uno con su `due_date`. Es la forma que el resto del sistema
espera (mora, antigüedad e informes agrupan por `due_date`) y hace que el historial diga a qué
cuota o cargo fue cada abono. El capital y el interés de cada abono se reparten en la misma
proporción que tiene la cuota, para que el desglose por antigüedad siga cuadrando.

### Lo que este modo NO hace (a propósito)

- **No cobra mora.** La mora se cobra desde el modo normal, que la calcula y distribuye cuota por
  cuota con el motor existente. Duplicar esa lógica aquí era el mayor riesgo de la tarea. El panel
  lo dice en pantalla.
- **`paid_amount` solo se escribe en cargos.** Es el único caso en que el resto del sistema mantiene
  esa columna (`PaymentActions` la recalcula solo para cargos al borrar un pago). Escribirla en una
  cuota regular dejaría un valor que nadie actualiza y que después se leería como pagado.

---

## 3. Archivos

**Nuevos**

```
src/utils/loanRescheduling.ts          computeExtendedSchedule — reparto de la extensión
src/utils/installmentDues.ts           computeInstallmentDues + allocateAmountToInstallments
src/components/loans/AdvancedPaymentPanel.tsx
```

**Modificados**

```
src/components/loans/LoanUpdateForm.tsx   vista previa, guardado, historial y etiquetas
src/components/loans/PaymentForm.tsx      interruptor y montaje del panel avanzado
```

El flujo de pago normal queda **intacto**: en modo avanzado se oculta pero sigue montado, así que no
se pierde lo ya escrito al alternar.

---

## 4. Verificación

```
78 pruebas de loanRescheduling   ✓
39 pruebas de installmentDues    ✓
64 pruebas de portfolioMetrics   ✓  (sin regresiones)
npx tsc --noEmit                 ✓  0 errores
npx eslint (archivos nuevos)     ✓  0 avisos
npm run build                    ✓
```

Las pruebas de la extensión incluyen el caso exacto reportado (10,000 quincenal, 6 cuotas, +2 →
**2,000.00** y capital sumando exactamente 10,000), las cuatro amortizaciones, todas las
frecuencias, cierre de mes (31-ene → 28-feb, sin desbordar), cuotas ya pagadas, cargos intercalados
y colisión de numeración, abonos a capital, redondeo que no divide exacto, tasa 0 % y préstamo sin
cuotas.

Las de reparto de pagos cubren pendiente por cuota, pagos parciales, cargos y cuotas de la misma
fecha (que no deben mezclarse), cascada entre cargos, monto mayor que lo pendiente, orden
cronológico frente a orden por número, y redondeo de centavos.

---

## 5. Nota sobre préstamos ya extendidos

Los préstamos a los que **ya se les aplicó una extensión con la fórmula anterior** conservan en la
base de datos las cuotas mal repartidas (el caso de la captura: seis a 2,416.67 y dos a 2,750). El
código corregido no los repara de forma retroactiva.

Para arreglar uno: abrir *Actualizar → Extensión de Plazo* y aplicar **0 cuotas adicionales**. Eso
re-amortiza el tramo pendiente con el reparto correcto sin cambiar el plazo. La vista previa muestra
antes de guardar cómo quedarían las cuotas.
