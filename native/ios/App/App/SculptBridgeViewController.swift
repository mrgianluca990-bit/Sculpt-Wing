import Capacitor

/// Registers the app-local native transport before the web interface loads.
final class SculptBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WingSocketPlugin())
    }
}
