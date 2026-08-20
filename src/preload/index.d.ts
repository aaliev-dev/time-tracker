import type { TimeTrackerApi } from '../main/types'

declare global {
  interface Window {
    api: TimeTrackerApi
  }
}
