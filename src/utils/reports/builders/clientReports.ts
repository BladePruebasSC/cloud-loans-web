// ============================================================================
// Reportes de CLIENTES
// ============================================================================
// El comportamiento de pago sale de `clientScoring.ts`, el mismo motor que alimenta el CRM: no
// se inventa aquí otra forma de medir si un cliente paga bien.

import { isActiveLoan } from '../../portfolioMetrics';
import { scoreClient, type ClientScore } from '../../clientScoring';
import { dateOnly, indexLoans, round2, type CoreDataset } from '../reportDataset';
import { inPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportDefinition, ReportRow } from '../reportTypes';

const BEHAVIOR_LABEL: Record<string, string> = {
  puntual: 'Puntual',
  ocasionalmente_tarde: 'A veces tarde',
  frecuentemente_tarde: 'Frecuentemente tarde',
  moroso: 'Moroso',
  sin_historial: 'Sin historial',
};

const CATEGORY_LABEL: Record<string, string> = {
  caliente: 'Caliente', tibio: 'Tibio', frio: 'Frío', nuevo: 'Nuevo',
};

/** Resumen de cartera por cliente: préstamos, saldo, atraso y lo cobrado. */
const clientPortfolio = (core: CoreDataset) => {
  const porCliente = groupRows(core.loans, l => l.client_id);
  const pagosPorPrestamo = groupRows(core.payments, p => p.loan_id);
  return (clientId: string) => {
    const loans = porCliente.get(clientId) || [];
    const activos = loans.filter(l => isActiveLoan(l.status));
    let balance = 0; let vencido = 0; let peorAtraso = 0; let pagado = 0; let prestado = 0;
    for (const loan of loans) {
      prestado += Number(loan.amount) || 0;
      const o = core.overdueByLoan.get(loan.id);
      if (isActiveLoan(loan.status)) {
        balance += core.balanceByLoan.get(loan.id) ?? loan.remaining_balance ?? 0;
        vencido += o?.overdueAmount || 0;
        peorAtraso = Math.max(peorAtraso, o?.daysOverdue || 0);
      }
      for (const p of pagosPorPrestamo.get(loan.id) || []) {
        pagado += (Number(p.amount) || 0) + (Number(p.late_fee) || 0);
      }
    }
    const abonos = core.capitalPayments
      .filter(c => loans.some(l => l.id === c.loan_id))
      .reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return {
      prestamos: loans.length,
      activos: activos.length,
      prestado: round2(prestado),
      pagado: round2(pagado + abonos),
      balance: round2(balance),
      vencido: round2(vencido),
      peorAtraso,
    };
  };
};

/** Puntuación de un cliente con el motor del CRM. */
const scoreOf = (core: CoreDataset, clientId: string): ClientScore => scoreClient({
  clientId,
  loans: core.loans as any,
  payments: core.payments as any,
  tracking: core.tracking as any,
  sales: [],
  pawns: [],
  todayIso: core.todayIso,
});

export const clientReports: ReportDefinition<CoreDataset>[] = [
  {
    id: 'clients-registered',
    name: 'Clientes registrados',
    category: 'clientes',
    description: 'Clientes dados de alta dentro del período, con su primer préstamo si ya lo tienen.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Registro', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'dni', label: 'Cédula', align: 'left' },
      { key: 'telefono', label: 'Teléfono', align: 'left' },
      { key: 'ciudad', label: 'Ciudad', align: 'left' },
      { key: 'sector', label: 'Sector', align: 'left', hiddenByDefault: true },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'prestado', label: 'Prestado', format: 'money', total: true },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'city', 'neighborhood'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['nuevos clientes', 'altas', 'registrados'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const cartera = clientPortfolio(core);
      const rows = core.clients
        .filter(c => inPeriod(dateOnly(c.created_at), filters))
        .filter(c => !filters.city || String((c as any).city || '') === filters.city)
        .filter(c => !filters.neighborhood || String((c as any).neighborhood || '') === filters.neighborhood)
        .map(c => {
          const p = cartera(c.id);
          return {
            _id: c.id,
            _clientId: c.id,
            fecha: dateOnly(c.created_at),
            cliente: c.full_name,
            dni: c.dni,
            telefono: c.phone,
            ciudad: String((c as any).city || ''),
            sector: String((c as any).neighborhood || ''),
            prestamos: p.prestamos,
            prestado: p.prestado,
            estado: String(c.status || 'active') === 'active' ? 'Activo' : 'Inactivo',
          } as ReportRow;
        });
      const filtradas = applyCommonFilters(rows, filters, 'prestado');
      return {
        rows: filtradas,
        kpis: [
          { key: 'nuevos', label: 'Clientes nuevos', value: filtradas.length, format: 'number' },
          {
            key: 'conPrestamo', label: 'Ya con préstamo', format: 'number',
            value: filtradas.filter(r => (Number(r.prestamos) || 0) > 0).length,
          },
        ],
      };
    },
  },

  {
    id: 'clients-portfolio',
    name: 'Cartera por cliente',
    category: 'clientes',
    description: 'Cuánto debe cada cliente, cuánto ha pagado y cómo viene cumpliendo.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'dni', label: 'Cédula', align: 'left', hiddenByDefault: true },
      { key: 'telefono', label: 'Teléfono', align: 'left', hiddenByDefault: true },
      { key: 'ciudad', label: 'Ciudad', align: 'left' },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'activos', label: 'Activos', format: 'number', total: true },
      { key: 'prestado', label: 'Prestado', format: 'money', total: true },
      { key: 'pagado', label: 'Pagado', format: 'money', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'peorAtraso', label: 'Atraso', format: 'number' },
    ],
    filters: ['search', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'balance', dir: 'desc' },
    keywords: ['clientes con préstamos', 'deuda por cliente', 'cartera'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const cartera = clientPortfolio(core);
      const conPrestamo = new Set(core.loans.map(l => l.client_id));
      const rows = core.clients
        .filter(c => conPrestamo.has(c.id))
        .filter(c => !filters.city || String((c as any).city || '') === filters.city)
        .filter(c => !filters.neighborhood || String((c as any).neighborhood || '') === filters.neighborhood)
        .map(c => {
          const p = cartera(c.id);
          return {
            _id: c.id, _clientId: c.id,
            cliente: c.full_name, dni: c.dni, telefono: c.phone,
            ciudad: String((c as any).city || ''),
            ...p,
          } as ReportRow;
        });
      return {
        rows: applyCommonFilters(rows, filters, 'balance'),
        notes: ['La cartera es a HOY; el período no la recorta.'],
      };
    },
  },

  {
    id: 'clients-behavior',
    name: 'Comportamiento de pago',
    category: 'clientes',
    description: 'Quién paga puntual y quién no, con la puntuación del CRM y el atraso promedio.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'puntuacion', label: 'Puntuación', format: 'number' },
      { key: 'categoria', label: 'Categoría', format: 'badge' },
      { key: 'comportamiento', label: 'Comportamiento', format: 'badge' },
      { key: 'cuotas', label: 'Cuotas evaluadas', format: 'number', total: true },
      { key: 'aTiempo', label: '% a tiempo', format: 'percent' },
      { key: 'atrasoPromedio', label: 'Atraso promedio', format: 'number' },
      { key: 'peorAtraso', label: 'Peor atraso', format: 'number' },
      { key: 'pagado', label: 'Total pagado', format: 'money', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
    ],
    filters: ['search', 'city'],
    defaultSort: { key: 'puntuacion', dir: 'desc' },
    keywords: ['mejores clientes', 'puntualidad', 'score', 'riesgo', 'historial'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const conPrestamo = new Set(core.loans.map(l => l.client_id));
      const rows = core.clients
        .filter(c => conPrestamo.has(c.id))
        .filter(c => !filters.city || String((c as any).city || '') === filters.city)
        .map(c => {
          const s = scoreOf(core, c.id);
          return {
            _id: c.id, _clientId: c.id,
            cliente: c.full_name,
            puntuacion: s.score,
            categoria: CATEGORY_LABEL[s.category] || s.category,
            comportamiento: BEHAVIOR_LABEL[s.behavior] || s.behavior,
            cuotas: s.metrics.installmentsAnalyzed,
            aTiempo: Math.round(s.metrics.onTimeRate * 1000) / 10,
            atrasoPromedio: Math.round(s.metrics.avgDelayDaysOverall),
            peorAtraso: s.metrics.maxDelayDays,
            pagado: round2(s.metrics.totalPaid),
            balance: round2(s.metrics.activeBalance),
          } as ReportRow;
        });
      return {
        rows: applyCommonFilters(rows, filters, 'pagado'),
        notes: ['La puntuación y el comportamiento son los mismos que enseña el CRM del cliente.'],
      };
    },
  },

  {
    id: 'clients-top-paid',
    name: 'Clientes por volumen pagado',
    category: 'clientes',
    description: 'Quiénes han dejado más dinero en el período.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'ciudad', label: 'Ciudad', align: 'left', hiddenByDefault: true },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'pagado', label: 'Pagado en el período', format: 'money', total: true },
      { key: 'balance', label: 'Balance actual', format: 'money', total: true },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
    ],
    filters: ['search', 'city', 'minAmount'],
    defaultSort: { key: 'pagado', dir: 'desc' },
    keywords: ['top', 'mejores', 'volumen', 'ranking'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = indexLoans(core);
      const cartera = clientPortfolio(core);
      const pagos = core.payments.filter(p => inPeriod(dateOnly(p.payment_date), filters));
      const grupos = groupRows(pagos, p => loans.get(p.loan_id)?.client_id || 'sin-cliente');
      const rows: ReportRow[] = [...grupos.entries()]
        .filter(([clientId]) => clientId !== 'sin-cliente')
        .map(([clientId, lista]) => {
          const client = core.clients.find(c => c.id === clientId) as any;
          const p = cartera(clientId);
          return {
            _id: clientId, _clientId: clientId,
            cliente: client?.full_name || 'Cliente',
            ciudad: client?.city || '',
            cobros: lista.length,
            pagado: round2(lista.reduce((s, x) => s + (Number(x.amount) || 0) + (Number(x.late_fee) || 0), 0)),
            balance: p.balance,
            prestamos: p.prestamos,
          };
        });
      return { rows: applyCommonFilters(rows, filters, 'pagado') };
    },
  },

  {
    id: 'clients-by-city',
    name: 'Clientes por ciudad y sector',
    category: 'clientes',
    description: 'Dónde vive la clientela y cuánta cartera hay en cada zona.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'zona', label: 'Ciudad / sector', align: 'left' },
      { key: 'clientes', label: 'Clientes', format: 'number', total: true },
      { key: 'conPrestamo', label: 'Con préstamo', format: 'number', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
    ],
    filters: ['search'],
    defaultSort: { key: 'clientes', dir: 'desc' },
    keywords: ['zona', 'ciudad', 'sector', 'geografía'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const cartera = clientPortfolio(core);
      const grupos = groupRows(core.clients, c => {
        const ciudad = String((c as any).city || '').trim() || 'Sin ciudad';
        const sector = String((c as any).neighborhood || '').trim();
        return sector ? `${ciudad} · ${sector}` : ciudad;
      });
      const rows: ReportRow[] = [...grupos.entries()].map(([zona, lista]) => {
        const resumenes = lista.map(c => cartera(c.id));
        return {
          _id: zona,
          zona,
          clientes: lista.length,
          conPrestamo: resumenes.filter(r => r.prestamos > 0).length,
          balance: round2(resumenes.reduce((s, r) => s + r.balance, 0)),
          vencido: round2(resumenes.reduce((s, r) => s + r.vencido, 0)),
        };
      });
      return { rows: applyCommonFilters(rows, filters, 'balance') };
    },
  },

  {
    id: 'clients-inactive',
    name: 'Clientes sin préstamo activo',
    category: 'clientes',
    description: 'Clientes que no tienen nada vivo hoy: candidatos a volver a prestar.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'telefono', label: 'Teléfono', align: 'left' },
      { key: 'ciudad', label: 'Ciudad', align: 'left' },
      { key: 'prestamos', label: 'Préstamos anteriores', format: 'number', total: true },
      { key: 'pagado', label: 'Pagó históricamente', format: 'money', total: true },
      { key: 'ultimoPago', label: 'Último pago', format: 'date' },
      { key: 'diasSinPagar', label: 'Días sin pagar', format: 'number' },
    ],
    filters: ['search', 'city'],
    defaultSort: { key: 'ultimoPago', dir: 'desc' },
    keywords: ['inactivos', 'recuperar', 'sin préstamo', 'reactivación'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const cartera = clientPortfolio(core);
      const loansByClient = groupRows(core.loans, l => l.client_id);
      const pagosPorPrestamo = groupRows(core.payments, p => p.loan_id);
      const rows = core.clients
        .filter(c => {
          const loans = loansByClient.get(c.id) || [];
          return loans.length > 0 && !loans.some(l => isActiveLoan(l.status));
        })
        .filter(c => !filters.city || String((c as any).city || '') === filters.city)
        .map(c => {
          const p = cartera(c.id);
          const fechas = (loansByClient.get(c.id) || [])
            .flatMap(l => (pagosPorPrestamo.get(l.id) || []).map(x => dateOnly(x.payment_date)))
            .filter(Boolean)
            .sort();
          const ultimo = fechas[fechas.length - 1] || '';
          const dias = ultimo
            ? Math.max(0, Math.round((Date.parse(core.todayIso) - Date.parse(ultimo)) / 86400000))
            : 0;
          return {
            _id: c.id, _clientId: c.id,
            cliente: c.full_name,
            telefono: c.phone,
            ciudad: String((c as any).city || ''),
            prestamos: p.prestamos,
            pagado: p.pagado,
            ultimoPago: ultimo,
            diasSinPagar: dias,
          } as ReportRow;
        });
      return { rows: applyCommonFilters(rows, filters, 'pagado') };
    },
  },
];
