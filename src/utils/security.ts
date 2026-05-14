import { useEffect, useState, createElement } from 'react';

export const useGuardBot = (onLockdown: () => void) => {
  const [threatLevel, setThreatLevel] = useState(0);

  useEffect(() => {
    // 1. Anti-Debugger / Console Detection
    const interval = setInterval(() => {
      try {
        const check = () => {
          const start = Date.now();
          debugger; 
          if (Date.now() - start > 100) {
            setThreatLevel(prev => prev + 5);
          }
        };
        check();
      } catch (e) {}
    }, 1000);

    // 2. Monitoring for Global Variable Injections
    const integrityCheck = setInterval(() => {
      const suspiciousVars = ['hack', 'bypass', 'backdoor', 'exploit'];
      suspiciousVars.forEach(v => {
        if ((window as any)[v]) setThreatLevel(prev => prev + 10);
      });
    }, 2000);

    // 3. Behavior Monitoring
    const handleFastClicks = () => setThreatLevel(prev => prev + 0.2);
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    
    const handleKeys = (e: KeyboardEvent) => {
      // Blocking sensitive shortcuts
      if (
        e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) || 
        (e.ctrlKey && e.key === 'u')
      ) {
        e.preventDefault();
        setThreatLevel(prev => prev + 5);
      }
    };

    window.addEventListener('click', handleFastClicks);
    window.addEventListener('keydown', handleKeys);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      clearInterval(interval);
      clearInterval(integrityCheck);
      window.removeEventListener('click', handleFastClicks);
      window.removeEventListener('keydown', handleKeys);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    if (threatLevel >= 15) {
      onLockdown();
      // Wipe sensitive trace
      localStorage.clear();
      sessionStorage.clear();
      // Attempt to crash or redirect malicious session
      window.location.replace("about:blank");
    }
  }, [threatLevel, onLockdown]);

  return { threatLevel };
};

export const GuardBotOverlay = () => {
  return createElement('div', { 
    className: "fixed inset-0 z-[9999] bg-slate flex flex-col items-center justify-center text-white p-10 text-center" 
  }, [
    createElement('div', { key: 'icon', className: "w-20 h-20 bg-rose rounded-full flex items-center justify-center mb-6 animate-pulse" }, "🛡️"),
    createElement('h1', { key: 'title', className: "text-3xl font-black italic mb-4" }, "PROTEÇÃO ATIVA"),
    createElement('p', { key: 'text', className: "text-slate-soft max-w-sm uppercase tracking-widest text-[0.6rem] font-bold" }, 
      "O GuardBot detectou uma tentativa de violação de integridade. A conexão foi encerrada para proteger os dados da Chelly Shop."
    ),
    createElement('div', { key: 'code', className: "mt-8 text-[0.5rem] font-mono text-rose/30" }, "ERR_SECURITY_VIOLATION_V4")
  ]);
};
