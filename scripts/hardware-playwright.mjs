// Optional adapter for WebGL gates using PLAYWRIGHT_MODULE. Preserve the gate's
// production-shader assertions while selecting the host's headed GL driver.
// The caller must inspect the reported renderer; headed does not imply hardware.
const { chromium: browserType } = await import(process.env.PLAYWRIGHT_RUNTIME_MODULE || 'playwright');

export const chromium = {
  launch(options = {}) {
    return browserType.launch({
      ...options,
      headless: false,
      args: [
        ...(options.args || []).filter(arg => !arg.startsWith('--use-angle=') && !arg.startsWith('--use-gl=')),
        '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl',
      ],
    });
  },
};
