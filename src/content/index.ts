import { Config, AppState, QueryResult, ChromeMessage, ChromeMessageResponse, UserPreferences, DOMReferences } from '../types';
import { parseHtmlResult } from '../utils/htmlParser';
import { savePreferences, loadPreferencesCallback } from '../utils/storage';

const CONFIG: Config = {
  responseTime: 300,
  defaultPanelWidth: 400,
  minPanelWidth: 250,
  maxPanelWidth: 600,
  apiUrl: 'https://wyw.hwxnet.com',
  useBackendProxy: false,
  backendProxyUrl: ''
};

const state: AppState = {
  isPanelOpen: false,
  isPanelFixed: false,
  panelWidth: CONFIG.defaultPanelWidth,
  isDragging: false,
  dragStartX: 0,
  dragStartWidth: 0,
  selectedText: '',
  lastSelectionTime: 0
};

const dom: DOMReferences = {
  panel: null,
  panelHeader: null,
  panelContent: null,
  panelHandle: null,
  toggleButton: null,
  fixButton: null,
  loadingIndicator: null
};

function init(): void {
  createPanel();
  setupEventListeners();
  loadPreferences();
}

function createPanel(): void {
  dom.panel = document.createElement('div');
  dom.panel.id = 'wyw-helper-panel';
  dom.panel.className = 'wyw-helper-panel';
  dom.panel.style.width = `${state.panelWidth}px`;
  dom.panel.style.display = 'none';

  dom.panelHandle = document.createElement('div');
  dom.panelHandle.className = 'wyw-helper-handle';
  dom.panel.appendChild(dom.panelHandle);

  dom.panelHeader = document.createElement('div');
  dom.panelHeader.className = 'wyw-helper-header';
  dom.panel.appendChild(dom.panelHeader);

  const title = document.createElement('div');
  title.className = 'wyw-helper-title';
  title.textContent = '文言文释义';
  dom.panelHeader.appendChild(title);

  const buttons = document.createElement('div');
  buttons.className = 'wyw-helper-buttons';

  dom.fixButton = document.createElement('button');
  dom.fixButton.className = 'wyw-helper-btn';
  dom.fixButton.title = '固定面板';
  dom.fixButton.textContent = '📌';
  dom.fixButton.onclick = toggleFix;
  buttons.appendChild(dom.fixButton);

  dom.toggleButton = document.createElement('button');
  dom.toggleButton.className = 'wyw-helper-btn';
  dom.toggleButton.title = '收起面板';
  dom.toggleButton.textContent = '✕';
  dom.toggleButton.onclick = togglePanel;
  buttons.appendChild(dom.toggleButton);

  dom.panelHeader.appendChild(buttons);

  dom.panelContent = document.createElement('div');
  dom.panelContent.className = 'wyw-helper-content';
  dom.panel.appendChild(dom.panelContent);

  dom.loadingIndicator = document.createElement('div');
  dom.loadingIndicator.className = 'wyw-helper-loading';
  dom.loadingIndicator.style.display = 'none';
  dom.loadingIndicator.textContent = '查询中...';
  dom.panelContent.appendChild(dom.loadingIndicator);

  document.body.appendChild(dom.panel);
}

function setupEventListeners(): void {
  document.addEventListener('dblclick', handleDoubleClick);

  if (dom.panelHandle) {
    dom.panelHandle.addEventListener('mousedown', startDrag);
  }
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && state.isPanelOpen && !state.isPanelFixed) {
      closePanel();
    }
  });

  document.addEventListener('click', (e: MouseEvent) => {
    if (!state.isPanelFixed && state.isPanelOpen && dom.panel && !dom.panel.contains(e.target as Node)) {
      setTimeout(() => {
        closePanel();
      }, 100);
    }
  });

  try {
    chrome.runtime.onMessage.addListener((request: ChromeMessage, _sender, sendResponse: (response: ChromeMessageResponse) => void) => {
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
    console.warn('Chrome runtime not available:', e);
  }
}

function handleDoubleClick(_e: MouseEvent): void {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim() || '';

  if (selectedText.length > 0) {
    state.selectedText = selectedText;
    state.lastSelectionTime = Date.now();

    openPanel();
    queryDefinition(selectedText);
  }
}

function startDrag(e: MouseEvent): void {
  state.isDragging = true;
  state.dragStartX = e.clientX;
  state.dragStartWidth = state.panelWidth;
  if (dom.panelHandle) {
    dom.panelHandle.style.cursor = 'col-resize';
  }
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
}

function handleDrag(e: MouseEvent): void {
  if (!state.isDragging) return;

  const deltaX = state.dragStartX - e.clientX;
  let newWidth = state.dragStartWidth + deltaX;

  newWidth = Math.max(CONFIG.minPanelWidth, Math.min(CONFIG.maxPanelWidth, newWidth));

  state.panelWidth = newWidth;
  if (dom.panel) {
    dom.panel.style.width = `${newWidth}px`;
  }
}

function stopDrag(): void {
  state.isDragging = false;
  if (dom.panelHandle) {
    dom.panelHandle.style.cursor = 'col-resize';
  }
  document.body.style.cursor = 'default';
  savePreferences({
    panelWidth: state.panelWidth,
    isPanelFixed: state.isPanelFixed
  });
}

function openPanel(): void {
  if (state.isPanelOpen) return;

  state.isPanelOpen = true;
  if (dom.panel) {
    dom.panel.style.display = 'block';
    setTimeout(() => {
      if (dom.panel) {
        dom.panel.style.transform = 'translateX(0)';
      }
    }, 10);
  }
}

function closePanel(): void {
  if (!state.isPanelOpen) return;

  state.isPanelOpen = false;
  if (dom.panel) {
    dom.panel.style.transform = `translateX(${state.panelWidth}px)`;

    setTimeout(() => {
      if (!state.isPanelOpen && dom.panel) {
        dom.panel.style.display = 'none';
      }
    }, 300);
  }
}

function togglePanel(): void {
  if (state.isPanelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function toggleFix(): void {
  state.isPanelFixed = !state.isPanelFixed;
  
  if (state.isPanelFixed) {
    dom.fixButton?.classList.add('active');
    if (dom.fixButton) dom.fixButton.title = '取消固定';
    dom.panel?.classList.add('fixed');
  } else {
    dom.fixButton?.classList.remove('active');
    if (dom.fixButton) dom.fixButton.title = '固定面板';
    dom.panel?.classList.remove('fixed');
  }
  
  savePreferences({
    panelWidth: state.panelWidth,
    isPanelFixed: state.isPanelFixed
  });
}

async function queryDefinition(text: string): Promise<void> {
  showLoading();
  
  try {
    let result: QueryResult;
    
    if (CONFIG.useBackendProxy && CONFIG.backendProxyUrl) {
      result = await queryWithBackendProxy(text);
    } else {
      result = await queryWithDirectFetch(text);
    }
    
    displayResult(result);
  } catch (error) {
    console.error('查询失败:', error);
    displayError('查询失败，请稍后重试');
  }
}

async function queryWithDirectFetch(text: string): Promise<QueryResult> {
  try {
    const searchUrl = `${CONFIG.apiUrl}/search.jsp?q=${encodeURIComponent(text)}`;
    
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
    return queryWithBackgroundScript(text);
  }
}

async function queryWithBackgroundScript(text: string): Promise<QueryResult> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { 
        action: 'queryDefinition', 
        text: text,
        apiUrl: CONFIG.apiUrl
      },
      (response: ChromeMessageResponse) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          reject(new Error(response.error || '查询失败'));
        }
      }
    );
  });
}

async function queryWithBackendProxy(text: string): Promise<QueryResult> {
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

function showLoading(): void {
  if (dom.panelContent && dom.loadingIndicator) {
    dom.panelContent.innerHTML = '';
    dom.panelContent.appendChild(dom.loadingIndicator);
    dom.loadingIndicator.style.display = 'block';
  }
}

function displayResult(result: QueryResult): void {
  if (!dom.panelContent) return;
  
  if (dom.loadingIndicator) {
    dom.loadingIndicator.style.display = 'none';
  }
  dom.panelContent.innerHTML = '';
  
  const wordTitle = document.createElement('div');
  wordTitle.className = 'wyw-helper-word';
  wordTitle.textContent = result.word;
  dom.panelContent.appendChild(wordTitle);
  
  if (result.phonetic) {
    const phoneticEl = document.createElement('div');
    phoneticEl.className = 'wyw-helper-phonetic';
    phoneticEl.textContent = result.phonetic;
    dom.panelContent.appendChild(phoneticEl);
  }
  
  if (result.definitions && result.definitions.length > 0) {
    const defSection = document.createElement('div');
    defSection.className = 'wyw-helper-section';
    
    const defTitle = document.createElement('div');
    defTitle.className = 'wyw-helper-section-title';
    defTitle.textContent = '释义';
    defSection.appendChild(defTitle);
    
    const defList = document.createElement('ul');
    defList.className = 'wyw-helper-list';
    
    result.definitions.forEach((def: string, index: number) => {
      const li = document.createElement('li');
      li.className = 'wyw-helper-list-item';
      li.innerHTML = `<span class="wyw-helper-index">${index + 1}.</span> ${def}`;
      defList.appendChild(li);
    });
    
    defSection.appendChild(defList);
    dom.panelContent.appendChild(defSection);
  }
  
  if (result.examples && result.examples.length > 0) {
    const exampleSection = document.createElement('div');
    exampleSection.className = 'wyw-helper-section';
    
    const exampleTitle = document.createElement('div');
    exampleTitle.className = 'wyw-helper-section-title';
    exampleTitle.textContent = '例句';
    exampleSection.appendChild(exampleTitle);
    
    const exampleList = document.createElement('ul');
    exampleList.className = 'wyw-helper-list';
    
    result.examples.forEach((example: string, index: number) => {
      const li = document.createElement('li');
      li.className = 'wyw-helper-list-item';
      li.innerHTML = `<span class="wyw-helper-index">${index + 1}.</span> ${example}`;
      exampleList.appendChild(li);
    });
    
    exampleSection.appendChild(exampleList);
    dom.panelContent.appendChild(exampleSection);
  }
  
  if (!result.hasResult) {
    const noResult = document.createElement('div');
    noResult.className = 'wyw-helper-no-result';
    noResult.textContent = '暂无释义';
    dom.panelContent.appendChild(noResult);
  }
}

function displayError(message: string): void {
  if (!dom.panelContent) return;
  
  if (dom.loadingIndicator) {
    dom.loadingIndicator.style.display = 'none';
  }
  dom.panelContent.innerHTML = '';
  
  const errorEl = document.createElement('div');
  errorEl.className = 'wyw-helper-error';
  errorEl.textContent = message;
  dom.panelContent.appendChild(errorEl);
}

function loadPreferences(): void {
  loadPreferencesCallback(['panelWidth', 'isPanelFixed'], (result: UserPreferences) => {
    if (result.panelWidth !== undefined && dom.panel) {
      state.panelWidth = result.panelWidth;
      dom.panel.style.width = `${state.panelWidth}px`;
    }
    
    if (result.isPanelFixed !== undefined) {
      state.isPanelFixed = result.isPanelFixed;
      if (state.isPanelFixed) {
        dom.fixButton?.classList.add('active');
        dom.panel?.classList.add('fixed');
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
