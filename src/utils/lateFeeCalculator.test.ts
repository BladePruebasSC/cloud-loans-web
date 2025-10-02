// Archivo de pruebas para validar los cálculos de mora mejorados
import { 
  calculateLateFee, 
  validateLateFeeCalculation, 
  calculateLateFeeWithValidation,
  getDetailedLateFeeBreakdown,
  testLateFeeCalculation,
  LoanData 
} from './lateFeeCalculator';

/**
 * Pruebas de validación para los cálculos de mora
 */
export const runLateFeeValidationTests = (): void => {
  console.log('🧪 Iniciando pruebas de validación de mora...');
  
  // Prueba 1: Ejemplo de la imagen (10,000 en 4 cuotas, 2% diario)
  const testLoan1: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2024-05-05', // Última cuota
    late_fee_rate: 2, // 2% diario
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly'
  };

  const calculationDate = new Date('2024-09-29');
  const result1 = calculateLateFee(testLoan1, calculationDate);
  
  console.log('📊 Prueba 1 - Ejemplo de la imagen:');
  console.log('  - Mora calculada:', result1.totalLateFee);
  console.log('  - Días de atraso:', result1.daysOverdue);
  
  // Validar con el resultado esperado de la imagen ($45,200)
  const isValid1 = validateLateFeeCalculation(testLoan1, 45200, calculationDate);
  console.log('  - ¿Es válido?', isValid1 ? '✅' : '❌');
  
  // Prueba 2: Cálculo con validación de precisión
  const resultWithValidation = calculateLateFeeWithValidation(testLoan1, calculationDate);
  console.log('📊 Prueba 2 - Con validación de precisión:');
  console.log('  - Mora calculada:', resultWithValidation.totalLateFee);
  console.log('  - ¿Es válido?', resultWithValidation.isValid ? '✅' : '❌');
  console.log('  - Precisión:', resultWithValidation.precision);
  
  // Prueba 3: Desglose detallado
  const breakdown = getDetailedLateFeeBreakdown(testLoan1, calculationDate);
  console.log('📊 Prueba 3 - Desglose detallado:');
  console.log('  - Total mora:', breakdown.totalLateFee);
  console.log('  - Desglose por cuota:');
  breakdown.breakdown.forEach((item, index) => {
    console.log(`    Cuota ${item.installment}: ${item.daysOverdue} días, $${item.lateFee.toLocaleString()}`);
  });
  
  // Prueba 4: Diferentes tipos de cálculo
  const testLoan2: LoanData = {
    ...testLoan1,
    late_fee_calculation_type: 'monthly'
  };
  
  const result2 = calculateLateFee(testLoan2, calculationDate);
  console.log('📊 Prueba 4 - Cálculo mensual:');
  console.log('  - Mora calculada:', result2.totalLateFee);
  
  // Prueba 5: Cálculo compuesto
  const testLoan3: LoanData = {
    ...testLoan1,
    late_fee_calculation_type: 'compound'
  };
  
  const result3 = calculateLateFee(testLoan3, calculationDate);
  console.log('📊 Prueba 5 - Cálculo compuesto:');
  console.log('  - Mora calculada:', result3.totalLateFee);
  
  console.log('🧪 Pruebas completadas');
};

/**
 * Función para ejecutar todas las pruebas
 */
export const runAllLateFeeTests = (): void => {
  console.log('🚀 Ejecutando todas las pruebas de mora...');
  
  // Ejecutar función de prueba original
  testLateFeeCalculation();
  
  // Ejecutar nuevas pruebas de validación
  runLateFeeValidationTests();
  
  console.log('✅ Todas las pruebas completadas');
};

// Exportar para uso en desarrollo
export default {
  runLateFeeValidationTests,
  runAllLateFeeTests
};
