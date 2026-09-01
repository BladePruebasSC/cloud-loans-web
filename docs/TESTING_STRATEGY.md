# Estrategia de pruebas — Cloud Loans

> Estado al **2026-09-01**. El proyecto pasó de **cero pruebas** a una base ejecutable.

---

## 1. Punto de partida

Antes de la auditoría:

- **0** archivos `.test` / `.spec` en el repositorio.
- **0** dependencias de testing.
- **Ningún** script `test` en `package.json`.
- Un único `supabase/tests/legal_workflow_test.sql` que **nunca se había ejecutado**.

En un sistema que calcula dinero de terceros, eso es el riesgo estructural principal: cada
corrección se validaba mirando la pantalla.

---

## 2. Herramienta y por qué

**vitest 2.1.9.** Comparte la configuración y el resolutor de Vite (mismos alias `@/`, mismo
TypeScript), así que no hay una segunda cadena de compilación que mantener. Se fija la **major
2** porque vitest 3 y 4 exigen Vite 6/7 y el proyecto está en Vite 5.

Entorno `node`, no `jsdom`: lo que se prueba hoy es lógica pura. Cuando haya pruebas de
componentes se instalará `jsdom` y se marcará por archivo con
`// @vitest-environment jsdom`.

---

## 3. Comandos

```bash
npm test              # una pasada
npm run test:watch    # durante el desarrollo
npm run test:coverage # cobertura (v8)
npm run typecheck     # tipos DE VERDAD
npm run verify        # typecheck + test + build
```

### ⚠️ `npx tsc --noEmit` NO comprueba nada

El `tsconfig.json` raíz tiene `"files": []` y solo referencias a proyectos. Verificado con
`--listFiles`:

```
tsc --noEmit                      →   0 archivos del proyecto
tsc -p tsconfig.app.json --noEmit → 130 archivos del proyecto
```

Cualquier «tipos correctos» comprobado con el primer comando era **vacío**. Durante la
auditoría, el comando correcto detectó tres identificadores usados sin importar
(`AlertTriangle`, `useRef`, un `reduce` mal tipado) que el build de Vite **no** detecta, porque
esbuild no comprueba tipos. Dos de ellos habrían reventado la pantalla en tiempo de ejecución.

**Usa siempre `npm run typecheck`.**

---

## 4. Qué hay cubierto hoy

10 suites · **103 casos** · ~690 aserciones · `src/utils/__tests__/`, `src/data/__tests__/`.

| Módulo | Cobertura de líneas |
|---|---|
| `amortizationTotals.ts` | 100 % |
| `sessionKeepAlive.ts` | 100 % |
| `installmentDues.ts` | 100 % |
| `loanRescheduling.ts` | 100 % |
| `dominicanRepublic.ts` | 100 % |
| `dominicanId.ts` | 99 % |
| `collectionRoute.ts` | 99 % |
| `portfolioMetrics.ts` | 98 % |
| `advancedPaymentReceipt.ts` | 89 % |
| `frequencyUtils.ts` | 68 % |
| `googleMaps.ts` | 60 % |

**Total `src/utils` + `src/data`: 40,46 % de líneas.**

## 5. ⚠️ Lo que NO está cubierto — y es lo más importante

| Módulo | Líneas | Cobertura | Riesgo |
|---|---|---|---|
| `installmentLateFeeCalculator.ts` | 710 | **0 %** | Motor de mora. Lo consumen 9 pantallas |
| `clientScoring.ts` | 634 | **0 %** | Score CRM |
| `whatsappUtils.ts` | 404 | 0 % | Mensajería |
| `exportUtils.ts` | 377 | 0 % | Exportaciones |
| `legalWorkflow.ts` | 360 | 0 % | Flujo legal |
| `loanBalanceBreakdown.ts` | 281 | **0 %** | Desglose de saldo |
| `whatsappReceipt.ts` | 324 | 0 % | Recibos |
| `dateUtils.ts` | 218 | **0 %** | Zona horaria de todo el sistema |
| `nextPaymentDateFromInstallments.ts` | 115 | **0 %** | Próximo pago |
| `lateFeeCalculator.ts` | 108 | 0 % | Reparto de pagos de mora |
| `intimationDocument.ts` | 84 | 0 % | Documento legal |

La ironía del estado actual: **está probado lo que se escribió esta semana, y sin probar lo que
lleva meses en producción calculando la mora y el saldo de todos los préstamos.**

Cobertura **0 %** también en: todos los componentes, todos los hooks, todas las funciones SQL,
todas las Edge Functions y todas las políticas RLS.

---

## 6. Prioridades

### P0 — Motores financieros consumidos por todo
1. `installmentLateFeeCalculator.ts` — por frecuencia, por tipo de cálculo (`daily`/`monthly`/
   `compound`), período de gracia, tope `max_late_fee`, `late_fee_enabled = false`, cargos vs
   cuotas, mora ya pagada, préstamos indefinidos.
2. `loanBalanceBreakdown.ts` — plazo fijo e indefinido, cargos, abonos a capital, sobrepago.
3. `dateUtils.ts` — cierre de mes, año bisiesto, cambio de año, zona horaria negativa.
4. `nextPaymentDateFromInstallments.ts` — cargos intercalados, pagos parciales.

### P1 — Equivalencia entre implementaciones duplicadas
Antes de unificar (ver `FINANCIAL_RULES.md` §3), escribir pruebas que ejecuten **las dos**
implementaciones con las mismas entradas y comparen. Así se demuestra cuál es correcta y la
unificación deja de ser un salto de fe.

Empezar por el saldo pendiente (7 implementaciones) y el interés pendiente (5).

### P2 — Base de datos
`supabase/tests/legal_workflow_test.sql` existe pero **nunca se ha ejecutado**. Hace falta un
proyecto Supabase de pruebas. Cubrir además:
- que las políticas RLS **aíslan de verdad** entre empresas (un test por tabla sensible);
- `calculate_loan_remaining_balance` frente a `loanBalanceBreakdown.ts`;
- los triggers de `payments` e `installments`.

### P3 — Componentes y flujos
Con `jsdom` + Testing Library: formulario de pago, alta de cliente, extensión de plazo.

---

## 7. Cómo escribir una prueba aquí

```ts
import { describe, it, expect } from 'vitest';
import { computeExtendedSchedule } from '@/utils/loanRescheduling';

describe('loanRescheduling', () => {
  it('reparte el capital pendiente sin perder céntimos', () => {
    const s = computeExtendedSchedule({ /* … */ });
    expect(s.rows.reduce((t, r) => t + r.principal, 0)).toBe(10000);
  });
});
```

Reglas:
1. **Deterministas.** Nada de `Date.now()` sin fijar, ni red, ni Supabase. Las fechas se pasan
   como parámetro.
2. **Números reales.** Los casos salen de préstamos reales, no de valores redondos cómodos.
3. **Cada bug encontrado se convierte en prueba** antes de arreglarlo. Las suites actuales ya
   contienen los casos exactos que fallaron en producción, con un comentario de qué daba antes.
4. **Probar las propiedades, no solo ejemplos.** El validador de cédula no se prueba con una
   cédula real: se comprueba que detecta el 100 % de los errores de un dígito y todas las
   transposiciones.

---

## 8. Puerta de calidad

Antes de dar por terminado cualquier cambio financiero:

```bash
npm run verify
```

Y si el cambio toca la base de datos, ejecutar además las pruebas SQL en un proyecto de
pruebas. Todavía **no existe integración continua**: hoy esto depende de la disciplina de quien
programa. Automatizarlo es P1.
