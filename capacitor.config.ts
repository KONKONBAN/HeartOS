import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'vn.heartos.app',
  appName: 'HeartOS',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#FAF6EF',
  },
  plugins: {
    SystemBars: {
      style: 'LIGHT',
    },
  },
};

export default config;
