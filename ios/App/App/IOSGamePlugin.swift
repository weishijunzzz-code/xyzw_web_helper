import Capacitor
import UIKit
import UniformTypeIdentifiers
import WebKit

final class GameBridgeViewController: CAPBridgeViewController {
    let gameSurface = IOSGameSurface()

    override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        GameShellWebView(frame: frame, configuration: configuration)
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(IOSGamePlugin())
        bridge?.registerPluginInstance(IOSBinFilePickerPlugin())
        bridge?.registerPluginInstance(IOSScriptFilePickerPlugin())
        bridge?.registerPluginInstance(BinaryHttpPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        guard let shell = webView else { return }
        let container = UIView()
        container.backgroundColor = .black
        view = container
        gameSurface.isHidden = true
        for layer in [gameSurface as UIView, shell as UIView] {
            layer.frame = container.bounds
            layer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(layer)
        }
    }
}

final class GameShellWebView: WKWebView {
    // A nil region keeps the entire trusted shell interactive, including Vue drawers.
    var gameHitRegion: CGRect?

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if let region = gameHitRegion, !region.contains(point) { return nil }
        return super.hitTest(point, with: event)
    }
}

final class IOSGameSurface: UIView {
    weak var game: WKWebView?

    override func layoutSubviews() {
        super.layoutSubviews()
        let width = min(bounds.width, bounds.height * 9 / 16)
        let height = min(bounds.height, bounds.width * 16 / 9)
        game?.frame = CGRect(x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width: width, height: height)
    }
}

private final class IOSGameBundle: NSObject, WKURLSchemeHandler {
    static let scheme = "xyzw-game"
    static let host = "runtime"
    static let entry = "/android-single.html"
    private static let policy = [
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.hortorgames.com;",
        "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https://*.hortorgames.com;",
        "font-src 'self' data: https://*.hortorgames.com; connect-src 'self' https://*.hortorgames.com wss://*.hortorgames.com;",
        "worker-src blob:; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    ].joined(separator: " ")
    static var root: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("public", isDirectory: true).appendingPathComponent("game", isDirectory: true)
    }

    static func isGameURL(_ url: URL) -> Bool {
        url.scheme == scheme && url.host == host && url.user == nil && url.password == nil && url.port == nil
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, Self.isGameURL(url), task.request.httpMethod == "GET",
              let root = Self.root else {
            task.didFailWithError(URLError(.unsupportedURL))
            return
        }
        let path = String(url.path.dropFirst())
        guard URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath == url.path,
              path.range(of: "^[A-Za-z0-9._/-]{1,512}$", options: .regularExpression) != nil,
              path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let file = root.appendingPathComponent(path).resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.resolvingSymlinksInPath().path + "/"),
              let data = try? Data(contentsOf: file, options: .mappedIfSafe) else {
            task.didFailWithError(URLError(.fileDoesNotExist))
            return
        }
        let ext = file.pathExtension.lowercased()
        let knownTypes = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
                          "css": "text/css; charset=utf-8", "json": "application/json", "wasm": "application/wasm"]
        let contentType = knownTypes[ext] ?? UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
        var headers = ["Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"]
        if ext == "html" { headers["Content-Security-Policy"] = Self.policy }
        guard let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: headers) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    // Work is synchronous on the WebKit scheme callback queue.
    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}

private final class GameMessageReceiver: NSObject, WKScriptMessageHandler {
    weak var owner: IOSGamePlugin?
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.receive(message)
    }
}

@objc(IOSGamePlugin)
final class IOSGamePlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate, URLSessionDataDelegate {
    let identifier = "IOSGamePlugin"
    let jsName = "IOSGame"
    let pluginMethods = ["status", "open", "present", "close"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private static let channel = "xyzw-android-game"
    private static let maxBinaryBytes = 2 * 1024 * 1024
    private var game: WKWebView?
    private var session: String?
    private var staged: [String: Any]?
    private var ready = false
    private var shellAppearance: (opaque: Bool, background: UIColor?, scroll: UIColor?)?
    private lazy var network = URLSession(configuration: .ephemeral, delegate: self, delegateQueue: .main)
    private struct Request {
        let id: String?
        let gameSession: String?
        let task: URLSessionDataTask
        let complete: ([String: Any]?) -> Void
        var data = Data()
    }
    private var requests: [Int: Request] = [:]
    private var host: GameBridgeViewController? { bridge?.viewController as? GameBridgeViewController }
    private var available: Bool {
        guard host != nil, let root = IOSGameBundle.root else { return false }
        return FileManager.default.fileExists(atPath: root.appendingPathComponent("android-single.html").path)
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["available": self.available]) }
    }

    @objc func open(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.available, let surface = self.host?.gameSurface,
                  let id = call.getString("session"), id.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
                  let binId = call.getString("binId"), binId.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil,
                  let hex = call.getString("binHex"), !hex.isEmpty, hex.utf8.count <= Self.maxBinaryBytes * 2,
                  hex.utf8.count % 2 == 0, hex.range(of: "^[A-Fa-f0-9]+$", options: .regularExpression) != nil,
                  let url = URL(string: "\(IOSGameBundle.scheme)://\(IOSGameBundle.host)\(IOSGameBundle.entry)?session=\(id)") else {
                call.reject("iOS 游戏窗口或账号数据不可用")
                return
            }
            self.dispose()
            let config = WKWebViewConfiguration()
            // The game gets its own origin and user content controller. This view is never registered with Capacitor.
            config.setURLSchemeHandler(IOSGameBundle(), forURLScheme: IOSGameBundle.scheme)
            config.allowsInlineMediaPlayback = true
            config.mediaTypesRequiringUserActionForPlayback = []
            let receiver = GameMessageReceiver()
            receiver.owner = self
            config.userContentController.add(receiver, name: "gameRuntime")
            let game = WKWebView(frame: .zero, configuration: config)
            game.navigationDelegate = self
            game.backgroundColor = .black
            game.scrollView.contentInsetAdjustmentBehavior = .never
            game.scrollView.bounces = false
            game.scrollView.isScrollEnabled = false
            self.game = game
            self.session = id
            let scripts = call.options["scripts"] as? [[String: Any]] ?? []
            self.staged = ["type": "initialize", "binId": binId, "binHex": hex, "scripts": scripts]
            surface.game = game
            surface.addSubview(game)
            surface.isHidden = false
            surface.setNeedsLayout()
            self.setPresentation(visible: false, region: nil)
            game.load(URLRequest(url: url))
            call.resolve()
        }
    }

    @objc func present(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let session = self.session, call.getString("session") == session {
                let visible = self.ready && (call.getBool("visible") ?? false)
                self.setPresentation(visible: visible, region: visible ? call.getObject("region") : nil)
            }
            call.resolve()
        }
    }

    @objc func close(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let session = self.session, call.getString("session") == session { self.dispose() }
            call.resolve()
        }
    }

    private func setPresentation(visible: Bool, region: [String: Any]?) {
        guard let host = host, let shell = host.webView as? GameShellWebView else { return }
        if visible {
            if shellAppearance == nil { shellAppearance = (shell.isOpaque, shell.backgroundColor, shell.scrollView.backgroundColor) }
            shell.isOpaque = false
            shell.backgroundColor = .clear
            shell.scrollView.backgroundColor = .clear
            shell.gameHitRegion = hitRegion(region, bounds: shell.bounds)
        } else {
            if let appearance = shellAppearance {
                shell.isOpaque = appearance.opaque
                shell.backgroundColor = appearance.background
                shell.scrollView.backgroundColor = appearance.scroll
            }
            shellAppearance = nil
            shell.gameHitRegion = nil
        }
        host.gameSurface.isUserInteractionEnabled = shell.gameHitRegion != nil
        host.gameSurface.accessibilityElementsHidden = !host.gameSurface.isUserInteractionEnabled
    }

    private func hitRegion(_ region: [String: Any]?, bounds: CGRect) -> CGRect? {
        guard let region = region, let x = region["x"] as? Double, let y = region["y"] as? Double,
              let width = region["width"] as? Double, let height = region["height"] as? Double,
              let viewportWidth = region["viewportWidth"] as? Double, let viewportHeight = region["viewportHeight"] as? Double,
              [x, y, width, height, viewportWidth, viewportHeight].allSatisfy({ $0.isFinite }),
              viewportWidth > 0, viewportHeight > 0, width > 0, width <= 64, height > 0, height <= 64 else { return nil }
        let scaled = CGRect(x: CGFloat(x / viewportWidth) * bounds.width, y: CGFloat(y / viewportHeight) * bounds.height,
                            width: CGFloat(width / viewportWidth) * bounds.width, height: CGFloat(height / viewportHeight) * bounds.height)
        let rect = scaled.intersection(bounds)
        return rect.isEmpty || rect.isNull ? nil : rect
    }

    private func dispose() {
        setPresentation(visible: false, region: nil)
        game?.stopLoading()
        game?.configuration.userContentController.removeScriptMessageHandler(forName: "gameRuntime")
        game?.navigationDelegate = nil
        game?.removeFromSuperview()
        game = nil
        host?.gameSurface.isHidden = true
        for key in requests.keys.filter({ requests[$0]?.gameSession != nil }) {
            requests.removeValue(forKey: key)?.task.cancel()
        }
        session = nil
        staged = nil
        ready = false
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard webView === game, let url = action.request.url, IOSGameBundle.isGameURL(url),
              url.path == IOSGameBundle.entry, action.targetFrame?.isMainFrame == true,
              url.query == session.map({ "session=\($0)" }), staged != nil else {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView === game { failWindow("game-window-reclaimed") }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if webView === game && (error as? URLError)?.code != .cancelled { failWindow("resource-load-failed") }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if webView === game && (error as? URLError)?.code != .cancelled { failWindow("resource-load-failed") }
    }

    private func failWindow(_ code: String) {
        guard let id = session else { return }
        dispose()
        notifyListeners("gameEvent", data: ["session": id, "type": "failed", "code": code])
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard message.webView === game, message.frameInfo.isMainFrame, let url = message.frameInfo.request.url,
              IOSGameBundle.isGameURL(url), url.path == IOSGameBundle.entry, let session = session,
              url.query == "session=\(session)", let data = message.body as? [String: Any],
              data["session"] as? String == session, data["channel"] as? String == Self.channel, data["version"] as? Int == 1,
              let type = data["type"] as? String else { return }
        var event: [String: Any] = ["type": type, "session": session]
        switch type {
        case "hello":
            guard let initial = staged else { return }
            staged = nil
            reply(initial, session: session)
        case "progress":
            guard let phase = data["phase"] as? String, phase.utf8.count <= 32,
                  let duration = data["durationMs"] as? Double, duration.isFinite, duration >= 0 else { return }
            event["phase"] = phase
            event["durationMs"] = duration
        case "script-result":
            guard let id = data["id"] as? String, id.utf8.count <= 128,
                  let status = data["status"] as? String, ["loaded", "failed", "unsupported"].contains(status) else { return }
            event["id"] = id
            event["status"] = status
        case "ready":
            guard staged == nil, !ready else { return }
            ready = true
        case "failed":
            failWindow(data["code"] as? String == "game-handshake-timeout" ? "game-handshake-timeout" : "resource-load-failed")
            return
        case "http-request":
            if staged == nil { request(data, session: session) }
            return
        default: return
        }
        notifyListeners("gameEvent", data: event)
    }

    private func reply(_ data: [String: Any], session id: String) {
        guard id == session, let game = game else { return }
        var payload = data
        payload["session"] = id
        payload["channel"] = Self.channel
        payload["version"] = 1
        game.callAsyncJavaScript("window.__xyzwReceiveGameRuntime(payload)", arguments: ["payload": payload], in: nil, in: .page) { [weak self] result in
            if case .failure = result, data["type"] as? String == "initialize", self?.session == id {
                self?.failWindow("resource-load-failed")
            }
        }
    }

    private func request(_ data: [String: Any], session: String) {
        guard let id = data["requestId"] as? String, id.range(of: "^[1-9][0-9]{0,5}$", options: .regularExpression) != nil,
              !requests.values.contains(where: { $0.id == id }) else { return }
        guard requests.values.filter({ $0.gameSession != nil }).count < 4,
              let endpoint = data["endpoint"] as? String, endpoint != "serverlist",
              let request = Self.officialRequest(endpoint, data: data) else {
            reply(["type": "http-response", "requestId": id], session: session)
            return
        }
        perform(request, id: id, gameSession: session) { [weak self] response in
            var reply: [String: Any] = ["type": "http-response", "requestId": id]
            if let response = response { reply["response"] = response }
            self?.reply(reply, session: session)
        }
    }

    // BIN import requests come from the trusted shell, outside of the game document.
    func postBinaryFromShell(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = call.getString("url"),
                  let endpoint = [
                    "https://xxz-xyzw.hortorgames.com/login/authuser?_seq=1": "authuser",
                    "https://xxz-xyzw.hortorgames.com/login/serverlist?_seq=3": "serverlist"
                  ][url],
                  let encoded = call.getString("data"),
                  let request = Self.officialRequest(endpoint, data: ["bodyBase64": encoded, "seq": endpoint == "authuser" ? "1" : "3"]) else {
                call.reject("BIN 验证请求不受支持")
                return
            }
            guard self.requests.values.filter({ $0.gameSession == nil }).count < 8 else {
                call.reject("BIN 验证请求过多，请稍后重试")
                return
            }
            self.perform(request) { response in
                guard let response = response else { call.reject("BIN 验证网络请求失败"); return }
                call.resolve(["status": response["status"] ?? 0, "data": response["dataBase64"] ?? ""])
            }
        }
    }

    private func perform(_ request: URLRequest, id: String? = nil, gameSession: String? = nil,
                         complete: @escaping ([String: Any]?) -> Void) {
        let task = network.dataTask(with: request)
        requests[task.taskIdentifier] = Request(id: id, gameSession: gameSession, task: task, complete: complete)
        task.resume()
    }

    private static func officialRequest(_ endpoint: String, data: [String: Any]) -> URLRequest? {
        let path: String
        var body = Data()
        var contentType = "application/json; charset=UTF-8"
        switch endpoint {
        case "manifest":
            guard data["body"] as? String == "" else { return nil }
            path = "https://xxz-xyzw.hortorgames.com/login/manifest?platform=hortor&version=0.36.0-android"
        case "switch-status":
            guard let text = data["body"] as? String, text.utf8.count <= 64 * 1024,
                  let json = try? JSONSerialization.jsonObject(with: Data(text.utf8)), json is [String: Any] || json is [Any] else { return nil }
            path = "https://comb-platform.hortorgames.com/comb-custom-switch-server/api/v1/switch/multi/status"
            body = Data(text.utf8)
        case "authuser", "serverlist":
            guard let encoded = data["bodyBase64"] as? String, encoded.utf8.count <= ((maxBinaryBytes + 2) / 3) * 4,
                  let decoded = Data(base64Encoded: encoded), decoded.count <= maxBinaryBytes else { return nil }
            let base = "https://xxz-xyzw.hortorgames.com/login/" + endpoint
            if let seq = data["seq"] as? String {
                guard seq.range(of: "^[0-9]{1,12}$", options: .regularExpression) != nil else { return nil }
                path = base + "?_seq=" + seq
            } else { path = base }
            body = decoded
            contentType = "application/octet-stream"
        default: return nil
        }
        guard let url = URL(string: path), let host = url.host else { return nil }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json,text/plain,*/*", forHTTPHeaderField: "Accept")
        request.setValue("https://\(host)/", forHTTPHeaderField: "Referer")
        return request
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let key = dataTask.taskIdentifier
        guard let size = requests[key]?.data.count, size + data.count <= Self.maxBinaryBytes else { dataTask.cancel(); return }
        requests[key]?.data.append(data)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let request = requests.removeValue(forKey: task.taskIdentifier) else { return }
        if error == nil, let response = task.response as? HTTPURLResponse,
           (200...599).contains(response.statusCode), !(300...399).contains(response.statusCode) {
            request.complete(["status": response.statusCode, "contentType": response.mimeType ?? "application/octet-stream",
                              "dataBase64": request.data.base64EncodedString()])
        } else {
            request.complete(nil)
        }
    }
}
