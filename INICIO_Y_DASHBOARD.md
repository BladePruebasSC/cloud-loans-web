# Rediseño: INICIO (operativo) + DASHBOARD (analítico)

La portada anterior mezclaba operación y análisis en una sola pantalla. Ahora son dos, con
propósitos distintos y sin duplicar consultas: ambas leen del mismo hook, así que **nunca pueden
mostrar cifras diferentes**.

| | Pregunta que responde | Ruta |
|---|---|---|
| **Inicio** | *¿Qué tengo que hacer hoy?* | `/` |
| **Dashboard** | *¿Cómo va el negocio?* | `/dashboard` |

---

## Dos métricas que estaban mal (y por qué importaba)

**1. "Salud de la cartera: 100.0%" con los 10 préstamos en mora.**
Se calculaba `min(100, total_cobrado ÷ total_prestado)`. Eso mezcla capital con intereses y se
topa artificialmente en 100, así que una cartera íntegramente vencida se veía perfecta. Ahora:

- **Cartera al día** = % del *saldo activo* sin un solo día de atraso. Con esos datos: **0 %**.
- **PAR-30 / 60 / 90** (*Portfolio at Risk*, el indicador estándar del sector): % del saldo con
  más de 30/60/90 días de atraso.
- La **recuperación de capital** se reporta aparte (capital cobrado ÷ capital colocado) y el
  **rendimiento** aparte (interés ÷ capital colocado). Cada ratio contra su propia base.

**2. Los pagos registrados por empleados no se contaban.**
La consulta era `payments.eq('created_by', companyId)`, pero `created_by` es el *usuario* que
registró el pago, no la empresa: en cualquier empresa con más de un usuario los ingresos salían
subestimados. Ahora los pagos se piden **por los préstamos de la empresa** (`loan_id`), que es el
vínculo real y no depende de qué columna de propiedad esté poblada.

---

## INICIO — centro de operaciones

Cabecera oscura con saludo por hora del día, empresa y fecha, y las **acciones rápidas** como
botones primarios (filtradas por permiso). Debajo, tarjetas superpuestas sobre la cabecera:

- **Resumen del día** — Cobrado hoy (con variación vs. ayer), Esperado hoy, En mora, Cartera al día.
  Cada tarjeta navega a donde se actúa.
- **Alertas** — solo aparecen si existen: mora >30 días, promesas de pago vencidas, intimaciones
  esperando aprobación, clientes en mora sin gestión reciente.
- **Tu día** — bandeja **unificada y priorizada** de pendientes, que fusiona seis orígenes:
  cuotas que vencen hoy, préstamos vencidos, seguimientos programados, promesas de pago, tareas
  legales y aprobaciones. Lo que lleva más de 7 días sin gestión sube al primer lugar. Cada línea
  trae sus acciones: llamar, registrar gestión, cobrar.
- **Próximos vencimientos** — 7 días vista, con acceso directo a cobrar.
- **Actividad reciente** — pagos, préstamos, clientes y gestiones en una sola línea de tiempo.
- **Cartera en un vistazo** y **accesos a módulos** (solo los permitidos).
- **Primeros pasos** — solo mientras falte configurar empresa, clientes o préstamos.

## DASHBOARD — análisis

Cuatro KPIs fijos (cartera activa, ingresos del mes con variación mensual, PAR-30, cartera al día)
y cuatro pestañas:

- **Resumen financiero** — cobros por mes apilados (capital/interés/mora), composición del ingreso,
  colocación vs. recuperación, anillo de recuperación de capital y tabla comparativa mensual.
- **Cartera** — capital colocado, saldo, ticket promedio, composición por tipo de amortización y
  por frecuencia, y clientes con mayor exposición (con % de concentración).
- **Cobranza y morosidad** — PAR-30/60/90, antigüedad de la cartera por saldo, mora cobrada por
  mes y tabla de préstamos de mayor riesgo (días × saldo) con botón de cobro.
- **Clientes** — base, penetración, altas del mes, concentración y enlace al CRM.

Selector de 6/12 meses y **exportación a CSV** de todos los indicadores y la serie mensual.

---

## Arquitectura

```
src/utils/portfolioMetrics.ts   Funciones puras: PAR, buckets, flujo de caja, recuperación,
                                serie mensual, agenda. Sin acceso a datos → testeable.
src/hooks/usePortfolioData.tsx  Una sola carga (préstamos, clientes, pagos, ventas, gestiones y,
                                si existe, el módulo legal) + derivaciones memoizadas.
src/components/home/HomeModule.tsx
src/components/dashboard/AnalyticsDashboard.tsx
```

Se respetó lo existente: mismo stack (React + shadcn + Recharts), mismo enrutado
(`App.tsx` → `pages/Index.tsx` con `switch`), mismo `Sidebar` con permisos, mismo `useAuth`,
`formatCurrency` y utilidades de fecha de Santo Domingo. Se reutiliza el diálogo
`CollectionTracking` para registrar gestiones desde Inicio, y los deep links existentes
(`/prestamos?action=payment&loanId=…`).

**Permisos:** `/dashboard` queda accesible a quien ya entraba a la portada (no se introduce
ninguna restricción nueva). Las acciones rápidas y los accesos a módulos sí se filtran por permiso.

`daysBetweenIso` se movió de `legalWorkflow.ts` a `frequencyUtils.ts` (la usan mora, CRM, legal y
cartera) y se reexporta desde su ubicación anterior para no tocar los imports existentes.

**`src/pages/Dashboard.tsx` se eliminó.** Nada se perdió: resumen financiero y próximos pagos
viven en el Dashboard; acciones rápidas, próximos pagos operativos y onboarding, en Inicio.

## Verificación

```
64 pruebas de portfolioMetrics  ✓   (incluye el caso real: 10 préstamos en mora → salud 0 %)
npx tsc --noEmit                ✓ 0 errores
npm run build                   ✓
```

Las pruebas cubren buckets de antigüedad, período de gracia, cartera mixta, flujo de caja
hoy/ayer/semana/mes con cierre de mes, variación mensual, recuperación acotada al 100 %, serie
mensual con cruce de año, agenda operativa, los dos esquemas históricos de `sales`, y casos borde
(cartera vacía, pagos sin `amount`).
