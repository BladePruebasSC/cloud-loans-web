/**
 * Utilidades para enviar recibos por WhatsApp
 */

/**
 * Formatea un número de teléfono para WhatsApp
 * Elimina espacios, guiones, paréntesis y el signo +
 */
export const formatPhoneForWhatsApp = (phone: string): string => {
  if (!phone) return '';
  
  // Eliminar espacios, guiones, paréntesis y el signo +
  let formatted = phone.replace(/[\s\-\(\)\+]/g, '');
  
  // Si no empieza con código de país, agregar 1 (para República Dominicana)
  if (!formatted.startsWith('1') && formatted.length === 10) {
    formatted = '1' + formatted;
  }
  
  return formatted;
};

/**
 * Genera un mensaje predefinido para el recibo
 */
export const generateReceiptMessage = (type: 'loan' | 'sale', clientName: string, amount: number): string => {
  const amountFormatted = new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
    minimumFractionDigits: 2
  }).format(amount);

  if (type === 'loan') {
    return `Hola ${clientName}, te enviamos tu recibo de pago de préstamo por un monto de ${amountFormatted}. Gracias por tu pago.`;
  } else {
    return `Hola ${clientName}, te enviamos tu recibo de compra/venta por un monto de ${amountFormatted}. Gracias por tu preferencia.`;
  }
};

/**
 * Abre WhatsApp Web/App con el número del cliente y un mensaje predefinido
 */
export const openWhatsApp = (phone: string, message: string): void => {
  if (!phone) {
    console.error('No se proporcionó un número de teléfono');
    return;
  }

  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) {
    console.error('No se pudo formatear el número de teléfono');
    return;
  }

  // Codificar el mensaje para URL
  const encodedMessage = encodeURIComponent(message);
  
  // URL de WhatsApp
  const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  
  // Abrir en nueva pestaña
  window.open(whatsappUrl, '_blank');
};

/**
 * Genera el recibo en PDF y lo descarga, luego abre WhatsApp
 */
export const sendReceiptViaWhatsApp = async (
  phone: string,
  clientName: string,
  receiptHTML: string,
  receiptType: 'loan' | 'sale',
  amount: number,
  fileName?: string
): Promise<void> => {
  try {
    // Importar jsPDF y html2canvas dinámicamente
    const { default: jsPDF } = await import('jspdf');
    
    // Crear un iframe temporal para renderizar el HTML
    const iframe = document.createElement('iframe');
    iframe.style.position = 'absolute';
    iframe.style.left = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    document.body.appendChild(iframe);
    
    // Escribir el HTML en el iframe
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      throw new Error('No se pudo acceder al documento del iframe');
    }
    
    iframeDoc.open();
    iframeDoc.write(receiptHTML);
    iframeDoc.close();
    
    // Esperar a que el contenido se renderice
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Crear PDF usando jsPDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    
    // Extraer texto del HTML renderizado de forma estructurada
    const body = iframeDoc.body;
    const receiptContainer = body.querySelector('.receipt-container') || body;
    
    // Extraer título
    const titleElement = receiptContainer.querySelector('.receipt-title');
    const title = titleElement?.textContent?.trim() || 'RECIBO DE PAGO';
    
    // Extraer número de recibo
    const receiptNumberElement = receiptContainer.querySelector('.receipt-number');
    const receiptNumber = receiptNumberElement?.textContent?.trim() || '';
    
    let yPos = margin;
    
    // Título
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;
    
    // Número de recibo
    if (receiptNumber) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(receiptNumber, pageWidth / 2, yPos, { align: 'center' });
      yPos += 8;
    }
    
    // Extraer secciones
    const sections = receiptContainer.querySelectorAll('.section');
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    
    sections.forEach((section) => {
      // Título de sección
      const sectionTitle = section.querySelector('.section-title');
      if (sectionTitle) {
        if (yPos > pageHeight - margin - 20) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        const titleText = sectionTitle.textContent?.trim() || '';
        pdf.text(titleText, margin, yPos);
        yPos += 8;
      }
      
      // Contenido de la sección
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      
      const infoRows = section.querySelectorAll('.info-row');
      infoRows.forEach((row) => {
        if (yPos > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }
        const rowText = row.textContent?.trim() || '';
        if (rowText) {
          const lines = pdf.splitTextToSize(rowText, pageWidth - (margin * 2));
          lines.forEach((line: string) => {
            if (yPos > pageHeight - margin) {
              pdf.addPage();
              yPos = margin;
            }
            pdf.text(line, margin, yPos);
            yPos += 6;
          });
        }
      });
      
      yPos += 5; // Espacio entre secciones
    });
    
    // Sección de montos (amount-section)
    const amountSection = receiptContainer.querySelector('.amount-section');
    if (amountSection) {
      if (yPos > pageHeight - margin - 30) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      const amountTitle = amountSection.querySelector('.section-title')?.textContent?.trim() || '';
      if (amountTitle) {
        pdf.text(amountTitle, margin, yPos);
        yPos += 8;
      }
      
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      
      const amountRows = amountSection.querySelectorAll('.info-row');
      amountRows.forEach((row) => {
        const rowText = row.textContent?.trim() || '';
        if (rowText) {
          const lines = pdf.splitTextToSize(rowText, pageWidth - (margin * 2));
          lines.forEach((line: string) => {
            pdf.text(line, margin, yPos);
            yPos += 6;
          });
        }
      });
      
      // Total
      const totalElement = amountSection.querySelector('.total-amount');
      if (totalElement) {
        yPos += 5;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        const totalText = totalElement.textContent?.trim() || '';
        pdf.text(totalText, pageWidth / 2, yPos, { align: 'center' });
        yPos += 10;
      }
    }
    
    const pdfBlob = pdf.output('blob');
    
    // Limpiar iframe
    document.body.removeChild(iframe);
    
    // Descargar el PDF
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || `recibo_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Generar mensaje y abrir WhatsApp
    const message = generateReceiptMessage(receiptType, clientName, amount);
    
    // Esperar un momento para que el PDF se descargue antes de abrir WhatsApp
    setTimeout(() => {
      openWhatsApp(phone, message);
    }, 500);
    
  } catch (error) {
    console.error('Error generando PDF o abriendo WhatsApp:', error);
    // Si falla la generación del PDF, al menos intentar abrir WhatsApp
    const message = generateReceiptMessage(receiptType, clientName, amount);
    openWhatsApp(phone, message);
  }
};

