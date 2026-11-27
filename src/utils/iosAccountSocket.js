import { Capacitor, registerPlugin } from '@capacitor/core'
import { createCompatibleRandomUUID } from './gameLauncher'
import { isIOSApp } from './runtimePlatform'

const IOSAccountSocket = registerPlugin('IOSAccountSocket')

export function hasIOSAccountSocket() {
  return isIOSApp() && Capacitor.isPluginAvailable('IOSAccountSocket')
}

/** Implement the WebSocket surface used by the account client. */
export function openIOSAccountSocket(url) {
  const id = createCompatibleRandomUUID()
  let listener
  let requested = false
  const socket = {
    readyState: WebSocket.CONNECTING,
    onopen: null,
    onmessage: null,
    onclose: null,

    send(data) {
      if (socket.readyState !== WebSocket.OPEN) throw new DOMException('Socket is not open', 'InvalidStateError')
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      let text = ''
      for (let offset = 0; offset < bytes.length; offset += 8192) {
        text += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
      }
      IOSAccountSocket.send({ id, data: btoa(text) }).catch(() => {
        if (socket.readyState === WebSocket.OPEN) finish(1006)
      })
    },

    close() {
      if (socket.readyState >= WebSocket.CLOSING) return
      socket.readyState = WebSocket.CLOSING
      void release().finally(() => { socket.readyState = WebSocket.CLOSED })
    },
  }

  function release() {
    void listener?.remove().catch(() => {})
    return requested ? IOSAccountSocket.close({ id }).catch(() => {}) : Promise.resolve()
  }

  function finish(code, reason = '') {
    if (socket.readyState >= WebSocket.CLOSING) return
    socket.readyState = WebSocket.CLOSED
    void release()
    socket.onclose?.({ code, reason, wasClean: code === 1000 })
  }

  IOSAccountSocket.addListener('socketEvent', (event) => {
    if (event.id !== id || socket.readyState >= WebSocket.CLOSING) return
    if (event.type === 'open' && socket.readyState === WebSocket.CONNECTING) {
      socket.readyState = WebSocket.OPEN
      socket.onopen?.()
    } else if (event.type === 'message' && socket.readyState === WebSocket.OPEN) {
      const data = typeof event.text === 'string'
        ? event.text
        : Uint8Array.from(atob(event.data), character => character.charCodeAt(0)).buffer
      socket.onmessage?.({ data })
    } else if (event.type === 'close') {
      finish(event.code, event.reason)
    }
  }).then((handle) => {
    if (socket.readyState !== WebSocket.CONNECTING) return handle.remove()
    listener = handle
    requested = true
    return IOSAccountSocket.open({ id, url })
  }).catch(() => finish(1006))

  return socket
}
