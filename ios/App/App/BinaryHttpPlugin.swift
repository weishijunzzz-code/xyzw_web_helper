import Capacitor

@objc(BinaryHttpPlugin)
final class BinaryHttpPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "BinaryHttpPlugin"
    let jsName = "BinaryHttp"
    let pluginMethods = [CAPPluginMethod(name: "post", returnType: CAPPluginReturnPromise)]

    @objc func post(_ call: CAPPluginCall) {
        guard let transport = bridge?.plugin(withName: "IOSGame") as? IOSGamePlugin else {
            call.reject("BIN 验证服务未加载")
            return
        }
        transport.postBinaryFromShell(call)
    }
}
