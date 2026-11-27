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
    private lazy var network = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), UUID(uuidString: id) != nil,
                  self.sockets[id] == nil, let address = call.getString("url"),
                  let url = Self.gameURL(address) else {
                call.reject("游戏连接参数无效")
                return
            }
            let task = self.network.webSocketTask(with: URLRequest(url: url, timeoutInterval: 20))
            task.maximumMessageSize = self.maxFrameBytes
            self.sockets[id] = task
            task.resume()
            call.resolve()
        }
    }

    @objc func send(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let id = call.getString("id"), let task = self.sockets[id],
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
            if let id = call.getString("id"), let task = self.sockets.removeValue(forKey: id) {
                task.cancel(with: .normalClosure, reason: nil)
            }
            call.resolve()
        }
    }

    private static func gameURL(_ address: String) -> URL? {
        guard address.utf8.count <= 32768, let components = URLComponents(string: address),
              components.scheme == "wss", components.host == "xxz-xyzw.hortorgames.com",
              components.port == nil, components.user == nil, components.password == nil,
              components.fragment == nil, components.percentEncodedPath == "/agent",
              let query = components.queryItems, query.count == 3,
              query.contains(where: { $0.name == "p" && !($0.value ?? "").isEmpty }),
              query.contains(URLQueryItem(name: "e", value: "x")),
              query.contains(URLQueryItem(name: "lang", value: "chinese")) else { return nil }
        return components.url
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol protocolName: String?) {
        guard let id = socketId(webSocketTask) else { return }
        notifyListeners("socketEvent", data: ["id": id, "type": "open"])
        receive(webSocketTask, id: id)
    }

    private func receive(_ task: URLSessionWebSocketTask, id: String) {
        task.receive { [weak self] result in
            DispatchQueue.main.async {
                guard let self = self, self.sockets[id] === task else { return }
                var event: [String: Any] = ["id": id, "type": "message"]
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
                self.notifyListeners("socketEvent", data: event)
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
        let text = reason ?? task.closeReason ?? Data()
        notifyListeners("socketEvent", data: ["id": id, "type": "close", "code": code,
            "reason": String(data: text.prefix(123), encoding: .utf8) ?? ""])
    }
}
