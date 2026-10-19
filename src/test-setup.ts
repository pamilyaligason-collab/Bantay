import { configure } from '@testing-library/react'

// findBy*/waitFor default to 1000 ms. The first render in a file opens Dexie and loads the sync module, which
// took 1.8 s on a busy PC and failed PwaBanner and SignIn tests at random. Raise the wait, not the tests:
// a passing test still returns as soon as the element appears.
configure({ asyncUtilTimeout: 10_000 })
