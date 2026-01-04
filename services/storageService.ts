
import { CloudConfig } from "../types.ts";

const SETTINGS_KEY = 'medauth_practice_settings';

/**
 * Gets the current cloud configuration from practice settings.
 */
const getCloudConfig = (): CloudConfig | null => {
  const settingsStr = localStorage.getItem(SETTINGS_KEY);
  if (!settingsStr) return null;
  const settings = JSON.parse(settingsStr);
  return settings.cloud || null;
};

/**
 * Universal interface for data persistence.
 * If Cloud is enabled and configured, it uses Supabase REST API.
 * Otherwise, it falls back to LocalStorage.
 */
export const storage = {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const config = getCloudConfig();
    
    if (config?.enabled && config.supabaseUrl && config.supabaseKey) {
      try {
        const table = key.replace('medauth_', '');
        const response = await fetch(`${config.supabaseUrl}/rest/v1/${table}?select=*`, {
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Local storage often stores an array, Supabase returns array.
          // If we are looking for a specific key that isn't a table, this might need adjustment.
          return data.length > 0 ? data : defaultValue;
        }
      } catch (e) {
        console.error("Cloud Fetch Failed, falling back to Local", e);
      }
    }

    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : defaultValue;
  },

  async set<T>(key: string, value: T): Promise<void> {
    // Always save locally first as a cache/backup
    localStorage.setItem(key, JSON.stringify(value));

    const config = getCloudConfig();
    if (config?.enabled && config.supabaseUrl && config.supabaseKey) {
      try {
        const table = key.replace('medauth_', '');
        
        // Supabase REST API (PostgREST) expects an array of objects for bulk upsert
        const payload = Array.isArray(value) ? value : [value];
        
        await fetch(`${config.supabaseUrl}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            'apikey': config.supabaseKey,
            'Authorization': `Bearer ${config.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify(payload)
        });
      } catch (e) {
        console.error("Cloud Sync Failed", e);
      }
    }
  },

  async testConnection(url: string, key: string): Promise<boolean> {
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        headers: { 'apikey': key }
      });
      return response.status !== 404;
    } catch {
      return false;
    }
  }
};
