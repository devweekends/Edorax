import { preparePty } from './scripts/prepare-pty.mjs';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
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
    executableName: 'Edorax',
    icon: './assets/edorax',
    extraResource: [
      './assets/edorax.png',
      './assets/edorax-dock.png',
      './ide',
    ],
  },
  // TEMPORARY: node-pty's Electron rebuild needs a working Visual Studio install, which this machine
  // does not have yet. An empty onlyModules list skips native rebuilds so the app can start.
  // Remove this line (back to rebuildConfig: {}) once the Build Tools are detected.
  rebuildConfig: { onlyModules: [] },
  makers: [
    new MakerSquirrel({}),
    // Zip for every system.
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
    // Debian and Ubuntu: `sudo apt install ./edorax_<version>_amd64.deb`. The package sets up the
    // sandbox helper, the menu entry and the `edorax` command by itself. These makers take their
    // settings directly (no `options` wrapper), and `electron-forge make --targets ...` ignores them.
    new MakerDeb({
      name: 'edorax',
      productName: 'Edorax',
      genericName: 'Learning app',
      bin: 'Edorax',
      maintainer: 'Edorax <support@edorax.com>',
      homepage: 'https://www.edorax.com',
      categories: ['Education', 'Development'],
      icon: './assets/edorax.png',
    }),
    // Fedora and RHEL: `sudo dnf install ./edorax-<version>.x86_64.rpm`.
    new MakerRpm({
      name: 'edorax',
      productName: 'Edorax',
      genericName: 'Learning app',
      bin: 'Edorax',
      homepage: 'https://www.edorax.com',
      categories: ['Education', 'Development'],
      icon: './assets/edorax.png',
    }),
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
