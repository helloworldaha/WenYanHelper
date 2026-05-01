// popup.js - 弹出窗口脚本

console.log('[文言文助手] popup.js 加载中...');

// 获取DOM元素
const useBackendProxyCheckbox = document.getElementById('useBackendProxy');
const proxySettingsDiv = document.getElementById('proxySettings');
const backendProxyUrlInput = document.getElementById('backendProxyUrl');
const saveSettingsButton = document.getElementById('saveSettings');

console.log('[文言文助手] DOM元素获取:', {
  useBackendProxyCheckbox: useBackendProxyCheckbox !== null,
  proxySettingsDiv: proxySettingsDiv !== null,
  backendProxyUrlInput: backendProxyUrlInput !== null,
  saveSettingsButton: saveSettingsButton !== null
});

// 加载保存的设置
function loadSettings() {
  console.log('[文言文助手] 开始加载设置...');
  
  chrome.storage.local.get(['useBackendProxy', 'backendProxyUrl'], (result) => {
    console.log('[文言文助手] 从storage读取到的设置:', result);
    
    // 无论是否有保存的设置，都更新checkbox状态
    if (result.useBackendProxy !== undefined) {
      useBackendProxyCheckbox.checked = result.useBackendProxy;
    } else {
      // 默认是关闭状态
      useBackendProxyCheckbox.checked = false;
    }
    
    // 总是更新可见性
    updateProxySettingsVisibility();
    
    if (result.backendProxyUrl) {
      backendProxyUrlInput.value = result.backendProxyUrl;
    }
    
    console.log('[文言文助手] 设置加载完成, useBackendProxy:', useBackendProxyCheckbox.checked);
  });
}

// 更新代理设置区域可见性
function updateProxySettingsVisibility() {
  console.log('[文言文助手] 更新代理设置可见性, checked:', useBackendProxyCheckbox.checked);
  
  if (useBackendProxyCheckbox.checked) {
    proxySettingsDiv.classList.add('visible');
    console.log('[文言文助手] 已添加 visible 类');
  } else {
    proxySettingsDiv.classList.remove('visible');
    console.log('[文言文助手] 已移除 visible 类');
  }
}

// 保存设置
function saveSettings() {
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
    
    // 显示保存成功提示
    const originalText = saveSettingsButton.textContent;
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
        
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          useBackendProxy: useBackendProxy,
          backendProxyUrl: backendProxyUrl
        }, (response) => {
          console.log('[文言文助手] 收到content script的响应:', response);
        });
      } else {
        console.log('[文言文助手] 没有找到活动标签页');
      }
    });
  });
}

// 事件监听器
useBackendProxyCheckbox.addEventListener('change', () => {
  console.log('[文言文助手] checkbox状态改变:', useBackendProxyCheckbox.checked);
  updateProxySettingsVisibility();
});

saveSettingsButton.addEventListener('click', saveSettings);

// 初始化
loadSettings();

console.log('[文言文助手] popup.js 初始化完成');
