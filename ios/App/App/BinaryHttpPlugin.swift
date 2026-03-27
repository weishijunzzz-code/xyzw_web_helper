import Foundation
import Capacitor

@objc(BinaryHttpPlugin)
public class BinaryHttpPlugin: CAPPlugin {
    
    @objc func post(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let base64Data = call.getString("data") else {
            call.reject("Missing required parameters: url or data")
            return
        }
        
        let headers = call.getObject("headers") ?? [:]
        
        // 解码 base64 数据
        guard let postData = Data(base64Encoded: base64Data) else {
            call.reject("Invalid base64 data")
            return
        }
        
        // 创建 URL
        guard let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        
        // 创建请求
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = postData
        request.timeoutInterval = 30
        
        // 设置请求头
        for (key, value) in headers {
            if let stringValue = value as? String {
                request.setValue(stringValue, forHTTPHeaderField: key)
            }
        }
        
        // 发送请求
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                call.reject("HTTP request failed: \(error.localizedDescription)")
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse else {
                call.reject("Invalid response")
                return
            }
            
            guard let responseData = data else {
                call.reject("No response data")
                return
            }
            
            // 将响应数据编码为 base64
            let responseBase64 = responseData.base64EncodedString()
            
            // 返回结果
            call.resolve([
                "status": httpResponse.statusCode,
                "data": responseBase64
            ])
        }
        
        task.resume()
    }
}
