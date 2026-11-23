import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // The app signs its Secure-exam reports with this key (see src/secure/controller.ts). Set
  // EDORAX_SECURE_APP_KEY when you package or start the app. It must equal SECURE_APP_SIGNING_KEY
  // on the API. Left empty, the app and the development server both use the built-in dev key.
  define: {
    'process.env.EDORAX_SECURE_APP_KEY': JSON.stringify(
      process.env.EDORAX_SECURE_APP_KEY ?? '',
    ),
  },
  resolve: {
    alias: {
      ssh2: fileURLToPath(
        new URL('./src/labs/unsupported-ssh.ts', import.meta.url),
      ),
    },
  },
});
