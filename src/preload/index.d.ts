import type { TimeTrackerApi } from '../shared/types'

declare global {
  interface Window {
    api: TimeTrackerApi
  }
}
