import { UserPreferences, ChromeMessage, ChromeMessageResponse } from '../types';

console.log('[文言文助手] popup/index.ts 加载中...');

// 等待DOM加载完成后再执行
document.addEventListener('DOMContentLoaded', () => {
  console.log('[文言文助手] DOM已加载完成');
  
  // 在DOM加载完成后再获取元素
  const useBackendProxyCheckbox = document.getElementById('useBackendProxy') as HTMLInputElement | null;
  const proxySettingsDiv = document.getElementById('proxySettings') as HTMLElement | null;
  const backendProxyUrlInput = document.getElementById('backendProxyUrl') as HTMLInputElement | null;
  const saveSettingsButton = document.getElementById('saveSettings') as HTMLButtonElement | null;
  const resetSettingsButton = document.getElementById('resetSettings') as HTMLButtonElement | null;

  console.log('[文言文助手] DOM元素获取:', {
    useBackendProxyCheckbox: useBackendProxyCheckbox !== null,
    proxySettingsDiv: proxySettingsDiv !== null,
    backendProxyUrlInput: backendProxyUrlInput !== null,
    saveSettingsButton: saveSettingsButton !== null,
    resetSettingsButton: resetSettingsButton !== null
  });

  function loadSettings(): void {
    console.log('[文言文助手] 开始加载设置...');
    
    if (!useBackendProxyCheckbox || !backendProxyUrlInput) {
      console.error('[文言文助手] DOM元素未找到，无法加载设置');
      return;
    }
    
    chrome.storage.local.get(['useBackendProxy', 'backendProxyUrl', 'panelWidth', 'isPanelFixed'], (result: UserPreferences) => {
      console.log('[文言文助手] 从storage读取到的设置:', result);
      
      // 无论是否有保存的设置，都更新checkbox状态
      if (result.useBackendProxy !== undefined) {
        useBackendProxyCheckbox.checked = result.useBackendProxy;
        console.log('[文言文助手] 使用保存的 useBackendProxy:', result.useBackendProxy);
      } else {
        // 默认是关闭状态
        useBackendProxyCheckbox.checked = false;
        console.log('[文言文助手] 使用默认的 useBackendProxy: false');
      }
      
      // 总是更新可见性
      updateProxySettingsVisibility();
      
      if (result.backendProxyUrl) {
        backendProxyUrlInput.value = result.backendProxyUrl;
        console.log('[文言文助手] 使用保存的 backendProxyUrl:', result.backendProxyUrl);
      }
      
      console.log('[文言文助手] 设置加载完成, useBackendProxy:', useBackendProxyCheckbox.checked);
    });
  }

  function updateProxySettingsVisibility(): void {
    console.log('[文言文助手] 更新代理设置可见性, checked:', useBackendProxyCheckbox?.checked);
    
    if (!useBackendProxyCheckbox) {
      console.error('[文言文助手] useBackendProxyCheckbox 为 null');
      return;
    }
    
    if (!proxySettingsDiv) {
      console.error('[文言文助手] proxySettingsDiv 为 null');
      return;
    }
    
    if (useBackendProxyCheckbox.checked) {
      proxySettingsDiv.classList.add('visible');
      console.log('[文言文助手] 已添加 visible 类');
    } else {
      proxySettingsDiv.classList.remove('visible');
      console.log('[文言文助手] 已移除 visible 类');
    }
  }

  function saveSettings(): void {
    if (!useBackendProxyCheckbox || !backendProxyUrlInput || !saveSettingsButton) {
      console.error('[文言文助手] DOM元素未找到，无法保存设置');
      return;
    }
    
    const useBackendProxy = useBackendProxyCheckbox.checked;
    const backendProxyUrl = backendProxyUrlInput.value.trim();

    console.log('[文言文助手] 保存设置:', {
      useBackendProxy: useBackendProxy,
      backendProxyUrl: backendProxyUrl
    });

    chrome.storage.local.set({
      useBackendProxy: useBackendProxy,
      backendProxyUrl: backendProxyUrl
    }, () => {
      console.log('[文言文助手] 设置已保存到storage');
      
      const originalText = saveSettingsButton.textContent || '保存设置';
      saveSettingsButton.textContent = '保存成功！';
      saveSettingsButton.style.backgroundColor = '#28a745';
      
      setTimeout(() => {
        saveSettingsButton.textContent = originalText;
        saveSettingsButton.style.backgroundColor = '#0078d4';
      }, 1500);

      // 通知content script更新配置
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        console.log('[文言文助手] 查询到的标签页:', tabs);
        
        if (tabs[0] && tabs[0].id !== undefined) {
          console.log('[文言文助手] 向标签页发送消息, tabId:', tabs[0].id);
          
          const message: ChromeMessage = {
            action: 'updateSettings',
            useBackendProxy: useBackendProxy,
            backendProxyUrl: backendProxyUrl
          };
          
          chrome.tabs.sendMessage(tabs[0].id, message, (response: ChromeMessageResponse) => {
            console.log('[文言文助手] 收到content script的响应:', response);
          });
        } else {
          console.log('[文言文助手] 没有找到活动标签页');
        }
      });
    });
  }

  function resetSettings(): void {
    console.log('[文言文助手] 重置所有设置...');
    
    // 清除所有存储的设置
    chrome.storage.local.clear(() => {
      console.log('[文言文助手] 已清除所有storage中的设置');
      
      // 重置UI
      if (useBackendProxyCheckbox) {
        useBackendProxyCheckbox.checked = false;
      }
      if (backendProxyUrlInput) {
        backendProxyUrlInput.value = '';
      }
      
      updateProxySettingsVisibility();
      
      // 显示成功提示
      if (resetSettingsButton) {
        const originalText = resetSettingsButton.textContent || '重置设置';
        resetSettingsButton.textContent = '已重置！';
        resetSettingsButton.style.backgroundColor = '#ff6347';
        
        setTimeout(() => {
          resetSettingsButton.textContent = originalText;
          resetSettingsButton.style.backgroundColor = '#6c757d';
        }, 1500);
      }
    });
  }

  // 绑定事件监听器
  if (useBackendProxyCheckbox) {
    useBackendProxyCheckbox.addEventListener('change', () => {
      console.log('[文言文助手] checkbox状态改变:', useBackendProxyCheckbox.checked);
      updateProxySettingsVisibility();
    });
  }

  if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', saveSettings);
  }

  if (resetSettingsButton) {
    resetSettingsButton.addEventListener('click', resetSettings);
  }

  // 加载设置
  loadSettings();

  console.log('[文言文助手] popup/index.ts 初始化完成');
});
