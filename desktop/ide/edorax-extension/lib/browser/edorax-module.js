'use strict';
const { ContainerModule } = require('@theia/core/shared/inversify');
const {
  FrontendApplicationContribution,
} = require('@theia/core/lib/browser/frontend-application-contribution');
const {
  FrontendApplicationStateService,
} = require('@theia/core/lib/browser/frontend-application-state');
const {
  ApplicationShell,
} = require('@theia/core/lib/browser/shell/application-shell');
const {
  OpenerService,
  open,
} = require('@theia/core/lib/browser/opener-service');
const { CommandRegistry } = require('@theia/core/lib/common/command');
const {
  StatusBar,
  StatusBarAlignment,
} = require('@theia/core/lib/browser/status-bar/status-bar');
const { ThemeService } = require('@theia/core/lib/browser/theming');
const {
  WorkspaceService,
} = require('@theia/workspace/lib/browser/workspace-service');
const {
  FileNavigatorContribution,
} = require('@theia/navigator/lib/browser/navigator-contribution');
const { PreferenceService } = require('@theia/core/lib/common/preferences');
const URI = require('@theia/core/lib/common/uri').default;
require('./workspace.css');
exports.default = new ContainerModule((bind) => {
  bind(FrontendApplicationContribution)
    .toDynamicValue(({ container }) => ({
      onStart() {
        const execute = (commandId, ...args) => {
          try {
            const commands = container.get(CommandRegistry);
            void commands.executeCommand(commandId, ...args);
          } catch (err) {
            console.error(`Failed to execute ${commandId}:`, err);
          }
        };

        const hideExplorerAndExpandTerminal = async () => {
          try {
            const workspaceService = container.get(WorkspaceService);
            await workspaceService.ready;
            const shell = container.get(ApplicationShell);
            shell.collapsePanel('left');
            shell.expandPanel('bottom');
            execute('workbench.action.terminal.toggleTerminal');
          } catch (err) {
            console.error('Failed to open terminal workspace:', err);
          }
        };

        window.addEventListener('edorax:open-file', (event) => {
          if (
            typeof event.detail === 'string' &&
            event.detail.startsWith('file:')
          ) {
            void open(container.get(OpenerService), new URI(event.detail));
          }
        });
        window.addEventListener('edorax:new-terminal', () => {
          execute('workbench.action.terminal.toggleTerminal');
        });
        window.addEventListener('edorax:reveal-explorer', () => {
          void container
            .get(FileNavigatorContribution)
            .openView({ activate: true, reveal: true });
          container.get(ApplicationShell).expandPanel('left');
        });
        window.addEventListener('edorax:select-theme', () => {
          execute('workbench.action.selectTheme');
        });
        window.addEventListener('edorax:select-icon-theme', () => {
          execute('workbench.action.selectIconTheme');
        });
        window.addEventListener('edorax:open-extensions', () => {
          execute('workbench.view.extensions');
        });
        window.addEventListener('edorax:command-palette', () => {
          execute('workbench.action.showCommands');
        });

        try {
          const stateService = container.get(FrontendApplicationStateService);
          void stateService.reachedState('ready').then(async () => {
            try {
              const prefs = container.get(PreferenceService);
              await prefs.ready;
              await prefs.updateValue('window.menuBarVisibility', 'classic');
            } catch (err) {
              console.error('Failed to set classic menuBarVisibility:', err);
            }
            void hideExplorerAndExpandTerminal();
          });
        } catch (err) {
          console.error('Failed to hook ready state:', err);
        }

        try {
          const themeService = container.get(ThemeService);
          const media = window.matchMedia('(prefers-color-scheme: dark)');
          const pickDefaultTheme = (isDark) => {
            const themes = themeService.getThemes();
            const preferred = isDark
              ? [
                  'Default Dark Modern',
                  'Dark+ (default dark)',
                  'Dracula',
                  'dark',
                ]
              : [
                  'Default Light Modern',
                  'Light+ (default light)',
                  'Quiet Light',
                  'light',
                ];
            for (const candidate of preferred) {
              const match = themes.find(
                (t) => t.id === candidate || t.label === candidate,
              );
              if (match) return match.id;
            }
            return isDark ? 'dark' : 'light';
          };
          if (!window.localStorage.getItem('theme')) {
            themeService.setCurrentTheme(
              pickDefaultTheme(media.matches),
              false,
            );
          }
          media.addEventListener('change', () => {
            if (!window.localStorage.getItem('theme')) {
              try {
                themeService.setCurrentTheme(
                  pickDefaultTheme(media.matches),
                  false,
                );
              } catch (err) {
                console.error('Failed to sync OS theme:', err);
              }
            }
          });
        } catch (err) {
          console.error('Failed to enable OS theme sync:', err);
        }

        try {
          const statusBar = container.get(StatusBar);
          void statusBar.setElement('edorax-theme', {
            text: '$(symbol-color) Theme',
            tooltip: 'Select Color Theme (Ctrl+K Ctrl+T)',
            alignment: StatusBarAlignment.RIGHT,
            priority: 102,
            command: 'workbench.action.selectTheme',
          });
          void statusBar.setElement('edorax-extensions', {
            text: '$(extensions)',
            tooltip: 'Extensions & Themes Marketplace (Ctrl+Shift+X)',
            alignment: StatusBarAlignment.RIGHT,
            priority: 101,
            command: 'workbench.view.extensions',
          });
          void statusBar.setElement('edorax-terminal', {
            text: '$(terminal)',
            tooltip: 'Toggle Terminal (Ctrl+`)',
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            command: 'workbench.action.terminal.toggleTerminal',
          });
        } catch (err) {
          console.error('Failed to add status bar items:', err);
        }
        document.documentElement.dataset.edoraxReady = 'true';
      },
    }))
    .inSingletonScope();
});
