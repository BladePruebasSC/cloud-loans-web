// Utilidades para manejo de fechas con zona horaria de República Dominicana
// Zona horaria: America/Santo_Domingo (UTC-4)

/**
 * Obtiene la fecha actual en la zona horaria de Santo Domingo
 */
export const getCurrentDateInSantoDomingo = (): Date => {
  const now = new Date();
  
  // Convertir a la zona horaria de Santo Domingo
  const santoDomingoDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
  
  return santoDomingoDate;
};

/**
 * Convierte una fecha a la zona horaria de Santo Domingo
 */
export const toSantoDomingoTime = (date: Date): Date => {
  return new Date(date.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
};

/**
 * Crea una fecha en formato YYYY-MM-DD para la zona horaria de Santo Domingo
 */
export const createDateInSantoDomingo = (year: number, month: number, day: number): Date => {
  // Crear fecha en zona horaria local y luego convertir a Santo Domingo
  const localDate = new Date(year, month - 1, day); // month es 0-indexado
  return toSantoDomingoTime(localDate);
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
  const now = new Date();
  // Obtener la fecha en zona horaria de Santo Domingo
  const santoDomingoDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
  
  // Formatear como YYYY-MM-DD
  const year = santoDomingoDate.getFullYear();
  const month = String(santoDomingoDate.getMonth() + 1).padStart(2, '0');
  const day = String(santoDomingoDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

/**
 * Formatea una fecha para mostrar en la zona horaria de Santo Domingo
 */
export const formatDateForSantoDomingo = (date: Date): string => {
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
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month es 0-indexado, crear como fecha local
    
    // Formatear en zona horaria de Santo Domingo
    return date.toLocaleDateString('es-DO', {
      timeZone: 'America/Santo_Domingo',
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
 * Formatea una fecha con hora aplicando un offset de +2 horas para corrección de zona horaria
 */
export const formatDateTimeWithOffset = (dateString: string): string => {
  const date = new Date(dateString);
  // Agregar 2 horas al timestamp
  date.setHours(date.getHours() + 2);
  
  return date.toLocaleString('es-DO', {
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