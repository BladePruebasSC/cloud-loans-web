import { useEffect, useRef } from 'react';

export const useMultiTabSync = () => {
  const tabId = useRef<string>(`tab_${Date.now()}_${Math.random()}`);
  const isActiveTab = useRef<boolean>(true);

  useEffect(() => {
    // Marcar esta pestaña como activa
    const markAsActive = () => {
      isActiveTab.current = true;
      sessionStorage.setItem('activeTab', tabId.current);
    };

    // Marcar esta pestaña como inactiva
    const markAsInactive = () => {
      isActiveTab.current = false;
    };

    // Detectar cuando la pestaña se vuelve visible/invisible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markAsActive();
      } else {
        markAsInactive();
      }
    };

    // Detectar cuando la ventana gana/pierde foco
    const handleFocus = () => markAsActive();
    const handleBlur = () => markAsInactive();

    // Detectar cambios en localStorage de otras pestañas
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'activeTab' && e.newValue !== tabId.current) {
        console.log('🔄 Otra pestaña se volvió activa');
      }
    };

    // Event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('storage', handleStorageChange);

    // Marcar como activa inicialmente
    markAsActive();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('storage', handleStorageChange);
      
      // Limpiar al cerrar la pestaña
      if (isActiveTab.current) {
        sessionStorage.removeItem('activeTab');
      }
    };
  }, []);

  return {
    tabId: tabId.current,
    isActiveTab: isActiveTab.current
  };
};
