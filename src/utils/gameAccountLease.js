import { reactive } from 'vue'

const claims = reactive(new Set())

export function isGameAccountReserved(tokenId) {
  return claims.has(tokenId)
}

/** Reserve the account before awaiting the browser-wide lock. Older WebViews use the in-app claim. */
export async function acquireGameAccount(tokenId) {
  if (claims.has(tokenId)) return null
  claims.add(tokenId)
  let unlock
  let released = false
  const release = () => {
    if (released) return
    released = true
    claims.delete(tokenId)
    unlock?.()
  }
  const locks = globalThis.navigator?.locks
  if (!locks) return release

  try {
    const acquired = await new Promise((resolve, reject) => {
      locks.request(`xyzw-game:${tokenId}`, { ifAvailable: true }, (lock) => {
        resolve(Boolean(lock))
        if (lock) return new Promise((done) => { unlock = done })
      }).catch(reject)
    })
    if (acquired) return release
  } catch (error) {
    release()
    throw error
  }
  release()
  return null
}
