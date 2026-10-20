// ============================================================================
// LA CONFIGURACIÓN DE MORA QUE ACABA EN UN PRÉSTAMO NUEVO
// ============================================================================
// Un préstamo puede nacer de tres sitios: en blanco (manda lo que tenga configurado la empresa),
// desde una SOLICITUD aprobada (manda lo que se aprobó) o editando un préstamo existente (manda
// lo suyo).
//
// FALLO REPORTADO (2026-10-20): "cuando creas un préstamo desde solicitud no está tomando en
// cuenta los datos de mora: la solicitud dice 0 días de gracia y en el formulario sale el número
// por defecto".
//
// Eran dos cosas a la vez:
//   · la solicitud solo mandaba el sí/no de la mora, no la tasa, los días de gracia, el máximo
//     ni el tipo de cálculo;
//   · y el formulario rellenaba "los huecos" con los valores de la empresa tratando el 0 y el
//     false COMO SI FUERAN HUECOS. Pero 0 días de gracia es un valor —"sin gracia"— y una mora
//     deshabilitada es una decisión: así, una solicitud sin gracia salía con los 2 días de la
//     empresa, y una con la mora apagada se encendía sola.
//
// La regla, en una línea: un campo DEFINIDO manda, aunque valga 0 o false; solo lo que no está
// definido lo pone el valor por defecto.

export interface LateFeeConfig {
  late_fee_enabled?: boolean | null;
  late_fee_rate?: number | null;
  grace_period_days?: number | null;
  max_late_fee?: number | null;
  late_fee_calculation_type?: string | null;
}

const LATE_FEE_FIELDS = [
  'late_fee_enabled',
  'late_fee_rate',
  'grace_period_days',
  'max_late_fee',
  'late_fee_calculation_type',
] as const;

/** ¿El campo trae un valor? `0` y `false` SÍ lo son; `null`/`undefined` no. */
export const hasLateFeeValue = (value: unknown): boolean =>
  value !== null && value !== undefined;

/** ¿Este origen (solicitud, préstamo que se edita…) trae su propia configuración de mora? */
export const hasLateFeeConfig = (source?: LateFeeConfig | null): boolean =>
  LATE_FEE_FIELDS.some((campo) => hasLateFeeValue(source?.[campo]));

/**
 * La configuración que debe quedar en el formulario: la del origen, campo a campo, y los valores
 * por defecto solo donde el origen no dijo nada.
 */
export function mergeLateFeeConfig(
  defaults: LateFeeConfig,
  source?: LateFeeConfig | null,
): LateFeeConfig {
  const resultado: LateFeeConfig = { ...defaults };
  for (const campo of LATE_FEE_FIELDS) {
    const valor = source?.[campo];
    if (hasLateFeeValue(valor)) {
      (resultado as Record<string, unknown>)[campo] = valor;
    }
  }
  return resultado;
}
