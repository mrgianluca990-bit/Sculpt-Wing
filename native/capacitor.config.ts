import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.sculpt.control',
  appName: 'Sculpt Wing',
  webDir: 'dist',
  ios: { contentInset: 'never', preferredContentMode: 'mobile' },
};

export default config;
