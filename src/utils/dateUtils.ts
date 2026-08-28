// Utilidades para manejo de fechas con zona horaria de República Dominicana
// Zona horaria: America/Santo_Domingo (UTC-4)

/**
 * Obtiene la fecha actual en la zona horaria de Santo Domingo
 */
export const getCurrentDateInSantoDomingo = (): Date => {
  const now = new Date();

  // CORRECCIÓN (auditoría de cálculos): antes esto formateaba "now" como texto localizado
  // (`toLocaleString`) y volvía a parsear ese texto con `new Date(string)`. Parsear una fecha a
  // partir de texto no-ISO es "implementation-defined" en el estándar de JavaScript — el resultado
  // puede variar entre motores/navegadores, y cualquier variación en el formato del texto puede
  // desplazar el día calculado (esto causaba, por ejemplo, que en préstamos indefinidos de pago
  // diario apareciera como "pendiente" la cuota de mañana antes de que llegara). Se reemplaza por
  // `Intl.DateTimeFormat.formatToParts`, que entrega año/mes/día/hora ya calculados para la zona
  // horaria de Santo Domingo directamente como números, sin pasar por texto ni volver a parsear.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);

  const getPart = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  // Con hour12:false, algunos motores devuelven "24" para la medianoche en vez de "00".
  const hour = getPart('hour') % 24;
  const minute = getPart('minute');
  const second = getPart('second');

  return new Date(year, month - 1, day, hour, minute, second);
};

/**
 * Convierte un instante a los componentes de fecha/hora que se ven en Santo Domingo.
 *
 * CORRECCIÓN (auditoría 2026-08-28): antes hacía `new Date(date.toLocaleString(...))`,
 * exactamente el anti-patrón que `getCurrentDateInSantoDomingo` ya documentaba como roto
 * unas líneas más arriba: se formateaba a texto localizado y se volvía a parsear con
 * `new Date(string)`, cuyo comportamiento es "implementation-defined" (Safari devolvía
 * Invalid Date). Ahora se usa `Intl.DateTimeFormat.formatToParts`, que entrega los
 * componentes ya calculados para la zona horaria como números.
 */
export const toSantoDomingoTime = (date: Date): Date => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const getPart = (type: string) => Number(parts.find(p => p.type === type)?.value || 0);
  return new Date(
    getPart('year'),
    getPart('month') - 1,
    getPart('day'),
    getPart('hour') % 24, // algunos motores devuelven "24" para medianoche con hour12:false
    getPart('minute'),
    getPart('second')
  );
};

/**
 * Crea una fecha calendario (año/mes/día) sin componente horario.
 *
 * CORRECCIÓN (auditoría 2026-08-28): antes construía la fecha en la zona del equipo y la
 * "convertía" a Santo Domingo con el round-trip roto de `toSantoDomingoTime`. Como el
 * argumento ya es una fecha calendario explícita (no un instante), esa conversión no
 * aportaba nada y en cualquier equipo con zona horaria al este de Santo Domingo (UTC+X)
 * restaba un día: TODAS las fechas de vencimiento generadas al crear un préstamo salían
 * corridas 24 horas hacia atrás. Un día calendario no depende de la zona horaria.
 */
export const createDateInSantoDomingo = (year: number, month: number, day: number): Date => {
  return new Date(year, month - 1, day); // month es 1-indexado en la firma, 0-indexado en Date
};

/**
 * Calcula la diferencia en días entre dos fechas, considerando la zona horaria de Santo Domingo
 */
export const calculateDaysDifference = (date1: Date, date2: Date): number => {
  // CORREGIR: Usar fechas directamente sin conversión de zona horaria
  // para evitar problemas de cálculo
  
  // Calcular diferencia en milisegundos y convertir a días
  const diffInMs = date2.getTime() - date1.getTime();
  const daysDiff = diffInMs / (1000 * 60 * 60 * 24);
  const finalDays = Math.floor(daysDiff);
  
  // Usar Math.floor para obtener días completos
  return finalDays;
};

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para Santo Domingo
 */
export const getCurrentDateString = (): string => {
  // CORRECCIÓN (auditoría 2026-08-28): usaba el round-trip roto
  // `new Date(toLocaleString(...))`. Se delega en la versión ya corregida para que
  // ambas funciones no puedan devolver días distintos.
  return getCurrentDateStringForSantoDomingo();
};

/**
 * Formatea una fecha para mostrar en la zona horaria de Santo Domingo
 */
export const formatDateForSantoDomingo = (date: Date): string => {
  // `date` aquí SÍ es un instante (timestamp), así que reinterpretarlo en la zona horaria
  // de Santo Domingo es correcto (a diferencia de formatDateStringForSantoDomingo).
  return date.toLocaleDateString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Formatea una fecha string (YYYY-MM-DD) para mostrar en la zona horaria de Santo Domingo
 * Maneja correctamente las fechas para evitar problemas de zona horaria
 */
export const formatDateStringForSantoDomingo = (dateString: string): string => {
  if (!dateString) return '-';
  
  try {
    // Parsear la fecha como fecha local (no UTC) para evitar problemas de zona horaria
    const [year, month, day] = String(dateString).split('T')[0].split('-').map(Number);
    if (!year || !month || !day) return '-';
    const date = new Date(year, month - 1, day); // month es 0-indexado, crear como fecha local

    // CORRECCIÓN (auditoría 2026-08-28): antes se pasaba `timeZone: 'America/Santo_Domingo'`
    // a una fecha que YA se había construido como medianoche LOCAL del equipo. Al reinterpretar
    // esa medianoche en otra zona horaria, cualquier equipo al este de Santo Domingo mostraba
    // el DÍA ANTERIOR (medianoche en UTC+2 = 18:00 del día previo en Santo Domingo). Como
    // `dateString` es una fecha calendario pura, no un instante, se formatea tal cual.
    return date.toLocaleDateString('es-DO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '-';
  }
};

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD para Santo Domingo
 */
export const getCurrentDateStringForSantoDomingo = (): string => {
  const now = getCurrentDateInSantoDomingo();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Formatea un timestamp con hora en la zona horaria de Santo Domingo.
 *
 * CORRECCIÓN (auditoría 2026-08-28): antes sumaba manualmente "+2 horas" al timestamp y
 * lo formateaba en la zona horaria del equipo. Ese +2 era un parche empírico que solo
 * cuadraba en la máquina donde se escribió: en un equipo ya configurado en Santo Domingo
 * mostraba las horas 2 h adelantadas, y en cualquier otra zona el desfase era distinto.
 * Ahora se formatea el instante real declarando la zona horaria, sin sumar nada.
 */
export const formatDateTimeWithOffset = (dateString: string): string => {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';

  return date.toLocaleString('es-DO', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Calcula una fecha de vencimiento agregando días a una fecha de inicio,
 * manejando correctamente la zona horaria de Santo Domingo (UTC-4)
 * @param startDateString Fecha de inicio en formato YYYY-MM-DD
 * @param daysToAdd Número de días a agregar
 * @returns Fecha de vencimiento en formato YYYY-MM-DD
 */
export const calculateDueDateInSantoDomingo = (startDateString: string, daysToAdd: number): string => {
  if (!startDateString) return '';
  
  // Parsear la fecha de inicio como fecha local en Santo Domingo
  // Usar 'T12:00:00' para evitar problemas de zona horaria (mediodía local)
  const [year, month, day] = startDateString.split('-').map(Number);
  const startDate = new Date(year, month - 1, day); // month es 0-indexado
  
  // Agregar los días
  const dueDate = new Date(startDate);
  dueDate.setDate(startDate.getDate() + daysToAdd);
  
  // Formatear como YYYY-MM-DD
  const dueYear = dueDate.getFullYear();
  const dueMonth = String(dueDate.getMonth() + 1).padStart(2, '0');
  const dueDay = String(dueDate.getDate()).padStart(2, '0');
  
  return `${dueYear}-${dueMonth}-${dueDay}`;
};