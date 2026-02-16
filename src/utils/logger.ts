const timestamp = () => new Date().toISOString();

export const logger = {
  info(message: string, data?: unknown) {
    console.log(`[${timestamp()}] INFO: ${message}`, data ?? "");
  },
  error(message: string, error?: unknown) {
    console.error(`[${timestamp()}] ERROR: ${message}`, error ?? "");
  },
  warn(message: string, data?: unknown) {
    console.warn(`[${timestamp()}] WARN: ${message}`, data ?? "");
  },
  debug(message: string, data?: unknown) {
    if (process.env.DEBUG === "true") {
      console.log(`[${timestamp()}] DEBUG: ${message}`, data ?? "");
    }
  },
};
