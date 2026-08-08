import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Relative asset paths — required for the Electron desktop build, which loads
  // dist/index.html directly via file:// (absolute "/assets/..." paths resolve to the
  // filesystem root and 404 under file://). Also safe for the normal web deploy, since
  // the site is served from its domain root either way.
  base: './',
  server: {
    host: true,
    // Without this, Vite's file watcher (chokidar) recursively watches the whole project
    // root, including release/ — the electron-builder output folder. It grabs a directory
    // handle the instant release/win-unpacked.tmp is created, which blocked electron-builder's
    // rename to win-unpacked with EPERM/Access Denied every time the dev server was running.
    watch: {
      ignored: ['**/release/**']
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'assets/images/*.png', 'assets/audio/*.ogg'],
      workbox: {
        // Workbox's default per-file precache limit is 2MB — music_normal.ogg (3.3MB) was
        // silently falling out of the offline cache because of this, so background music
        // would fail to load the first time a player opened the installed PWA offline.
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
      },
      manifest: {
        name: 'Sky Dash Shooter',
        short_name: 'SkyDash',
        description: '2D 跑酷/飛機/標靶射擊小遊戲，支援手機與電腦瀏覽器',
        // Relative, not root-absolute — GitHub Pages project sites are served from
        // /repo-name/, not domain root, so "/" would launch the installed PWA at the wrong
        // URL and the icons below would 404. Relative paths adapt to wherever this is hosted.
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#0b0f1a',
        theme_color: '#0b0f1a',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
