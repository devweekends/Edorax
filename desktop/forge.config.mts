import { preparePty } from './scripts/prepare-pty.mjs';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  hooks: {
    generateAssets: async () => {
      await preparePty();
    },
  },
  packagerConfig: {
    asar: { unpack: '**/node_modules/node-pty/**' },
    // Vite bundles application code; retain the native PTY module for rebuilding.
    ignore: (file) =>
      Boolean(file) &&
      !file.startsWith('/.vite') &&
      file !== '/node_modules' &&
      !file.startsWith('/node_modules/node-pty') &&
      !file.startsWith('/node_modules/node-addon-api'),
    name: 'Edorax',
    icon: './assets/edorax',
    extraResource: [
      './assets/edorax.png',
      './assets/edorax-dock.png',
      './ide',
      './labs',
    ],
  },
  // TEMPORARY: node-pty's Electron rebuild needs a working Visual Studio install, which this machine
  // does not have yet. An empty onlyModules list skips native rebuilds so the app can start.
  // Remove this line (back to rebuildConfig: {}) once the Build Tools are detected.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({}),
    // Zip for every system. Linux uses the zip for now: the .deb and .rpm makers crash in this
    // dependency layout (an old glob picks up the wrong minimatch), so they are left out until that is fixed.
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
