import { QueryResult, ChromeMessage, ChromeMessageResponse } from '../types';
import { parseHtmlResponse } from '../utils/htmlParser';

console.log('[文言文助手] background/index.ts 加载中...');

interface BackendAPIResponse {
  success: boolean;
  data?: QueryResult;
  error?: string;
}

chrome.runtime.onMessage.addListener((request: ChromeMessage, _sender, sendResponse: (response: ChromeMessageResponse) => void) => {
  console.log('[文言文助手] Background: 收到消息:', request);
  
  if (request.action === 'queryDefinition') {
    handleQueryDefinition(request, sendResponse);
    return true;
  }
  
  return false;
});

async function handleQueryDefinition(request: ChromeMessage, sendResponse: (response: ChromeMessageResponse) => void): Promise<void> {
  try {
    const { text, apiUrl, useBackendProxy, backendProxyUrl } = request;
    
    console.log('[文言文助手] Background: 处理查询请求:', {
      text: text,
      apiUrl: apiUrl,
      useBackendProxy: useBackendProxy,
      backendProxyUrl: backendProxyUrl
    });
    
    if (!text) {
      throw new Error('缺少必要参数: text');
    }
    
    if (useBackendProxy && backendProxyUrl) {
      console.log('[文言文助手] Background: 使用后端代理模式');
      const result = await queryViaBackendProxy(text, backendProxyUrl);
      console.log('[文言文助手] Background: 后端代理返回成功');
      sendResponse({
        success: true,
        data: result
      });
      return;
    }
    
    console.log('[文言文助手] Background: 使用直接请求模式');
    
    if (!apiUrl) {
      throw new Error('缺少必要参数: apiUrl');
    }
    
    const result = await queryDirectly(text, apiUrl);
    sendResponse({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[文言文助手] Background: 查询失败:', error);
    const errorMessage = error instanceof Error ? error.message : '查询失败';
    sendResponse({
      success: false,
      error: errorMessage
    });
  }
}

async function queryViaBackendProxy(word: string, backendProxyUrl: string): Promise<QueryResult> {
  console.log('[文言文助手] Background: queryViaBackendProxy 被调用, word:', word, ', backendProxyUrl:', backendProxyUrl);
  
  // 修复 URL 拼接逻辑：如果用户已经输入了完整的 API 路径，就不再重复拼接
  let baseUrl = backendProxyUrl.trim();
  
  // 移除末尾的斜杠
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  
  let queryUrl: string;
  // 检查是否已经包含 /api/query 路径
  if (baseUrl.includes('/api/query')) {
    // 如果已经包含，直接使用（添加查询参数）
    const separator = baseUrl.includes('?') ? '&' : '?';
    queryUrl = `${baseUrl}${separator}word=${encodeURIComponent(word)}`;
  } else {
    // 如果不包含，拼接 /api/query 路径
    queryUrl = `${baseUrl}/api/query?word=${encodeURIComponent(word)}`;
  }
  
  console.log('[文言文助手] Background: 最终请求 URL:', queryUrl);
  
  const response = await fetch(queryUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    throw new Error(`后端代理请求失败: HTTP ${response.status}`);
  }
  
  const result: BackendAPIResponse = await response.json();
  console.log('[文言文助手] Background: 后端代理返回结果:', result);
  
  if (!result.success) {
    throw new Error(result.error || '后端代理查询失败');
  }
  
  if (!result.data) {
    throw new Error('后端代理返回数据为空');
  }
  
  return result.data;
}

async function queryDirectly(text: string, apiUrl: string): Promise<QueryResult> {
  await fetch(apiUrl, {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': apiUrl
    },
    credentials: 'include',
    redirect: 'follow'
  });
  
  const encodedText = encodeURIComponent(text);
  const searchUrl = `${apiUrl}/search.do?wd=${encodedText}&x=0&y=0`;
  
  let response = await fetch(searchUrl, {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Referer': apiUrl
    },
    credentials: 'include',
    redirect: 'follow'
  });
  
  if (!response.ok) {
    throw new Error(`HTTP错误: ${response.status}`);
  }
  
  let html = await response.text();
  
  if (!response.url.includes('/view/')) {
    let redirectUrl: string | null = null;
    
    const locationHrefMatch = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
    if (locationHrefMatch && locationHrefMatch[1]) {
      redirectUrl = locationHrefMatch[1];
    }
    
    if (!redirectUrl) {
      const locationMatch = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
      if (locationMatch && locationMatch[1]) {
        redirectUrl = locationMatch[1];
      }
    }
    
    if (!redirectUrl) {
      const hrefMatch = html.match(/location\.href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        redirectUrl = hrefMatch[1];
      }
    }
    
    if (!redirectUrl) {
      const metaRefreshMatch = html.match(/<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']\d+;\s*url\s*=\s*([^"']+)["']/i);
      if (metaRefreshMatch && metaRefreshMatch[1]) {
        redirectUrl = metaRefreshMatch[1];
      }
    }
    
    if (!redirectUrl) {
      const viewLinkMatches: string[] = [];
      const viewLinkPattern = /href\s*=\s*["']([^"']*\/view\/[^"']+)["']/gi;
      let match;
      
      while ((match = viewLinkPattern.exec(html)) !== null) {
        viewLinkMatches.push(match[1]);
      }
      
      if (viewLinkMatches.length > 0) {
        const encodedText = encodeURIComponent(text);
        for (const link of viewLinkMatches) {
          if (link.includes(encodedText) || link.includes(text)) {
            redirectUrl = link;
            break;
          }
        }
        
        if (!redirectUrl) {
          redirectUrl = viewLinkMatches[0];
        }
      }
    }
    
    if (!redirectUrl) {
      const allLinks: string[] = [];
      const linkPattern = /href\s*=\s*["']([^"']+)["']/gi;
      let linkMatch;
      
      while ((linkMatch = linkPattern.exec(html)) !== null) {
        const link = linkMatch[1];
        if (!link.includes('javascript') && 
            !link.includes('http://') && 
            !link.includes('https://') && 
            !link.includes('#') &&
            link.length > 5) {
          allLinks.push(link);
        }
      }
      
      for (const link of allLinks) {
        if (link.includes(text) || link.includes(encodeURIComponent(text))) {
          redirectUrl = link;
          break;
        }
      }
    }
    
    if (redirectUrl) {
      if (!redirectUrl.startsWith('http')) {
        if (redirectUrl.startsWith('/')) {
          redirectUrl = new URL(redirectUrl, apiUrl).href;
        } else {
          redirectUrl = new URL(redirectUrl, response.url).href;
        }
      }
      
      response = await fetch(redirectUrl, {
        method: 'GET',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Referer': searchUrl
        },
        credentials: 'include',
        redirect: 'follow'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      html = await response.text();
    }
  }
  
  return parseHtmlResponse(html, text);
}

chrome.runtime.onInstalled.addListener((_details) => {
  chrome.storage.local.set({
    panelWidth: 400,
    isPanelFixed: false,
    useBackendProxy: false,
    backendProxyUrl: ''
  });
});

chrome.action.onClicked.addListener((_tab) => {
});
