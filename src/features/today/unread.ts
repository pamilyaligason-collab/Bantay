import { createContext } from 'react'

/** Inbox unread count for the Today header bell; App provides it (the shell top bar is off on the Today root). */
export const UnreadContext = createContext(0)
