// Shared types — used in both main process and renderer

export interface ActivityEvent {
  id?: number
  tsStart: string // ISO 8601
  tsEnd: string // ISO 8601
  duration: number // seconds
  appName: string
  appBundleId?: string
  windowTitle: string
  url?: string | null
  categoryId?: number | null
  isAfk: boolean
  isPrivate: boolean
}

export interface CurrentActivity {
  appName: string
  windowTitle: string
  tsStart: string
  isAfk: boolean
  isPaused: boolean
}

export interface Category {
  id: number
  name: string
  color: string
  productivity: number // -2..+2
  sortOrder: number
}

export interface CategoryRule {
  id: number
  categoryId: number
  field: 'app_name' | 'window_title' | 'url' | 'app_bundle'
  matchType: 'equals' | 'contains' | 'startsWith' | 'regex'
  value: string
}

export interface DaySummary {
  appName: string
  totalTime: number // seconds
  percentage: number
  categoryId?: number | null
  categoryName?: string
}

export interface DailyStat {
  date: string // YYYY-MM-DD
  totalActive: number // seconds
  byCategory: { category: string; seconds: number }[]
}

// IPC channel names — single source of truth
export const IPC_CHANNELS = {
  ACTIVITIES_GET_DAY: 'activities:getDay',
  ACTIVITIES_GET_RANGE: 'activities:getRange',
  ACTIVITIES_GET_SUMMARY: 'activities:getSummary',
  STATS_GET_DAILY: 'stats:getDaily',
  STATS_GET_TOP_APPS: 'stats:getTopApps',
  STATS_GET_HEATMAP: 'stats:getHeatmap',
  CATEGORIES_GET_ALL: 'categories:getAll',
  CATEGORIES_UPSERT: 'categories:upsert',
  CATEGORIES_DELETE: 'categories:delete',
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  TRACKING_GET_CURRENT: 'tracking:getCurrent',
  TRACKING_PAUSE: 'tracking:pause',
  TRACKING_RESUME: 'tracking:resume',
  EXPORT_CSV: 'export:csv'
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]

// API exposed to renderer via contextBridge
export interface TimeTrackerApi {
  tracking: {
    getCurrent: () => Promise<CurrentActivity | null>
    pause: () => Promise<void>
    resume: () => Promise<void>
  }
  activities: {
    getDay: (date: string) => Promise<ActivityEvent[]>
    getRange: (from: string, to: string) => Promise<ActivityEvent[]>
    getSummary: (date: string) => Promise<DaySummary[]>
  }
  stats: {
    getDaily: (days: number) => Promise<DailyStat[]>
    getTopApps: (from: string, to: string, limit?: number) => Promise<DaySummary[]>
    getHeatmap: (from: string, to: string) => Promise<unknown[]>
  }
  categories: {
    getAll: () => Promise<Category[]>
    upsert: (category: Partial<Category>) => Promise<Category>
    delete: (id: number) => Promise<void>
  }
  settings: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
  }
  export: {
    csv: (from: string, to: string) => Promise<string>
  }
}
