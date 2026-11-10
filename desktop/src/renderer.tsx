import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { ToastProvider } from './ui/toast/Toast';
import { DotVoiceProvider } from './ui/mascot/DotVoice';
import { PlaybackProvider } from './ui/audiobooks/PlaybackContext';
import { initTheme } from './ui/lib/theme';

initTheme();

createRoot(document.getElementById('root')!, {
  onUncaughtError(error) {
    console.error('Workspace render failed:', error);
    delete document.documentElement.dataset.appReady;
    window.dispatchEvent(new Event('workspace-startup-error'));
  },
}).render(
  <PlaybackProvider>
    <ToastProvider>
      <DotVoiceProvider>
        <App />
      </DotVoiceProvider>
    </ToastProvider>
  </PlaybackProvider>,
);
