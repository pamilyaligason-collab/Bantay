import { configure } from '@testing-library/react'

// findBy*/waitFor default to 1000 ms. The first render in a file opens Dexie and loads the sync module, which
// took 1.8 s on a busy PC and failed PwaBanner and SignIn tests at random. Raise the wait, not the tests:
// a passing test still returns as soon as the element appears.
configure({ asyncUtilTimeout: 10_000 })

// vmThreads pool (vite.config.ts): the test globals are jsdom's own window, whose crypto has no subtle. Docs upload hashes with
// crypto.subtle.digest, so lend it Node's WebCrypto. The specifier is a variable so tsc does not need @types/node.
if (!globalThis.crypto?.subtle) {
  const nodeCrypto = 'node:crypto'
  const { webcrypto } = await import(/* @vite-ignore */ nodeCrypto)
  Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle, configurable: true })
}
