import { registerPlugin } from '@capacitor/core'

export interface BinaryHttpPlugin {
  post(options: {
    url: string
    data: string // base64 encoded
    headers?: Record<string, string>
  }): Promise<{
    status: number
    data: string // base64 encoded
  }>
}

const BinaryHttp = registerPlugin<BinaryHttpPlugin>('BinaryHttp')

export default BinaryHttp
