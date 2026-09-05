// Condonación de mora ("Actualizar préstamo → Eliminar Mora").
//
// FALLO REPORTADO (2026-09-05): "La mora eliminada no se elimina; cuando elimino la mora por
// actualizar y guardo, cuando carga vuelve a salir el mismo monto".
//
// El préstamo del reporte: INDEFINIDO, RD$25,000 al 5% mensual (interés RD$1,250 por período),
// 28 días de atraso, 2 días de gracia, mora al 1.25% diario → 1,250 × 1.25% × 26 = RD$406.25.
//
// CAUSA: la condonación se anota como `late_fee_paid` en `installments`. Un préstamo indefinido
// tiene UNA SOLA fila; los demás períodos los genera el cálculo sobre la marcha. Esa fila
// mandaba su crédito a un "fondo" que SOLO podía gastarse en los períodos generados, nunca en
// ella misma. Si toda la mora sale de esa fila —un único período vencido—, condonar no quitaba
// ni un peso: el aviso decía "Nueva mora: RD$0" y al recargar volvían los 406.25 exactos.
import { describe, it, expect } from 'vitest';
import {
  computeInstallmentLateFee,
  distributeLateFeeWaiver,
  spendLateFeeCredit,
  type LateFeeCreditItem,
  type WaiverTargetRow,
} from '../lateFeeWaiver';
import { getLateFeePeriodDays } from '../frequencyUtils';

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mora total de un desglose, que es lo que la pantalla enseña como "Mora Actual". */
const totalMora = (items: LateFeeCreditItem[]) =>
  round2(items.filter(i => !i.isPaid).reduce((s, i) => s + i.lateFee, 0));

describe('computeInstallmentLateFee', () => {
  it('El caso reportado: 1,250 de interés, 26 días con mora al 1.25% diario = 406.25', () => {
    const lateFee = computeInstallmentLateFee({
      base: 1250,
      feeDays: 28 - 2, // 28 días de atraso menos 2 de gracia
      rate: 1.25,
      calculationType: 'daily',
      periodDays: getLateFeePeriodDays('monthly'),
    });
    expect(lateFee).toBe(406.25);
  });

  it('La gracia recorta los días que devengan mora, no los días de atraso', () => {
    // La distinción se fijó el 2026-09-03: los días vencidos se muestran completos; la gracia
    // solo perdona el recargo. Aquí se comprueba el lado del recargo.
    const sinGracia = computeInstallmentLateFee({ base: 1250, feeDays: 28, rate: 1.25, calculationType: 'daily', periodDays: 30 });
    const conGracia = computeInstallmentLateFee({ base: 1250, feeDays: 26, rate: 1.25, calculationType: 'daily', periodDays: 30 });
    expect(sinGracia).toBe(437.5);
    expect(conGracia).toBe(406.25);
  });

  it("El tipo 'monthly' cuenta períodos de la FRECUENCIA, no meses de 30 días", () => {
    // En el formulario de condonación esto estaba fijo en `/30`: en un préstamo semanal con 26
    // días de atraso se anotaba 1 período de recargo mientras que el cálculo cobraba 4. La
    // diferencia se perdía y la mora no bajaba lo pedido.
    const semanal = computeInstallmentLateFee({
      base: 312.5, feeDays: 26, rate: 2, calculationType: 'monthly', periodDays: getLateFeePeriodDays('weekly'),
    });
    const comoAntes = computeInstallmentLateFee({
      base: 312.5, feeDays: 26, rate: 2, calculationType: 'monthly', periodDays: 30,
    });
    expect(semanal).toBe(round2(312.5 * 0.02 * Math.ceil(26 / 7))); // 4 semanas
    expect(comoAntes).toBe(round2(312.5 * 0.02 * 1));               // 1 "mes"
    expect(semanal).not.toBe(comoAntes);
  });

  it('Respeta el tope de mora del préstamo y los casos sin mora', () => {
    expect(computeInstallmentLateFee({ base: 1250, feeDays: 26, rate: 1.25, calculationType: 'daily', periodDays: 30, maxLateFee: 100 })).toBe(100);
    expect(computeInstallmentLateFee({ base: 1250, feeDays: 0, rate: 1.25, calculationType: 'daily', periodDays: 30 })).toBe(0);
    expect(computeInstallmentLateFee({ base: 0, feeDays: 26, rate: 1.25, calculationType: 'daily', periodDays: 30 })).toBe(0);
    // maxLateFee = 0 significa "sin tope", no "mora cero".
    expect(computeInstallmentLateFee({ base: 1250, feeDays: 26, rate: 1.25, calculationType: 'daily', periodDays: 30, maxLateFee: 0 })).toBe(406.25);
  });
});

describe('spendLateFeeCredit', () => {
  it('EL CASO REPORTADO: la única cuota guardada del indefinido también recibe el crédito', () => {
    // Desglose tal como lo arma el cálculo: la fila de la BD (vencida) y el período que aún no
    // vence, generado sobre la marcha.
    const desglose: LateFeeCreditItem[] = [
      { dueDate: '2026-08-08', lateFee: 406.25, isPaid: false }, // fila guardada en `installments`
      { dueDate: '2026-09-08', lateFee: 0, isPaid: false },      // período generado, aún sin vencer
    ];
    expect(totalMora(desglose)).toBe(406.25);

    // El usuario condona los 406.25: eso queda anotado como `late_fee_paid` en la fila guardada
    // y llega aquí como crédito.
    const { applied, remaining } = spendLateFeeCredit(desglose, 406.25);

    expect(applied).toBe(406.25);
    expect(remaining).toBe(0);
    expect(totalMora(desglose)).toBe(0); // antes seguía en 406.25
  });

  it('Se gasta de la cuota MÁS VIEJA a la más nueva, sin importar el orden de la lista', () => {
    // El desglose trae primero las filas de la BD y después los períodos generados, así que no
    // viene ordenado por fecha.
    const desglose: LateFeeCreditItem[] = [
      { dueDate: '2026-08-15', lateFee: 100 },
      { dueDate: '2026-06-15', lateFee: 100 },
      { dueDate: '2026-07-15', lateFee: 100 },
    ];

    const { applied, remaining } = spendLateFeeCredit(desglose, 150);

    expect(applied).toBe(150);
    expect(remaining).toBe(0);
    expect(desglose.find(d => d.dueDate === '2026-06-15')!.lateFee).toBe(0);   // la más vieja, entera
    expect(desglose.find(d => d.dueDate === '2026-07-15')!.lateFee).toBe(50);  // la siguiente, a medias
    expect(desglose.find(d => d.dueDate === '2026-08-15')!.lateFee).toBe(100); // la más nueva, intacta
  });

  it('Los CARGOS no se benefician del crédito de las cuotas de interés', () => {
    // Un cargo es una obligación aparte: su mora no se cancela con lo condonado de las cuotas.
    const desglose: LateFeeCreditItem[] = [
      { dueDate: '2026-07-15', lateFee: 200, isCharge: true },
      { dueDate: '2026-07-20', lateFee: 100 },
    ];

    const { applied, remaining } = spendLateFeeCredit(desglose, 300);

    expect(desglose[0].lateFee).toBe(200); // el cargo conserva su mora
    expect(desglose[1].lateFee).toBe(0);
    expect(applied).toBe(100);
    expect(remaining).toBe(200); // sobra crédito: no hay dónde gastarlo
  });

  it('Las cuotas pagadas no consumen crédito', () => {
    const desglose: LateFeeCreditItem[] = [
      { dueDate: '2026-06-15', lateFee: 80, isPaid: true },
      { dueDate: '2026-07-15', lateFee: 120, isPaid: false },
    ];
    const { applied } = spendLateFeeCredit(desglose, 120);
    expect(desglose[0].lateFee).toBe(80); // se deja como estaba
    expect(desglose[1].lateFee).toBe(0);
    expect(applied).toBe(120);
  });

  it('Sin crédito no toca nada', () => {
    const desglose: LateFeeCreditItem[] = [{ dueDate: '2026-07-15', lateFee: 120 }];
    expect(spendLateFeeCredit(desglose, 0)).toEqual({ applied: 0, remaining: 0 });
    expect(spendLateFeeCredit(desglose, -5)).toEqual({ applied: 0, remaining: 0 });
    expect(desglose[0].lateFee).toBe(120);
  });
});

describe('distributeLateFeeWaiver', () => {
  it('EL CASO REPORTADO: anota los 406.25 en la única cuota del indefinido', () => {
    const filas: WaiverTargetRow[] = [
      { id: 'cuota-1', dueDate: '2026-08-08', pendingLateFee: 406.25, currentLateFeePaid: 0 },
    ];
    expect(distributeLateFeeWaiver(filas, 406.25)).toEqual([
      { id: 'cuota-1', added: 406.25, lateFeePaid: 406.25 },
    ]);
  });

  it('Suma sobre lo que la cuota ya tenía anotado, no lo reemplaza', () => {
    const filas: WaiverTargetRow[] = [
      { id: 'cuota-1', dueDate: '2026-08-08', pendingLateFee: 200, currentLateFeePaid: 150 },
    ];
    expect(distributeLateFeeWaiver(filas, 200)).toEqual([
      { id: 'cuota-1', added: 200, lateFeePaid: 350 },
    ]);
  });

  it('Reparte de la más vieja a la más nueva sin pasarse de la mora de cada una', () => {
    const filas: WaiverTargetRow[] = [
      { id: 'c3', dueDate: '2026-08-15', pendingLateFee: 100, currentLateFeePaid: 0 },
      { id: 'c1', dueDate: '2026-06-15', pendingLateFee: 60, currentLateFeePaid: 0 },
      { id: 'c2', dueDate: '2026-07-15', pendingLateFee: 80, currentLateFeePaid: 0 },
    ];

    const updates = distributeLateFeeWaiver(filas, 100);
    const porId = new Map(updates.map(u => [u.id, u.added]));

    expect(porId.get('c1')).toBe(60);
    expect(porId.get('c2')).toBe(40);
    expect(porId.has('c3')).toBe(false);
    // Lo anotado suma EXACTAMENTE lo que se pidió quitar: eso es lo que el reparto proporcional
    // anterior no garantizaba.
    expect(round2(updates.reduce((s, u) => s + u.added, 0))).toBe(100);
  });

  it('Lo que sobra se anota en la cuota más vieja: en indefinidos es el crédito de los períodos generados', () => {
    // Un indefinido semanal con 4 períodos vencidos: solo el primero existe como fila en la BD,
    // así que la mora "anotable" (162.50) es menor que la mora real (387.50).
    const filas: WaiverTargetRow[] = [
      { id: 'unica-fila', dueDate: '2026-08-08', pendingLateFee: 162.5, currentLateFeePaid: 0 },
    ];

    const updates = distributeLateFeeWaiver(filas, 387.5);

    expect(updates).toEqual([{ id: 'unica-fila', added: 387.5, lateFeePaid: 387.5 }]);
  });

  it('Sin cuotas o sin monto no devuelve nada que escribir', () => {
    expect(distributeLateFeeWaiver([], 100)).toEqual([]);
    expect(distributeLateFeeWaiver([{ id: 'c1', dueDate: '2026-08-08', pendingLateFee: 100, currentLateFeePaid: 0 }], 0)).toEqual([]);
  });
});

describe('Condonar y volver a calcular: el recorrido completo', () => {
  /**
   * Reproduce las dos mitades tal como corren en la aplicación: el formulario anota la
   * condonación en `installments.late_fee_paid` (distributeLateFeeWaiver) y, al recargar, el
   * cálculo mete ese `late_fee_paid` al fondo y lo descuenta del desglose (spendLateFeeCredit).
   */
  const condonarYRecalcular = (
    filasBd: Array<{ id: string; dueDate: string; base: number; lateFeePaid: number }>,
    periodosGenerados: string[],
    params: { feeDaysPorFecha: Record<string, number>; rate: number; base: number },
    aCondonar: number
  ) => {
    const moraDe = (dueDate: string, base: number) =>
      computeInstallmentLateFee({
        base,
        feeDays: params.feeDaysPorFecha[dueDate] ?? 0,
        rate: params.rate,
        calculationType: 'daily',
        periodDays: 30,
      });

    // --- Formulario: anota la condonación ---
    const objetivos: WaiverTargetRow[] = filasBd
      .filter(f => moraDe(f.dueDate, f.base) > 0)
      .map(f => ({
        id: f.id,
        dueDate: f.dueDate,
        pendingLateFee: Math.max(0, round2(moraDe(f.dueDate, f.base) - f.lateFeePaid)),
        currentLateFeePaid: f.lateFeePaid,
      }));
    const escrituras = new Map(distributeLateFeeWaiver(objetivos, aCondonar).map(u => [u.id, u.lateFeePaid]));
    const filasTrasGuardar = filasBd.map(f => ({ ...f, lateFeePaid: escrituras.get(f.id) ?? f.lateFeePaid }));

    // --- Cálculo al recargar: desglose bruto + fondo de crédito ---
    const desglose: LateFeeCreditItem[] = [];
    let fondo = 0;
    for (const f of filasTrasGuardar) {
      fondo = round2(fondo + f.lateFeePaid); // indefinido: el crédito es del préstamo
      desglose.push({ dueDate: f.dueDate, lateFee: moraDe(f.dueDate, f.base), isPaid: false });
    }
    for (const fecha of periodosGenerados) {
      if (desglose.some(d => d.dueDate === fecha)) continue;
      desglose.push({ dueDate: fecha, lateFee: moraDe(fecha, params.base), isPaid: false });
    }
    spendLateFeeCredit(desglose, fondo);

    return { moraFinal: totalMora(desglose), filasTrasGuardar };
  };

  it('EL CASO REPORTADO: 25,000 al 5% mensual, 28 días de atraso, 2 de gracia → 406.25 → 0', () => {
    const { moraFinal, filasTrasGuardar } = condonarYRecalcular(
      [{ id: 'cuota-1', dueDate: '2026-08-08', base: 1250, lateFeePaid: 0 }],
      ['2026-08-08', '2026-09-08'], // el período generado aún no vence
      { feeDaysPorFecha: { '2026-08-08': 26, '2026-09-08': 0 }, rate: 1.25, base: 1250 },
      406.25
    );

    expect(filasTrasGuardar[0].lateFeePaid).toBe(406.25);
    expect(moraFinal).toBe(0); // antes volvía a salir 406.25
  });

  it('Indefinido SEMANAL: la condonación total también deja la mora en cero', () => {
    // 25,000 al 5% mensual → 312.50 por semana. Cuatro períodos vencidos (28, 21, 14 y 7 días)
    // con 2 de gracia y mora al 2% diario. Solo el primero existe como fila en `installments`.
    const feeDaysPorFecha = { '2026-08-08': 26, '2026-08-15': 19, '2026-08-22': 12, '2026-08-29': 5, '2026-09-05': 0 };
    const moraTotal = round2(
      Object.values(feeDaysPorFecha).reduce((s, d) => s + 312.5 * 0.02 * d, 0)
    );
    expect(moraTotal).toBe(387.5);

    const { moraFinal, filasTrasGuardar } = condonarYRecalcular(
      [{ id: 'cuota-1', dueDate: '2026-08-08', base: 312.5, lateFeePaid: 0 }],
      Object.keys(feeDaysPorFecha),
      { feeDaysPorFecha, rate: 2, base: 312.5 },
      moraTotal
    );

    // La única fila solo devenga 162.50, pero se le anota la condonación completa: el resto es
    // el crédito que cubre los períodos generados.
    expect(filasTrasGuardar[0].lateFeePaid).toBe(387.5);
    expect(moraFinal).toBe(0);
  });

  it('Una condonación PARCIAL baja exactamente lo condonado, ni más ni menos', () => {
    const feeDaysPorFecha = { '2026-08-08': 26, '2026-08-15': 19, '2026-08-22': 12, '2026-08-29': 5 };
    const { moraFinal } = condonarYRecalcular(
      [{ id: 'cuota-1', dueDate: '2026-08-08', base: 312.5, lateFeePaid: 0 }],
      Object.keys(feeDaysPorFecha),
      { feeDaysPorFecha, rate: 2, base: 312.5 },
      200
    );
    expect(moraFinal).toBe(round2(387.5 - 200));
  });

  it('Condonar dos veces suma: 200 y luego 187.50 dejan la mora en cero', () => {
    const feeDaysPorFecha = { '2026-08-08': 26, '2026-08-15': 19, '2026-08-22': 12, '2026-08-29': 5 };
    const primera = condonarYRecalcular(
      [{ id: 'cuota-1', dueDate: '2026-08-08', base: 312.5, lateFeePaid: 0 }],
      Object.keys(feeDaysPorFecha),
      { feeDaysPorFecha, rate: 2, base: 312.5 },
      200
    );
    const segunda = condonarYRecalcular(
      primera.filasTrasGuardar,
      Object.keys(feeDaysPorFecha),
      { feeDaysPorFecha, rate: 2, base: 312.5 },
      primera.moraFinal
    );
    expect(segunda.moraFinal).toBe(0);
  });
});
