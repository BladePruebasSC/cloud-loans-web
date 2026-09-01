import { defineConfig } from 'vitest/config';
import path from 'node:path';

// ============================================================================
// Configuración de pruebas
// ============================================================================
// Entorno `node`: las suites actuales cubren la LÓGICA FINANCIERA PURA (utilidades sin
// acceso a datos ni a la interfaz), que es donde está el riesgo real del sistema. Cuando se
// añadan pruebas de componentes habrá que instalar jsdom y cambiar `environment` por archivo
// con `// @vitest-environment jsdom`.
//
// No se define `setupFiles` ni mocks globales a propósito: todo lo que se prueba aquí es
// determinista y no toca red, reloj ni Supabase.

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // `import.meta.env` no existe fuera de Vite; se define vacío para que el código que lee
    // variables de entorno (p. ej. la clave de Google Maps) caiga en sus valores por defecto.
    env: {},
    coverage: {
      provider: 'v8',
      reportsOnly: false,
      include: ['src/utils/**/*.ts', 'src/data/**/*.ts'],
      exclude: ['**/*.test.ts', '**/__tests__/**'],
    },
  },
});
