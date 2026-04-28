import { QueryResult, ChromeMessage, ChromeMessageResponse } from '../types';
import { parseHtmlResponse } from '../utils/htmlParser';

chrome.runtime.onMessage.addListener((request: ChromeMessage, _sender, sendResponse: (response: ChromeMessageResponse) => void) => {
  if (request.action === 'queryDefinition') {
    handleQueryDefinition(request, sendResponse);
    return true;
  }
  
  return false;
});

async function handleQueryDefinition(request: ChromeMessage, sendResponse: (response: ChromeMessageResponse) => void): Promise<void> {
  try {
    const { text, apiUrl } = request;
    
    if (!text || !apiUrl) {
      throw new Error('缺少必要参数');
    }
    
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
    
    const result: QueryResult = parseHtmlResponse(html, text);
    
    sendResponse({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('查询失败:', error);
    const errorMessage = error instanceof Error ? error.message : '查询失败';
    sendResponse({
      success: false,
      error: errorMessage
    });
  }
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
