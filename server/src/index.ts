import { ConfigLoader } from './config-loader';
import { createServer } from './server';

async function main() {
  const configLoader = new ConfigLoader();
  const config = await configLoader.load();

  console.log(`[test-automator] Loading config from ${config.projectRoot}`);

  const { httpServer } = await createServer(configLoader);

  const port = config.serverPort;
  httpServer.listen(port, () => {
    console.log(`[test-automator] Server running on http://localhost:${port}`);
    console.log(`[test-automator] WebSocket available on ws://localhost:${port}`);
    console.log(`[test-automator] Health check: http://localhost:${port}/api/health`);
  });

  configLoader.watch();
  configLoader.onChange((newConfig) => {
    console.log('[test-automator] Config reloaded');
  });

  process.on('SIGINT', async () => {
    console.log('\n[test-automator] Shutting down...');
    await configLoader.stop();
    httpServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[test-automator] Fatal error:', err);
  process.exit(1);
});
