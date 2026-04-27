(function() {
  'use strict';

  // 配置
  const CONFIG = {
    responseTime: 300, // 300ms内响应
    defaultPanelWidth: 400, // 默认面板宽度
    minPanelWidth: 250, // 最小面板宽度
    maxPanelWidth: 600, // 最大面板宽度
    apiUrl: 'https://wyw.hwxnet.com', // 默认API地址
    useBackendProxy: false, // 是否使用后端代理
    backendProxyUrl: '' // 后端代理地址（后续配置）
  };

  // 状态管理
  const state = {
    isPanelOpen: false,
    isPanelFixed: false,
    panelWidth: CONFIG.defaultPanelWidth,
    isDragging: false,
    dragStartX: 0,
    dragStartWidth: 0,
    selectedText: '',
    lastSelectionTime: 0
  };

  // DOM元素引用
  let panel = null;
  let panelHeader = null;
  let panelContent = null;
  let panelHandle = null;
  let toggleButton = null;
  let fixButton = null;
  let loadingIndicator = null;

  // 初始化
  function init() {
    createPanel();
    setupEventListeners();
    loadPreferences();
  }

  // 创建面板
  function createPanel() {
    // 主面板容器
    panel = document.createElement('div');
    panel.id = 'wyw-helper-panel';
    panel.className = 'wyw-helper-panel';
    panel.style.width = `${state.panelWidth}px`;
    panel.style.display = 'none';

    // 拖动调整大小的手柄
    panelHandle = document.createElement('div');
    panelHandle.className = 'wyw-helper-handle';
    panel.appendChild(panelHandle);

    // 面板头部
    panelHeader = document.createElement('div');
    panelHeader.className = 'wyw-helper-header';
    panel.appendChild(panelHeader);

    // 标题
    const title = document.createElement('div');
    title.className = 'wyw-helper-title';
    title.textContent = '文言文释义';
    panelHeader.appendChild(title);

    // 按钮容器
    const buttons = document.createElement('div');
    buttons.className = 'wyw-helper-buttons';

    // 固定按钮
    fixButton = document.createElement('button');
    fixButton.className = 'wyw-helper-btn';
    fixButton.title = '固定面板';
    fixButton.textContent = '📌';
    fixButton.onclick = toggleFix;
    buttons.appendChild(fixButton);

    // 收起按钮
    toggleButton = document.createElement('button');
    toggleButton.className = 'wyw-helper-btn';
    toggleButton.title = '收起面板';
    toggleButton.textContent = '✕';
    toggleButton.onclick = togglePanel;
    buttons.appendChild(toggleButton);

    panelHeader.appendChild(buttons);

    // 面板内容
    panelContent = document.createElement('div');
    panelContent.className = 'wyw-helper-content';
    panel.appendChild(panelContent);

    // 加载指示器
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'wyw-helper-loading';
    loadingIndicator.style.display = 'none';
    loadingIndicator.textContent = '查询中...';
    panelContent.appendChild(loadingIndicator);

    // 添加到页面
    document.body.appendChild(panel);
  }

  // 设置事件监听器
  function setupEventListeners() {
    // 双击事件
    document.addEventListener('dblclick', handleDoubleClick);

    // 鼠标事件（用于面板拖拽调整大小）
    panelHandle.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', stopDrag);

    // 键盘事件（ESC关闭面板）
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isPanelOpen && !state.isPanelFixed) {
        closePanel();
      }
    });

    // 点击其他区域关闭面板（非固定模式）
    document.addEventListener('click', (e) => {
      if (!state.isPanelFixed && state.isPanelOpen && !panel.contains(e.target)) {
        // 延迟关闭，避免与双击选择冲突
        setTimeout(() => {
          closePanel();
        }, 100);
      }
    });

    // 监听来自popup的设置更新消息
    try {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'updateSettings') {
          if (request.useBackendProxy !== undefined) {
            CONFIG.useBackendProxy = request.useBackendProxy;
          }
          if (request.backendProxyUrl !== undefined) {
            CONFIG.backendProxyUrl = request.backendProxyUrl;
          }
          sendResponse({ success: true });
        }
        return true;
      });
    } catch (e) {
      // 如果不在插件环境中，忽略错误
    }
  }

  // 处理双击事件
  function handleDoubleClick(e) {
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    if (selectedText.length > 0) {
      state.selectedText = selectedText;
      state.lastSelectionTime = Date.now();

      // 显示面板并查询
      openPanel();
      queryDefinition(selectedText);
    }
  }

  // 开始拖拽调整大小
  function startDrag(e) {
    state.isDragging = true;
    state.dragStartX = e.clientX;
    state.dragStartWidth = state.panelWidth;
    panelHandle.style.cursor = 'col-resize';
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  }

  // 处理拖拽
  function handleDrag(e) {
    if (!state.isDragging) return;

    const deltaX = state.dragStartX - e.clientX;
    let newWidth = state.dragStartWidth + deltaX;

    // 限制宽度范围
    newWidth = Math.max(CONFIG.minPanelWidth, Math.min(CONFIG.maxPanelWidth, newWidth));

    state.panelWidth = newWidth;
    panel.style.width = `${newWidth}px`;
  }

  // 停止拖拽
  function stopDrag() {
    state.isDragging = false;
    panelHandle.style.cursor = 'col-resize';
    document.body.style.cursor = 'default';
    savePreferences();
  }

  // 打开面板
  function openPanel() {
    if (state.isPanelOpen) return;

    state.isPanelOpen = true;
    panel.style.display = 'block';
    // 触发动画
    setTimeout(() => {
      panel.style.transform = 'translateX(0)';
    }, 10);
  }

  // 关闭面板
  function closePanel() {
    if (!state.isPanelOpen) return;

    state.isPanelOpen = false;
    panel.style.transform = `translateX(${state.panelWidth}px)`;

    // 延迟隐藏，等待动画完成
    setTimeout(() => {
      if (!state.isPanelOpen) {
        panel.style.display = 'none';
      }
    }, 300);
  }

  // 切换面板显示/隐藏
  function togglePanel() {
    if (state.isPanelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }

  // 切换固定状态
  function toggleFix() {
    state.isPanelFixed = !state.isPanelFixed;
    
    if (state.isPanelFixed) {
      fixButton.classList.add('active');
      fixButton.title = '取消固定';
      panel.classList.add('fixed');
    } else {
      fixButton.classList.remove('active');
      fixButton.title = '固定面板';
      panel.classList.remove('fixed');
    }
    
    savePreferences();
  }

  // 查询释义
  async function queryDefinition(text) {
    // 显示加载状态
    showLoading();
    
    try {
      let result;
      
      if (CONFIG.useBackendProxy && CONFIG.backendProxyUrl) {
        // 使用后端代理
        result = await queryWithBackendProxy(text);
      } else {
        // 前端直连
        result = await queryWithDirectFetch(text);
      }
      
      // 显示结果
      displayResult(result);
    } catch (error) {
      console.error('查询失败:', error);
      displayError('查询失败，请稍后重试');
    }
  }

  // 前端直连查询
  async function queryWithDirectFetch(text) {
    try {
      // 构建查询URL（根据网站实际情况调整）
      const searchUrl = `${CONFIG.apiUrl}/search.jsp?q=${encodeURIComponent(text)}`;
      
      // 由于跨域限制，这里使用代理模式
      // 实际实现中可能需要使用background script进行请求
      const response = await fetch(searchUrl, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const html = await response.text();
      return parseHtmlResult(html, text);
    } catch (error) {
      // 直接请求可能会被CORS阻止，尝试通过background script
      return queryWithBackgroundScript(text);
    }
  }

  // 通过background script查询（处理跨域）
  async function queryWithBackgroundScript(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { 
          action: 'queryDefinition', 
          text: text,
          apiUrl: CONFIG.apiUrl
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response.error || '查询失败'));
          }
        }
      );
    });
  }

  // 使用后端代理查询（后续实现）
  async function queryWithBackendProxy(text) {
    const response = await fetch(CONFIG.backendProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: text })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  }

  // 解析HTML结果
  function parseHtmlResult(html, originalText) {
    // 创建临时DOM元素来解析HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 这里需要根据目标网站的实际HTML结构进行调整
    // 以下是示例解析逻辑，需要根据实际网站结构修改
    
    let definitions = [];
    let phonetic = '';
    let examples = [];
    
    // 尝试查找常见的释义元素
    // 1. 查找拼音/发音
    const phoneticElements = doc.querySelectorAll('.pinyin, .pronunciation, [class*="yin"], [class*="pin"]');
    if (phoneticElements.length > 0) {
      phonetic = phoneticElements[0].textContent.trim();
    }
    
    // 2. 查找释义
    const definitionElements = doc.querySelectorAll('.definition, .meaning, .explain, [class*="yi"], [class*="shi"]');
    definitionElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 0 && !definitions.includes(text)) {
        definitions.push(text);
      }
    });
    
    // 3. 查找例句
    const exampleElements = doc.querySelectorAll('.example, .sentence, [class*="li"], [class*="ju"]');
    exampleElements.forEach(el => {
      const text = el.textContent.trim();
      if (text.length > 0 && !examples.includes(text)) {
        examples.push(text);
      }
    });
    
    // 如果没有找到明确的结构，尝试更通用的方法
    if (definitions.length === 0) {
      // 查找所有段落和列表项
      const contentElements = doc.querySelectorAll('p, li, .content, .main');
      contentElements.forEach(el => {
        const text = el.textContent.trim();
        // 简单的启发式：包含"："或"。"的可能是释义
        if (text.length > 5 && (text.includes('：') || text.includes('。'))) {
          if (!definitions.includes(text)) {
            definitions.push(text);
          }
        }
      });
    }
    
    return {
      word: originalText,
      phonetic: phonetic,
      definitions: definitions,
      examples: examples,
      hasResult: definitions.length > 0
    };
  }

  // 显示加载状态
  function showLoading() {
    panelContent.innerHTML = '';
    panelContent.appendChild(loadingIndicator);
    loadingIndicator.style.display = 'block';
  }

  // 显示查询结果
  function displayResult(result) {
    loadingIndicator.style.display = 'none';
    panelContent.innerHTML = '';
    
    // 标题（查询的词）
    const wordTitle = document.createElement('div');
    wordTitle.className = 'wyw-helper-word';
    wordTitle.textContent = result.word;
    panelContent.appendChild(wordTitle);
    
    // 拼音
    if (result.phonetic) {
      const phoneticEl = document.createElement('div');
      phoneticEl.className = 'wyw-helper-phonetic';
      phoneticEl.textContent = result.phonetic;
      panelContent.appendChild(phoneticEl);
    }
    
    // 释义
    if (result.definitions && result.definitions.length > 0) {
      const defSection = document.createElement('div');
      defSection.className = 'wyw-helper-section';
      
      const defTitle = document.createElement('div');
      defTitle.className = 'wyw-helper-section-title';
      defTitle.textContent = '释义';
      defSection.appendChild(defTitle);
      
      const defList = document.createElement('ul');
      defList.className = 'wyw-helper-list';
      
      result.definitions.forEach((def, index) => {
        const li = document.createElement('li');
        li.className = 'wyw-helper-list-item';
        li.innerHTML = `<span class="wyw-helper-index">${index + 1}.</span> ${def}`;
        defList.appendChild(li);
      });
      
      defSection.appendChild(defList);
      panelContent.appendChild(defSection);
    }
    
    // 例句
    if (result.examples && result.examples.length > 0) {
      const exampleSection = document.createElement('div');
      exampleSection.className = 'wyw-helper-section';
      
      const exampleTitle = document.createElement('div');
      exampleTitle.className = 'wyw-helper-section-title';
      exampleTitle.textContent = '例句';
      exampleSection.appendChild(exampleTitle);
      
      const exampleList = document.createElement('ul');
      exampleList.className = 'wyw-helper-list';
      
      result.examples.forEach((example, index) => {
        const li = document.createElement('li');
        li.className = 'wyw-helper-list-item';
        li.innerHTML = `<span class="wyw-helper-index">${index + 1}.</span> ${example}`;
        exampleList.appendChild(li);
      });
      
      exampleSection.appendChild(exampleList);
      panelContent.appendChild(exampleSection);
    }
    
    // 无结果情况
    if (!result.hasResult) {
      const noResult = document.createElement('div');
      noResult.className = 'wyw-helper-no-result';
      noResult.textContent = '暂无释义';
      panelContent.appendChild(noResult);
    }
  }

  // 显示错误
  function displayError(message) {
    loadingIndicator.style.display = 'none';
    panelContent.innerHTML = '';
    
    const errorEl = document.createElement('div');
    errorEl.className = 'wyw-helper-error';
    errorEl.textContent = message;
    panelContent.appendChild(errorEl);
  }

  // 保存用户偏好
  function savePreferences() {
    try {
      chrome.storage.local.set({
        panelWidth: state.panelWidth,
        isPanelFixed: state.isPanelFixed
      });
    } catch (e) {
      // 如果不在插件环境中，忽略错误
    }
  }

  // 加载用户偏好
  function loadPreferences() {
    try {
      chrome.storage.local.get(['panelWidth', 'isPanelFixed'], (result) => {
        if (result.panelWidth) {
          state.panelWidth = result.panelWidth;
          panel.style.width = `${state.panelWidth}px`;
        }
        
        if (result.isPanelFixed) {
          state.isPanelFixed = result.isPanelFixed;
          if (state.isPanelFixed) {
            fixButton.classList.add('active');
            panel.classList.add('fixed');
          }
        }
      });
    } catch (e) {
      // 如果不在插件环境中，忽略错误
    }
  }

  // 初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
