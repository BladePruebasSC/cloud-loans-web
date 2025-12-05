import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from '@/lib/utils';

/**
 * Exporta datos a CSV
 */
export const exportToCSV = (data: any[], filename: string) => {
  if (data.length === 0) {
    throw new Error('No hay datos para exportar');
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // Escapar comillas y envolver en comillas si contiene comas o comillas
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Exporta datos a Excel
 */
export const exportToExcel = (data: any[], filename: string, sheetName: string = 'Datos') => {
  if (data.length === 0) {
    throw new Error('No hay datos para exportar');
  }

  // Crear workbook
  const wb = XLSX.utils.book_new();
  
  // Convertir datos a worksheet
  const ws = XLSX.utils.json_to_sheet(data);
  
  // Ajustar ancho de columnas
  const maxWidth = 50;
  const wscols = Object.keys(data[0]).map(() => ({ wch: maxWidth }));
  ws['!cols'] = wscols;
  
  // Agregar worksheet al workbook
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  // Descargar archivo
  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Exporta múltiples hojas a Excel
 */
export const exportToExcelMultiSheet = (
  sheets: Array<{ name: string; data: any[] }>,
  filename: string
) => {
  if (sheets.length === 0) {
    throw new Error('No hay hojas para exportar');
  }

  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, data }) => {
    if (data.length > 0) {
      const ws = XLSX.utils.json_to_sheet(data);
      const maxWidth = 50;
      const wscols = Object.keys(data[0]).map(() => ({ wch: maxWidth }));
      ws['!cols'] = wscols;
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
  });

  XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

/**
 * Exporta datos a PDF
 */
export const exportToPDF = (
  data: any[],
  filename: string,
  title: string,
  columns?: string[]
) => {
  if (data.length === 0) {
    throw new Error('No hay datos para exportar');
  }

  const doc = new jsPDF('l', 'mm', 'a4'); // Landscape orientation
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Título
  doc.setFontSize(16);
  doc.text(title, 14, 15);
  
  // Fecha de exportación
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Exportado el: ${new Date().toLocaleDateString('es-DO', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`,
    14,
    22
  );

  // Preparar columnas
  const headers = columns || Object.keys(data[0]);
  const rows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      // Formatear valores monetarios
      if (header.toLowerCase().includes('amount') || 
          header.toLowerCase().includes('monto') ||
          header.toLowerCase().includes('precio') ||
          header.toLowerCase().includes('balance') ||
          header.toLowerCase().includes('saldo') ||
          header.toLowerCase().includes('interes') ||
          header.toLowerCase().includes('mora')) {
        return typeof value === 'number' ? formatCurrency(value) : String(value);
      }
      // Formatear fechas
      if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
        return new Date(value).toLocaleDateString('es-DO');
      }
      return String(value);
    })
  );

  // Agregar tabla
  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 28,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [66, 139, 202], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { top: 28, right: 14, bottom: 14, left: 14 },
    didDrawPage: (data) => {
      // Footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
    }
  });

  // Descargar PDF
  doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
};

/**
 * Formatea datos para exportación (limpia y formatea valores)
 */
export const formatDataForExport = (data: any[]): any[] => {
  return data.map(item => {
    const formatted: any = {};
    Object.keys(item).forEach(key => {
      const value = item[key];
      
      // Omitir objetos anidados complejos
      if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
        if (Array.isArray(value)) {
          formatted[key] = value.length > 0 ? JSON.stringify(value) : '';
        } else {
          // Intentar extraer valores útiles de objetos
          if (value.full_name) formatted[`${key}_nombre`] = value.full_name;
          if (value.dni) formatted[`${key}_dni`] = value.dni;
          if (value.email) formatted[`${key}_email`] = value.email;
          if (value.phone) formatted[`${key}_telefono`] = value.phone;
        }
      } else {
        formatted[key] = value;
      }
    });
    return formatted;
  });
};

/**
 * Genera nombre de archivo con timestamp
 */
export const generateFilename = (baseName: string, extension: string = ''): string => {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
  return `${baseName}_${dateStr}_${timeStr}${extension}`;
};

/**
 * Lee un archivo CSV y lo convierte a array de objetos
 */
export const importFromCSV = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          reject(new Error('El archivo CSV está vacío'));
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
          const obj: any = {};
          headers.forEach((header, index) => {
            obj[header] = values[index] || '';
          });
          return obj;
        });

        resolve(data);
      } catch (error) {
        reject(new Error(`Error al leer CSV: ${error instanceof Error ? error.message : 'Error desconocido'}`));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsText(file);
  });
};

/**
 * Lee un archivo Excel y lo convierte a array de objetos
 */
export const importFromExcel = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        resolve(jsonData);
      } catch (error) {
        reject(new Error(`Error al leer Excel: ${error instanceof Error ? error.message : 'Error desconocido'}`));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo'));
    reader.readAsBinaryString(file);
  });
};

/**
 * Valida los datos importados antes de insertarlos
 */
export const validateImportedData = (data: any[], requiredFields: string[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (data.length === 0) {
    errors.push('No hay datos para importar');
    return { valid: false, errors };
  }

  // Verificar que todos los campos requeridos estén presentes
  const firstRow = data[0];
  const missingFields = requiredFields.filter(field => !(field in firstRow));
  if (missingFields.length > 0) {
    errors.push(`Campos faltantes: ${missingFields.join(', ')}`);
  }

  // Validar que no haya filas vacías
  const emptyRows = data.filter((row, index) => {
    return Object.values(row).every(val => val === '' || val === null || val === undefined);
  });
  if (emptyRows.length > 0) {
    errors.push(`Se encontraron ${emptyRows.length} fila(s) vacía(s)`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

