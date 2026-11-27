import Capacitor
import Foundation

@objc(IOSAccountSocketPlugin)
final class IOSAccountSocketPlugin: CAPPlugin, CAPBridgedPlugin, URLSessionWebSocketDelegate, @unchecked Sendable {
    let identifier = "IOSAccountSocketPlugin"
    let jsName = "IOSAccountSocket"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "send", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "close", returnType: CAPPluginReturnPromise)
    ]

    private let maxFrameBytes = 8 * 1024 * 1024
    private var sockets: [String: URLSessionWebSocketTask] = [:]
    private var gameEvents: [String: ([String: Any]) -> Void] = [:]
    private var closingCalls: [String: CAPPluginCall] = [:]
    private lazy var network = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil,
                  self.sockets[id] == nil, let address = call.getString("url"),
                  let url = Self.gameURL(address) else {
                call.reject("游戏连接参数无效")
                return
            }
            self.start(id, url: url)
            call.resolve()
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil, let task = self.sockets[id],
                  let encoded = call.getString("data"), encoded.utf8.count <= ((self.maxFrameBytes + 2) / 3) * 4,
                  let bytes = Data(base64Encoded: encoded), bytes.count <= self.maxFrameBytes else {
                call.reject("游戏连接不可用或消息无效")
                return
            }
            task.send(.data(bytes)) { error in
                if error == nil { call.resolve() }
                else { call.reject("游戏消息发送失败") }
            }
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil,
                  let task = self.sockets[id], self.closingCalls[id] == nil else {
                call.resolve()
                return
            }
            self.closingCalls[id] = call
            task.cancel(with: .normalClosure, reason: nil)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                if self.sockets[id] === task { self.finish(task, code: 1000) }
            }
        }
    }

    private func start(_ id: String, url: URL) {
        let task = network.webSocketTask(with: URLRequest(url: url, timeoutInterval: 20))
        task.maximumMessageSize = maxFrameBytes
        sockets[id] = task
        task.resume()
    }

    func openGameSocket(_ id: String, address: String, event: @escaping ([String: Any]) -> Void) -> Bool {
        guard sockets[id] == nil, let endpoint = Self.gameEndpoint(address), let url = endpoint.url else { return false }
        gameEvents[id] = event
        start(id, url: url)
        return true
    }

    func sendGameSocket(_ id: String, payload: [String: Any]) {
        guard let task = sockets[id], gameEvents[id] != nil else { return }
        let message: URLSessionWebSocketTask.Message
        if let text = payload["text"] as? String, text.utf8.count <= maxFrameBytes {
            message = .string(text)
        } else if let encoded = payload["data"] as? String,
                  encoded.utf8.count <= ((maxFrameBytes + 2) / 3) * 4,
                  let bytes = Data(base64Encoded: encoded), bytes.count <= maxFrameBytes {
            message = .data(bytes)
        } else { return }
        task.send(message) { [weak self] error in
            if error != nil {
                DispatchQueue.main.async { self?.finish(task, code: 1006) }
            }
        }
    }

    func closeGameSocket(_ id: String, notify: Bool) {
        guard let event = gameEvents.removeValue(forKey: id) else { return }
        sockets.removeValue(forKey: id)?.cancel(with: .normalClosure, reason: nil)
        if notify { event(["type": "close", "code": 1000, "reason": ""]) }
    }

    private func emit(_ id: String, _ event: [String: Any]) {
        if let relay = gameEvents[id] { relay(event) }
        else if closingCalls[id] == nil {
            var data = event
            data["id"] = id
            notifyListeners("socketEvent", data: data)
        }
    }

    private static func gameURL(_ address: String) -> URL? {
        guard let components = gameEndpoint(address),
              let query = components.queryItems, query.count == 3,
              query.contains(where: { $0.name == "p" && !($0.value ?? "").isEmpty }),
              query.contains(URLQueryItem(name: "e", value: "x")),
              query.contains(URLQueryItem(name: "lang", value: "chinese")) else { return nil }
        return components.url
    }

    private static func gameEndpoint(_ address: String) -> URLComponents? {
        guard address.utf8.count <= 32768, let components = URLComponents(string: address),
              components.scheme == "wss", components.host == "xxz-xyzw.hortorgames.com",
              components.port == nil, components.user == nil, components.password == nil,
              components.fragment == nil, components.percentEncodedPath == "/agent" else { return nil }
        return components
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocolName: String?) {
        guard let id = socketId(webSocketTask), closingCalls[id] == nil else { return }
        emit(id, ["type": "open"])
        receive(webSocketTask, id: id)
    }

    private func receive(_ task: URLSessionWebSocketTask, id: String) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self, self.sockets[id] === task else { return }
                var event: [String: Any] = ["type": "message"]
                switch result {
                case .success(.data(let bytes)): event["data"] = bytes.base64EncodedString()
                case .success(.string(let text)): event["text"] = text
                case .failure:
                    self.finish(task, code: self.failureCode(task))
                    return
                @unknown default:
                    self.finish(task, code: 1003)
                    return
                }
                self.emit(id, event)
                self.receive(task, id: id)
            }
        }
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        finish(webSocketTask, code: closeCode.rawValue, reason: reason)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let socket = task as? URLSessionWebSocketTask { finish(socket, code: failureCode(socket)) }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    private func socketId(_ task: URLSessionWebSocketTask) -> String? {
        sockets.first { $0.value === task }?.key
    }

    private func failureCode(_ task: URLSessionWebSocketTask) -> Int {
        if task.closeCode != .invalid { return task.closeCode.rawValue }
        if let status = (task.response as? HTTPURLResponse)?.statusCode, status >= 300 { return status }
        return 1006
    }

    private func finish(_ task: URLSessionWebSocketTask, code: Int, reason: Data? = nil) {
        guard let id = socketId(task) else { return }
        sockets.removeValue(forKey: id)
        task.cancel()
        if let call = closingCalls.removeValue(forKey: id) {
            call.resolve()
            return
        }
        let text = reason ?? task.closeReason ?? Data()
        let event: [String: Any] = ["type": "close", "code": code,
            "reason": String(data: text.prefix(123), encoding: .utf8) ?? ""]
        if let relay = gameEvents.removeValue(forKey: id) { relay(event) }
        else { emit(id, event) }
    }
}
