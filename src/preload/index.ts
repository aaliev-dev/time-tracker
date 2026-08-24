import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/types'

// Type-safe API exposed to renderer via contextBridge
const api = {
  tracking: {
    getCurrent: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKING_GET_CURRENT),
    pause: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKING_PAUSE),
    resume: () => ipcRenderer.invoke(IPC_CHANNELS.TRACKING_RESUME),
    onActivityChanged: (callback: (activity: unknown) => void) => {
      const listener = (_event: unknown, activity: unknown): void => {
        callback(activity)
      }
      ipcRenderer.on('tracking:activityChanged', listener)
      return () => {
        ipcRenderer.removeListener('tracking:activityChanged', listener)
      }
    }
  },
  activities: {
    getDay: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_DAY, date),
    getRange: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_RANGE, from, to),
    getSummary: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_SUMMARY, date),
    getSummaryDetailed: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_SUMMARY_DETAILED, date),
    getAfkTime: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_AFK_TIME, date)
  },
  stats: {
    getDaily: (days: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_DAILY, days),
    getTopApps: (from: string, to: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_TOP_APPS, from, to, limit),
    getHeatmap: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_HEATMAP, from, to),
    getTagStats: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_TAG_STATS, from, to),
    getWork: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_WORK, from, to),
    getTasks: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_TASKS, from, to)
  },
  categories: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_GET_ALL),
    upsert: (category: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_UPSERT, category),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORIES_DELETE, id)
  },
  rules: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.RULES_GET_ALL),
    upsert: (rule: unknown) => ipcRenderer.invoke(IPC_CHANNELS.RULES_UPSERT, rule),
    delete: (id: number) => ipcRenderer.invoke(IPC_CHANNELS.RULES_DELETE, id)
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, key, value)
  },
  export: {
    csv: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_CSV, from, to),
    json: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_JSON, from, to)
  },
  apps: {
    getIcon: (appName: string, bundleId?: string) => ipcRenderer.invoke(IPC_CHANNELS.APPS_GET_ICON, appName, bundleId)
  },
  tags: {
    getAll: () => ipcRenderer.invoke(IPC_CHANNELS.TAGS_GET_ALL),
    set: (targetType: string, targetKey: string, tag: string) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_SET, targetType, targetKey, tag),
    delete: (targetType: string, targetKey: string) => ipcRenderer.invoke(IPC_CHANNELS.TAGS_DELETE, targetType, targetKey)
  }
}

export type TimeTrackerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
