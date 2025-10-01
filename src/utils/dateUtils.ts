// Utilidades para manejo de fechas con zona horaria de República Dominicana
// Zona horaria: America/Santo_Domingo (UTC-4)

/**
 * Obtiene la fecha actual en la zona horaria de Santo Domingo
 */
export const getCurrentDateInSantoDomingo = (): Date => {
  const now = new Date();
  // Convertir a zona horaria de Santo Domingo (UTC-4)
  const santoDomingoTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
  return santoDomingoTime;
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
  // Convertir ambas fechas a Santo Domingo
  const santoDomingoDate1 = toSantoDomingoTime(date1);
  const santoDomingoDate2 = toSantoDomingoTime(date2);
  
  // Calcular diferencia en milisegundos y convertir a días
  const diffInMs = santoDomingoDate2.getTime() - santoDomingoDate1.getTime();
  return Math.ceil(diffInMs / (1000 * 60 * 60 * 24));
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
