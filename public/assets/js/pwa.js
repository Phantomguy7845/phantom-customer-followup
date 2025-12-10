(() => {
  if (!('serviceWorker' in navigator)) return;

  const register = async () => {
    try {
      await navigator.serviceWorker.register('/service-worker.js');
      console.info('[pwa] service worker registered');
    } catch (error) {
      console.warn('[pwa] service worker registration failed', error);
    }
  };

  window.addEventListener('load', register);
})();
