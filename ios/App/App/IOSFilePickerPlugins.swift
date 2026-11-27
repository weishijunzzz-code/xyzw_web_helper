import Capacitor
import UIKit
import UniformTypeIdentifiers

private final class GameDocumentPicker: NSObject, UIDocumentPickerDelegate {
    private var didPick: (([URL]) -> Void)?

    func pick(from host: UIViewController?, multiple: Bool, onPick: @escaping ([URL]) -> Void) -> Bool {
        guard let host = host, host.viewIfLoaded?.window != nil, host.presentedViewController == nil, didPick == nil else {
            return false
        }
        didPick = onPick
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.data], asCopy: true)
        picker.allowsMultipleSelection = multiple
        picker.delegate = self
        host.present(picker, animated: true)
        return true
    }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finish(urls)
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finish([])
    }

    private func finish(_ urls: [URL]) {
        let callback = didPick
        didPick = nil
        callback?(urls)
    }
}

@objc(IOSBinFilePickerPlugin)
final class IOSBinFilePickerPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "IOSBinFilePickerPlugin"
    let jsName = "BinFilePicker"
    let pluginMethods = [CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise)]
    private let picker = GameDocumentPicker()

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let opened = self.picker.pick(from: self.bridge?.viewController, multiple: call.getBool("multiple") ?? true) { urls in
                DispatchQueue.global(qos: .userInitiated).async { Self.read(urls, call: call) }
            }
            if !opened { call.reject("文件选择器暂不可用") }
        }
    }

    private static func read(_ urls: [URL], call: CAPPluginCall) {
        guard urls.count <= 8 else { call.reject("一次最多选择 8 个 BIN 文件"); return }
        var total = 0
        var files: [[String: String]] = []
        do {
            for url in urls {
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                guard url.pathExtension.lowercased() == "bin" else {
                    call.reject("请选择 .bin 文件")
                    return
                }
                let handle = try FileHandle(forReadingFrom: url)
                defer { try? handle.close() }
                let limit = min(2 * 1024 * 1024, 4 * 1024 * 1024 - total)
                let data = try handle.read(upToCount: limit + 1) ?? Data()
                guard !data.isEmpty, data.count <= limit else {
                    call.reject("BIN 文件为空或超出导入大小限制")
                    return
                }
                total += data.count
                files.append(["name": url.lastPathComponent, "data": data.base64EncodedString()])
            }
            call.resolve(["files": files])
        } catch {
            call.reject("无法读取所选 BIN 文件")
        }
    }
}

private final class GameScriptFile {
    let url: URL
    private var handle: FileHandle?
    private var scoped = false
    private(set) var bytesRead = 0

    init(url: URL) { self.url = url }

    func read(upTo count: Int) throws -> Data {
        if handle == nil {
            scoped = url.startAccessingSecurityScopedResource()
            handle = try FileHandle(forReadingFrom: url)
        }
        let data = try handle?.read(upToCount: count) ?? Data()
        bytesRead += data.count
        return data
    }

    deinit {
        try? handle?.close()
        if scoped { url.stopAccessingSecurityScopedResource() }
    }
}

@objc(IOSScriptFilePickerPlugin)
final class IOSScriptFilePickerPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "IOSScriptFilePickerPlugin"
    let jsName = "ScriptFilePicker"
    let pluginMethods = ["pick", "readChunk", "finish"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let picker = GameDocumentPicker()
    private let io = DispatchQueue(label: "gamehelper.script-import", qos: .userInitiated)
    private static let limit = 8 * 1024 * 1024
    private var selected: [String: GameScriptFile] = [:]

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let opened = self.picker.pick(from: self.bridge?.viewController, multiple: true) { urls in
                self.io.async {
                    self.selected.removeAll()
                    guard urls.count <= 8 else { call.reject("一次最多选择 8 个脚本"); return }
                    let files = urls.map { url -> [String: String] in
                        let name = url.lastPathComponent
                        guard url.pathExtension.lowercased() == "js" else {
                            return ["name": name, "error": "请选择 .js 或 .user.js 文件"]
                        }
                        let id = UUID().uuidString
                        self.selected[id] = GameScriptFile(url: url)
                        return ["id": id, "name": name]
                    }
                    call.resolve(["files": files])
                }
            }
            if !opened { call.reject("文件选择器暂不可用") }
        }
    }

    @objc func readChunk(_ call: CAPPluginCall) {
        io.async {
            guard let id = call.getString("id"), let file = self.selected[id] else {
                call.reject("所选脚本已不可用")
                return
            }
            do {
                let count = min(96 * 1024, Self.limit - file.bytesRead + 1)
                let data = try file.read(upTo: count)
                guard file.bytesRead <= Self.limit else {
                    self.selected.removeValue(forKey: id)
                    call.reject("单个脚本不能超过 8 MiB")
                    return
                }
                let done = data.isEmpty
                if done { self.selected.removeValue(forKey: id) }
                call.resolve(["data": data.base64EncodedString(), "done": done])
            } catch {
                self.selected.removeValue(forKey: id)
                call.reject("无法读取所选脚本")
            }
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        io.async {
            self.selected.removeAll()
            call.resolve()
        }
    }
}
