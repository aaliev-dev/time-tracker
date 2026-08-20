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
    getSummaryDetailed: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVITIES_GET_SUMMARY_DETAILED, date)
  },
  stats: {
    getDaily: (days: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_DAILY, days),
    getTopApps: (from: string, to: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_TOP_APPS, from, to, limit),
    getProductivity: (days: number) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_PRODUCTIVITY, days),
    getHeatmap: (from: string, to: string) => ipcRenderer.invoke(IPC_CHANNELS.STATS_GET_HEATMAP, from, to)
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
  }
}

export type TimeTrackerApi = typeof api

contextBridge.exposeInMainWorld('api', api)
