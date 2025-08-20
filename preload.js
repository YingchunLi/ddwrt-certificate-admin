const { contextBridge } = require('electron');
try {
  // Ensure @electron/remote works when contextIsolation is enabled in future
  const remoteMain = require('@electron/remote/main');
  if (remoteMain && remoteMain.initialize) {
    // already initialized in main, this is a no-op if called again
    remoteMain.initialize();
  }
} catch (_) {}

// No explicit APIs are bridged for now; renderer uses window.require because nodeIntegration is true.
// This preload exists to keep a place for future, safer bridges if needed.

