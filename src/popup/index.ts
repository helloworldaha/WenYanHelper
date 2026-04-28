import { UserPreferences, ChromeMessage, ChromeMessageResponse } from '../types';

const useBackendProxyCheckbox = document.getElementById('useBackendProxy') as HTMLInputElement | null;
const proxySettingsDiv = document.getElementById('proxySettings') as HTMLElement | null;
const backendProxyUrlInput = document.getElementById('backendProxyUrl') as HTMLInputElement | null;
const saveSettingsButton = document.getElementById('saveSettings') as HTMLButtonElement | null;

function loadSettings(): void {
  if (!useBackendProxyCheckbox || !backendProxyUrlInput) return;
  
  chrome.storage.local.get(['useBackendProxy', 'backendProxyUrl'], (result: UserPreferences) => {
    if (result.useBackendProxy !== undefined) {
      useBackendProxyCheckbox.checked = result.useBackendProxy;
      updateProxySettingsVisibility();
    }
    
    if (result.backendProxyUrl) {
      backendProxyUrlInput.value = result.backendProxyUrl;
    }
  });
}

function updateProxySettingsVisibility(): void {
  if (!useBackendProxyCheckbox || !proxySettingsDiv) return;
  
  if (useBackendProxyCheckbox.checked) {
    proxySettingsDiv.classList.add('visible');
  } else {
    proxySettingsDiv.classList.remove('visible');
  }
}

function saveSettings(): void {
  if (!useBackendProxyCheckbox || !backendProxyUrlInput || !saveSettingsButton) return;
  
  const useBackendProxy = useBackendProxyCheckbox.checked;
  const backendProxyUrl = backendProxyUrlInput.value.trim();

  chrome.storage.local.set({
    useBackendProxy: useBackendProxy,
    backendProxyUrl: backendProxyUrl
  }, () => {
    const originalText = saveSettingsButton.textContent || '保存设置';
    saveSettingsButton.textContent = '保存成功！';
    saveSettingsButton.style.backgroundColor = '#28a745';
    
    setTimeout(() => {
      saveSettingsButton.textContent = originalText;
      saveSettingsButton.style.backgroundColor = '#0078d4';
    }, 1500);

    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0] && tabs[0].id !== undefined) {
        const message: ChromeMessage = {
          action: 'updateSettings',
          useBackendProxy: useBackendProxy,
          backendProxyUrl: backendProxyUrl
        };
        
        chrome.tabs.sendMessage(tabs[0].id, message, (_response: ChromeMessageResponse) => {
        });
      }
    });
  });
}

if (useBackendProxyCheckbox) {
  useBackendProxyCheckbox.addEventListener('change', updateProxySettingsVisibility);
}

if (saveSettingsButton) {
  saveSettingsButton.addEventListener('click', saveSettings);
}

loadSettings();
