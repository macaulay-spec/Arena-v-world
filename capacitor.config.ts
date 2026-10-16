import type { CapacitorConfig } from '@capacitor/cli';

/** VORA CITY (JAG) — Android wrapper around the Vite build in dist/. */
const config: CapacitorConfig = {
  appId: 'com.jag.voracity',
  appName: 'Vora City',
  webDir: 'dist',
  // https origin so localStorage/fullscreen/orientation behave like a normal site
  server: { androidScheme: 'https' },
  android: {
    allowMixedContent: false,
    backgroundColor: '#000000',
    // debug builds per push via GitHub Actions; release signing is added when we ship to a store
    buildOptions: { releaseType: 'APK' },
  },
};

export default config;
