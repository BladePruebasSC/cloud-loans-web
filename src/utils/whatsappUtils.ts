/**
 * Utilidades para enviar recibos por WhatsApp
 */

import { toast } from 'sonner';

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
 * Envía un mensaje con documento adjunto usando WhatsApp Business API
 */
const sendWhatsAppMessageWithDocument = async (
  phone: string,
  message: string,
  documentUrl: string,
  fileName: string,
  accessToken?: string,
  phoneNumberId?: string
): Promise<boolean> => {
  if (!accessToken || !phoneNumberId) {
    console.log('⚠️ WhatsApp Business API no configurada, usando método alternativo');
    return false;
  }

  try {
    console.log('📱 Enviando mensaje con documento usando WhatsApp Business API...');
    
    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'document',
        document: {
          link: documentUrl,
          filename: fileName,
          caption: message
        }
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ Mensaje enviado exitosamente usando WhatsApp Business API');
      return true;
    } else {
      console.error('❌ Error enviando mensaje con WhatsApp Business API:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Error en WhatsApp Business API:', error);
    return false;
  }
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
  fileName?: string,
  companyId?: string
): Promise<void> => {
  console.log('📱 sendReceiptViaWhatsApp iniciado', { phone, clientName, receiptType, amount });
  
  if (!phone) {
    throw new Error('No se proporcionó un número de teléfono');
  }
  
  // Formatear el teléfono (fuera del try para que esté disponible en el catch)
  const formattedPhone = formatPhoneForWhatsApp(phone);
  console.log('📱 Teléfono formateado:', { original: phone, formatted: formattedPhone });
  
  if (!formattedPhone) {
    throw new Error('No se pudo formatear el número de teléfono');
  }
  
  try {
    // Importar jsPDF y html2canvas dinámicamente
    console.log('📱 Importando jsPDF...');
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
    
    // Subir PDF a Supabase Storage para obtener URL pública
    console.log('📱 Subiendo PDF a Supabase Storage...');
    const { supabase } = await import('@/integrations/supabase/client');
    const finalFileName = fileName || `recibo_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    const filePath = `receipts/${Date.now()}_${finalFileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: false
      });
    
    let pdfUrl: string | null = null;
    
    if (uploadError) {
      console.error('❌ Error subiendo PDF a Storage:', uploadError);
      // Continuar sin URL pública, solo descargar localmente
    } else {
      console.log('✅ PDF subido a Storage:', uploadData.path);
      
      // Obtener URL pública firmada (válida por 1 hora)
      const { data: urlData } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 3600); // 1 hora de validez
      
      if (urlData) {
        pdfUrl = urlData.signedUrl;
        console.log('✅ URL pública del PDF obtenida:', pdfUrl);
      }
    }
    
    // Descargar el PDF localmente también
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = finalFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Generar mensaje
    const message = generateReceiptMessage(receiptType, clientName, amount);
    console.log('📱 Mensaje generado:', message);
    
    // Intentar usar WhatsApp Business API si está disponible y tenemos URL del PDF
    if (pdfUrl && companyId) {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Obtener configuración de WhatsApp Business API desde company_settings
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('whatsapp_api_token, whatsapp_phone_number_id')
        .eq('user_id', companyId)
        .single();
      
      if (companySettings?.whatsapp_api_token && companySettings?.whatsapp_phone_number_id) {
        console.log('📱 Intentando enviar usando WhatsApp Business API...');
        const sent = await sendWhatsAppMessageWithDocument(
          formattedPhone,
          message,
          pdfUrl,
          finalFileName,
          companySettings.whatsapp_api_token,
          companySettings.whatsapp_phone_number_id
        );
        
        if (sent) {
          console.log('✅ Recibo enviado automáticamente por WhatsApp Business API');
          toast.success('Recibo enviado automáticamente por WhatsApp');
          return; // Salir si se envió exitosamente
        }
      }
    }
    
    // Si no se pudo enviar automáticamente, abrir WhatsApp Web con el mensaje
    console.log('📱 Abriendo WhatsApp Web con:', { phone: formattedPhone, message, pdfUrl });
    
    // Si tenemos URL del PDF, agregarla al mensaje
    let messageWithUrl = message;
    if (pdfUrl) {
      messageWithUrl += `\n\n📎 Descarga tu recibo PDF aquí: ${pdfUrl}`;
    }
    
    // Esperar un momento antes de abrir WhatsApp
    await new Promise(resolve => setTimeout(resolve, 500));
    
    openWhatsApp(formattedPhone, messageWithUrl);
    console.log('✅ WhatsApp abierto');
    
  } catch (error: any) {
    console.error('❌ Error generando PDF o abriendo WhatsApp:', error);
    // Si falla la generación del PDF, al menos intentar abrir WhatsApp
    try {
      const message = generateReceiptMessage(receiptType, clientName, amount);
      console.log('📱 Intentando abrir WhatsApp sin PDF...', { phone: formattedPhone });
      openWhatsApp(formattedPhone, message);
    } catch (fallbackError) {
      console.error('❌ Error al abrir WhatsApp como fallback:', fallbackError);
      throw error; // Re-lanzar el error original
    }
  }
};

