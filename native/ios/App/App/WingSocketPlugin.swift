import Capacitor
import Foundation
import Network
import UIKit

/// A local, unicast-only transport for the WING native protocol.
/// Protocol parsing and readback confirmation belong to the TypeScript driver.
@objc(WingSocketPlugin)
public final class WingSocketPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WingSocketPlugin"
    public let jsName = "WingSocket"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "connect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendTCP", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sendUDP", returnType: CAPPluginReturnPromise)
    ]

    private static let wingPort = NWEndpoint.Port(rawValue: 2222)!
    private static let maxTCPBytes = 65_536
    private static let maxUDPBytes = 32_768
    private static let receiveChunkBytes = 32_768
    private static let maxPendingSends = 64
    private static let maxPendingSendBytes = 262_144
    private static let maxPendingPackets = 64
    private static let maxPendingPacketBytes = 524_288
    private static let maxMeterPeers = 8
    private static let connectTimeoutSeconds = 20.0
    private static let sendTimeoutSeconds = 10.0

    // All session state and Network.framework callbacks stay on this queue.
    private let socketQueue = DispatchQueue(label: "it.sculpt.control.wing.socket")
    private var generation: UInt64 = 0
    private var currentSession: SocketSession?
    private var isForeground = true
    private var observers: [NSObjectProtocol] = []

    // Capacitor modifies its event-listener collection on its own bridge queue.
    // Emitting there also preserves the ordering of replies and link events.
    private var callbackQueue = DispatchQueue.main

    override public func load() {
        super.load()
        if let capacitorBridge = bridge as? CapacitorBridge {
            callbackQueue = capacitorBridge.dispatchQueue
        }

        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.socketQueue.async { [weak self] in
                guard let self = self else { return }
                self.isForeground = false
                if let session = self.currentSession {
                    self.close(session, state: "suspended", code: "APP_SUSPENDED",
                               message: "Connessione chiusa: l’app è in background.")
                }
            }
        })
        observers.append(center.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.socketQueue.async { [weak self] in
                // Reconnection is always an explicit user action.
                self?.isForeground = true
            }
        })
        DispatchQueue.main.async { [weak self] in
            let foreground = UIApplication.shared.applicationState != .background
            self?.socketQueue.async { [weak self] in
                self?.isForeground = foreground
            }
        }
    }

    deinit {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        currentSession?.cancelResources()
    }

    @objc public func connect(_ call: CAPPluginCall) {
        guard let host = call.getString("host"), let address = Self.privateIPv4(host) else {
            call.reject("Inserisci un indirizzo IPv4 privato valido della WING.", "INVALID_HOST")
            return
        }
        let requestID = call.getString("requestId")
        if let requestID = requestID, requestID.isEmpty || requestID.utf8.count > 128 {
            call.reject("Identificativo della richiesta non valido.", "INVALID_REQUEST")
            return
        }
        socketQueue.async { [weak self] in
            guard let self = self else {
                call.reject("Il controller non è disponibile.", "UNAVAILABLE")
                return
            }
            guard self.isForeground else {
                self.reject(call, "Apri l’app prima di connettere la WING.", code: "APP_SUSPENDED")
                return
            }
            if let oldSession = self.currentSession {
                self.close(oldSession, state: "closed", code: "SESSION_REPLACED",
                           message: "Connessione sostituita da una nuova sessione.")
            }
            self.generation &+= 1
            let session = SocketSession(generation: self.generation, address: address,
                                        requestID: requestID, call: call)
            self.currentSession = session
            self.start(session)
        }
    }

    @objc public func disconnect(_ call: CAPPluginCall) {
        let sessionID = call.getString("sessionId")
        let requestID = call.getString("requestId")
        socketQueue.async { [weak self] in
            guard let self = self else {
                call.resolve()
                return
            }
            if let session = self.currentSession {
                // A delayed teardown from an old JS transport must not close a newer one.
                // requestId also identifies a connect whose promise has not resolved yet.
                let matchingSession = sessionID == nil || sessionID == session.id
                let matchingRequest = requestID == nil || requestID == session.requestID
                if matchingSession && matchingRequest {
                    self.close(session, state: "closed", code: "DISCONNECTED", message: "Disconnesso.")
                }
            }
            self.callbackQueue.async { call.resolve() }
        }
    }

    @objc public func sendTCP(_ call: CAPPluginCall) {
        send(call, transport: "tcp", maxBytes: Self.maxTCPBytes)
    }

    @objc public func sendUDP(_ call: CAPPluginCall) {
        send(call, transport: "udp", maxBytes: Self.maxUDPBytes)
    }

    private func start(_ session: SocketSession) {
        do {
            let parameters = Self.parameters(udp: true)
            // Bind to an IPv4 ephemeral port. No Bonjour, multicast or broadcast.
            parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.any), port: .any)
            let listener = try NWListener(using: parameters, on: .any)
            session.meterListener = listener
            listener.stateUpdateHandler = { [weak self, weak session] state in
                guard let self = self, let session = session, self.isCurrent(session) else { return }
                switch state {
                case .ready:
                    guard let port = listener.port, port.rawValue != 0 else {
                        self.fail(session, "Impossibile assegnare la porta dei meter.")
                        return
                    }
                    session.meterPort = port.rawValue
                    self.finishConnecting(session)
                case .failed(let error):
                    self.fail(session, "Listener meter non disponibile: \(error.localizedDescription)")
                case .cancelled:
                    self.fail(session, "Listener meter interrotto.")
                default:
                    break
                }
            }
            listener.newConnectionHandler = { [weak self, weak session] connection in
                guard let self = self, let session = session, self.isCurrent(session) else {
                    connection.cancel()
                    return
                }
                self.acceptMeterPeer(connection, session: session)
            }
            listener.start(queue: socketQueue)

            let host = NWEndpoint.Host.ipv4(session.address)
            let tcp = NWConnection(host: host, port: Self.wingPort, using: Self.parameters(udp: false))
            let udp = NWConnection(host: host, port: Self.wingPort, using: Self.parameters(udp: true))
            session.tcp = tcp
            session.udp = udp
            configureControlConnection(tcp, transport: "tcp", session: session)
            configureControlConnection(udp, transport: "udp", session: session)
            tcp.start(queue: socketQueue)
            udp.start(queue: socketQueue)

            let timeout = DispatchWorkItem { [weak self, weak session] in
                guard let self = self, let session = session, self.isCurrent(session), !session.ready else {
                    return
                }
                self.close(session, state: "error", code: "CONNECT_TIMEOUT",
                           message: "Connessione scaduta. Verifica IP, Wi-Fi e permesso Rete locale.")
            }
            session.connectTimeout = timeout
            socketQueue.asyncAfter(deadline: .now() + Self.connectTimeoutSeconds, execute: timeout)
        } catch {
            fail(session, "Impossibile aprire il trasporto locale: \(error.localizedDescription)")
        }
    }

    private func configureControlConnection(_ connection: NWConnection, transport: String,
                                            session: SocketSession) {
        connection.stateUpdateHandler = { [weak self, weak session] state in
            guard let self = self, let session = session, self.isCurrent(session) else { return }
            switch state {
            case .ready:
                if transport == "tcp" { session.tcpReady = true } else { session.udpReady = true }
                self.finishConnecting(session)
            case .waiting(let error):
                // During initial connection, allow time for the local-network prompt.
                // A link loss during use invalidates the session rather than replaying writes.
                if session.ready {
                    self.fail(session, "Connessione WING interrotta: \(error.localizedDescription)")
                }
            case .failed(let error):
                self.fail(session, "Connessione \(transport.uppercased()) non disponibile: \(error.localizedDescription)")
            case .cancelled:
                self.fail(session, "Connessione \(transport.uppercased()) chiusa.")
            default:
                break
            }
        }
    }

    private func finishConnecting(_ session: SocketSession) {
        guard isCurrent(session), !session.ready, session.tcpReady, session.udpReady,
              let meterPort = session.meterPort, let call = session.connectCall else { return }
        session.ready = true
        session.connectCall = nil
        session.connectTimeout?.cancel()
        session.connectTimeout = nil
        callbackQueue.async { [weak self] in
            call.resolve(["sessionId": session.id, "meterPort": Int(meterPort)])
            self?.notifyListeners("linkState", data: ["sessionId": session.id, "state": "ready"])
        }
        // Start reads after queuing the connect result, so the JS driver can adopt this session first.
        if let tcp = session.tcp { receiveTCP(tcp, session: session) }
        if let udp = session.udp { receiveUDP(udp, session: session, peerID: nil) }
        for peerID in session.readyMeterPeers {
            if let connection = session.meterPeers[peerID] {
                startMeterRead(connection, id: peerID, session: session)
            }
        }
    }

    private func acceptMeterPeer(_ connection: NWConnection, session: SocketSession) {
        // Only packets from the chosen literal IPv4 address can reach JavaScript.
        guard case .hostPort(let host, _) = connection.endpoint,
              case .ipv4(let address) = host,
              address == session.address,
              session.meterPeers.count < Self.maxMeterPeers else {
            connection.cancel()
            return
        }
        let peerID = ObjectIdentifier(connection)
        session.meterPeers[peerID] = connection
        connection.stateUpdateHandler = { [weak self, weak session, weak connection] state in
            guard let self = self, let session = session, let connection = connection,
                  self.isCurrent(session), session.meterPeers[peerID] === connection else { return }
            switch state {
            case .ready:
                session.readyMeterPeers.insert(peerID)
                if session.ready { self.startMeterRead(connection, id: peerID, session: session) }
            case .failed(let error):
                self.fail(session, "Ricezione meter interrotta: \(error.localizedDescription)")
            case .cancelled:
                session.meterPeers.removeValue(forKey: peerID)
                session.readyMeterPeers.remove(peerID)
                session.readingMeterPeers.remove(peerID)
            default:
                break
            }
        }
        connection.start(queue: socketQueue)
    }

    private func startMeterRead(_ connection: NWConnection, id: ObjectIdentifier,
                                session: SocketSession) {
        guard session.readingMeterPeers.insert(id).inserted else { return }
        receiveUDP(connection, session: session, peerID: id)
    }

    private func receiveTCP(_ connection: NWConnection, session: SocketSession) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: Self.receiveChunkBytes) {
            [weak self, weak session, weak connection] data, _, complete, error in
            guard let self = self, let session = session, let connection = connection,
                  self.isCurrent(session) else { return }
            if let data = data, !data.isEmpty {
                guard self.emitPacket(data, transport: "tcp", session: session) else { return }
            }
            if let error = error {
                self.fail(session, "Lettura TCP interrotta: \(error.localizedDescription)")
            } else if complete {
                self.close(session, state: "closed", code: "PEER_CLOSED",
                           message: "La WING ha chiuso la connessione.")
            } else {
                self.receiveTCP(connection, session: session)
            }
        }
    }

    private func receiveUDP(_ connection: NWConnection, session: SocketSession,
                            peerID: ObjectIdentifier?) {
        connection.receiveMessage { [weak self, weak session, weak connection] data, _, complete, error in
            guard let self = self, let session = session, let connection = connection,
                  self.isCurrent(session) else { return }
            if let peerID = peerID, session.meterPeers[peerID] !== connection { return }
            if let error = error {
                self.fail(session, "Lettura UDP interrotta: \(error.localizedDescription)")
                return
            }
            if let data = data, !data.isEmpty {
                guard complete, data.count <= Self.maxUDPBytes else {
                    self.fail(session, "Datagramma WING incompleto o troppo grande.")
                    return
                }
                guard self.emitPacket(data, transport: "udp", session: session) else { return }
            }
            self.receiveUDP(connection, session: session, peerID: peerID)
        }
    }

    @discardableResult
    private func emitPacket(_ data: Data, transport: String, session: SocketSession) -> Bool {
        guard isCurrent(session), session.ready else { return false }
        guard session.pendingPacketCount < Self.maxPendingPackets,
              session.pendingPacketBytes + data.count <= Self.maxPendingPacketBytes else {
            close(session, state: "error", code: "RECEIVE_OVERFLOW",
                  message: "Ricezione sovraccarica. Riconnetti la WING.")
            return false
        }
        session.pendingPacketCount += 1
        session.pendingPacketBytes += data.count
        let payload: [String: Any] = [
            "sessionId": session.id, "transport": transport, "data": data.base64EncodedString()
        ]
        callbackQueue.async { [weak self, weak session] in
            guard let self = self, let session = session else { return }
            self.notifyListeners("packet", data: payload)
            // Capacitor schedules WebView delivery on main. Keep the packet charged
            // to the bound until that delivery has at least reached the main queue.
            DispatchQueue.main.async { [weak self, weak session] in
                self?.socketQueue.async { [weak self, weak session] in
                    guard let self = self, let session = session, self.isCurrent(session) else { return }
                    session.pendingPacketCount -= 1
                    session.pendingPacketBytes -= data.count
                }
            }
        }
        return true
    }

    private func send(_ call: CAPPluginCall, transport: String, maxBytes: Int) {
        guard let sessionID = call.getString("sessionId"), !sessionID.isEmpty,
              let encoded = call.getString("data"),
              encoded.utf8.count <= ((maxBytes + 2) / 3) * 4,
              let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= maxBytes else {
            call.reject("Pacchetto o identificativo di sessione non valido.", "INVALID_PACKET")
            return
        }
        socketQueue.async { [weak self] in
            guard let self = self else {
                call.reject("Il controller non è disponibile.", "UNAVAILABLE")
                return
            }
            guard self.isForeground, let session = self.currentSession,
                  session.ready, session.id == sessionID, self.isCurrent(session) else {
                self.reject(call, "Sessione scaduta o disconnessa.", code: "STALE_SESSION")
                return
            }
            guard let connection = transport == "tcp" ? session.tcp : session.udp else {
                self.reject(call, "Trasporto non disponibile.", code: "DISCONNECTED")
                return
            }
            guard session.pendingSends.count < Self.maxPendingSends,
                  session.pendingSendBytes + data.count <= Self.maxPendingSendBytes else {
                self.reject(call, "Troppe richieste in attesa.", code: "SEND_OVERFLOW")
                return
            }
            let writeID = UUID()
            let timeout = DispatchWorkItem { [weak self, weak session] in
                guard let self = self, let session = session, self.isCurrent(session),
                      session.pendingSends[writeID] != nil else { return }
                self.close(session, state: "error", code: "SEND_TIMEOUT",
                           message: "Invio alla WING scaduto. Nessun comando verrà ripetuto.")
            }
            session.pendingSends[writeID] = PendingSend(call: call, size: data.count, timeout: timeout)
            session.pendingSendBytes += data.count
            self.socketQueue.asyncAfter(deadline: .now() + Self.sendTimeoutSeconds, execute: timeout)
            connection.send(content: data, contentContext: .defaultMessage, isComplete: true,
                            completion: .contentProcessed { [weak self, weak session] error in
                guard let self = self, let session = session, self.isCurrent(session),
                      let pending = session.pendingSends.removeValue(forKey: writeID) else { return }
                pending.timeout.cancel()
                session.pendingSendBytes -= pending.size
                if let error = error {
                    self.reject(pending.call, "Invio fallito: \(error.localizedDescription)", code: "SEND_FAILED")
                    self.fail(session, "Invio \(transport.uppercased()) interrotto.")
                } else {
                    // This confirms transport processing only, never console acceptance.
                    self.callbackQueue.async { pending.call.resolve() }
                }
            })
        }
    }

    private func isCurrent(_ session: SocketSession) -> Bool {
        currentSession === session && generation == session.generation
    }

    private func fail(_ session: SocketSession, _ message: String) {
        close(session, state: "error", code: "NETWORK_ERROR", message: message)
    }

    private func close(_ session: SocketSession, state: String, code: String, message: String) {
        guard isCurrent(session) else { return }
        currentSession = nil
        generation &+= 1
        session.ready = false
        session.cancelResources()
        let connectionCall = session.connectCall
        session.connectCall = nil
        let pendingCalls = session.pendingSends.values.map(\.call)
        session.pendingSends.removeAll()
        session.pendingSendBytes = 0
        callbackQueue.async { [weak self] in
            connectionCall?.reject(message, code)
            pendingCalls.forEach { $0.reject(message, code) }
            self?.notifyListeners("linkState", data: [
                "sessionId": session.id, "state": state, "message": message
            ])
        }
    }

    private func reject(_ call: CAPPluginCall, _ message: String, code: String) {
        callbackQueue.async { call.reject(message, code) }
    }

    private static func parameters(udp: Bool) -> NWParameters {
        let parameters = udp ? NWParameters.udp : NWParameters.tcp
        parameters.prohibitedInterfaceTypes = [.cellular]
        parameters.includePeerToPeer = false
        if let tcp = parameters.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options {
            tcp.noDelay = true
        }
        return parameters
    }

    /// Literal canonical IPv4 only; no DNS, URLs, public hosts or multicast.
    /// .0/.255 endings are deliberately excluded as conservative broadcast guards.
    private static func privateIPv4(_ host: String) -> IPv4Address? {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var octets: [UInt8] = []
        for part in parts {
            guard !part.isEmpty, part.count <= 3,
                  part.utf8.allSatisfy({ (48...57).contains($0) }),
                  !(part.count > 1 && part.first == "0"),
                  let octet = UInt8(part) else { return nil }
            octets.append(octet)
        }
        guard octets[3] != 0, octets[3] != 255 else { return nil }
        let isPrivate = octets[0] == 10
            || (octets[0] == 172 && (16...31).contains(octets[1]))
            || (octets[0] == 192 && octets[1] == 168)
        let isLinkLocal = octets[0] == 169 && octets[1] == 254
            && (1...254).contains(octets[2])
        guard isPrivate || isLinkLocal else { return nil }
        return IPv4Address(host)
    }
}

private struct PendingSend {
    let call: CAPPluginCall
    let size: Int
    let timeout: DispatchWorkItem
}

private final class SocketSession {
    let id = UUID().uuidString
    let generation: UInt64
    let address: IPv4Address
    let requestID: String?
    var connectCall: CAPPluginCall?
    var connectTimeout: DispatchWorkItem?
    var tcp: NWConnection?
    var udp: NWConnection?
    var meterListener: NWListener?
    var meterPort: UInt16?
    var tcpReady = false
    var udpReady = false
    var ready = false
    var meterPeers: [ObjectIdentifier: NWConnection] = [:]
    var readyMeterPeers = Set<ObjectIdentifier>()
    var readingMeterPeers = Set<ObjectIdentifier>()
    var pendingSends: [UUID: PendingSend] = [:]
    var pendingSendBytes = 0
    var pendingPacketCount = 0
    var pendingPacketBytes = 0

    init(generation: UInt64, address: IPv4Address, requestID: String?, call: CAPPluginCall) {
        self.generation = generation
        self.address = address
        self.requestID = requestID
        connectCall = call
    }

    func cancelResources() {
        connectTimeout?.cancel()
        connectTimeout = nil
        pendingSends.values.forEach { $0.timeout.cancel() }
        // Clear callbacks before cancel; no old session can signal a new generation.
        meterListener?.stateUpdateHandler = nil
        meterListener?.newConnectionHandler = nil
        meterListener?.cancel()
        meterListener = nil
        for connection in [tcp, udp].compactMap({ $0 }) + Array(meterPeers.values) {
            connection.stateUpdateHandler = nil
            connection.cancel()
        }
        tcp = nil
        udp = nil
        meterPeers.removeAll()
        readyMeterPeers.removeAll()
        readingMeterPeers.removeAll()
    }
}
