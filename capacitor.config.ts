import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jeanc.plan20',
  appName: 'Plan 20',
  webDir: 'www',
  android: { backgroundColor: '#15171a' },
  plugins: {
    CapacitorHttp: { enabled: true },
    LocalNotifications: { smallIcon: 'ic_stat_p20', iconColor: '#3d8f7a' }
  }
};

export default config;
