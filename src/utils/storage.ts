import { UserPreferences } from '../types';

export function savePreferences(prefs: UserPreferences): void {
  try {
    chrome.storage.local.set(prefs);
  } catch (e) {
    console.warn('无法保存偏好设置:', e);
  }
}

export function loadPreferences(keys: string[]): Promise<UserPreferences> {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    } catch (e) {
      console.warn('无法加载偏好设置:', e);
      resolve({});
    }
  });
}

export function loadPreferencesCallback(keys: string[], callback: (result: UserPreferences) => void): void {
  try {
    chrome.storage.local.get(keys, (result) => {
      callback(result);
    });
  } catch (e) {
    console.warn('无法加载偏好设置:', e);
    callback({});
  }
}
