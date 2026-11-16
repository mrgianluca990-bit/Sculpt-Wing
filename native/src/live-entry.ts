import { NativeTransport, nativeAvailable, nativePlatform } from './wing/native';
import { WingClient } from './wing/client';

// One transport and one session per WebView. No bridge server or cloud relay.
const driver = new WingClient(new NativeTransport());
Object.assign(window, { SculptNative: Object.freeze({
  available: nativeAvailable,
  platform: nativePlatform,
  version: '0.7.4',
  driver,
}) });
