// popup.js - 弹出窗口脚本

// 获取DOM元素
const useBackendProxyCheckbox = document.getElementById('useBackendProxy');
const proxySettingsDiv = document.getElementById('proxySettings');
const backendProxyUrlInput = document.getElementById('backendProxyUrl');
const saveSettingsButton = document.getElementById('saveSettings');

// 加载保存的设置
function loadSettings() {
  chrome.storage.local.get(['useBackendProxy', 'backendProxyUrl'], (result) => {
    if (result.useBackendProxy !== undefined) {
      useBackendProxyCheckbox.checked = result.useBackendProxy;
      updateProxySettingsVisibility();
    }
    
    if (result.backendProxyUrl) {
      backendProxyUrlInput.value = result.backendProxyUrl;
    }
  });
}

// 更新代理设置区域可见性
function updateProxySettingsVisibility() {
  if (useBackendProxyCheckbox.checked) {
    proxySettingsDiv.classList.add('visible');
  } else {
    proxySettingsDiv.classList.remove('visible');
  }
}

// 保存设置
function saveSettings() {
  const useBackendProxy = useBackendProxyCheckbox.checked;
  const backendProxyUrl = backendProxyUrlInput.value.trim();

  chrome.storage.local.set({
    useBackendProxy: useBackendProxy,
    backendProxyUrl: backendProxyUrl
  }, () => {
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
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSettings',
          useBackendProxy: useBackendProxy,
          backendProxyUrl: backendProxyUrl
        });
      }
    });
  });
}

// 事件监听器
useBackendProxyCheckbox.addEventListener('change', updateProxySettingsVisibility);
saveSettingsButton.addEventListener('click', saveSettings);

// 初始化
loadSettings();
