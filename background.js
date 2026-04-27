// background.js - 后台服务工作器
// 主要负责处理跨域请求，因为content script受同源策略限制

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理释义查询请求
  if (request.action === 'queryDefinition') {
    handleQueryDefinition(request, sendResponse);
    // 返回true表示将异步发送响应
    return true;
  }
  
  // 其他请求处理
  return false;
});

// 处理释义查询
async function handleQueryDefinition(request, sendResponse) {
  try {
    const { text, apiUrl } = request;
    
    // 第一步：先访问首页，获取可能需要的cookie和会话
    let homeResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': apiUrl
      },
      credentials: 'include',
      redirect: 'follow'
    });
    
    // 第二步：使用GET请求提交搜索
    // 注意：实际应该使用 search.do 而不是 search.jsp
    // URL格式: /search.do?wd=xxx&x=0&y=0
    const encodedText = encodeURIComponent(text);
    const searchUrl = `${apiUrl}/search.do?wd=${encodedText}&x=0&y=0`;
    
    // 尝试GET请求
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
    
    // 检查响应URL是否已经是详情页面
    let isDetailPage = response.url.includes('/view/');
    
    // 如果不是详情页面，检查是否有JavaScript重定向或搜索结果链接
    if (!isDetailPage) {
      // 检查多种重定向方式
      let redirectUrl = null;
      
      // 方式1: window.location.href
      const locationHrefMatch = html.match(/window\.location\.href\s*=\s*["']([^"']+)["']/i);
      if (locationHrefMatch && locationHrefMatch[1]) {
        redirectUrl = locationHrefMatch[1];
      }
      
      // 方式2: window.location
      if (!redirectUrl) {
        const locationMatch = html.match(/window\.location\s*=\s*["']([^"']+)["']/i);
        if (locationMatch && locationMatch[1]) {
          redirectUrl = locationMatch[1];
        }
      }
      
      // 方式3: location.href
      if (!redirectUrl) {
        const hrefMatch = html.match(/location\.href\s*=\s*["']([^"']+)["']/i);
        if (hrefMatch && hrefMatch[1]) {
          redirectUrl = hrefMatch[1];
        }
      }
      
      // 方式4: meta refresh
      if (!redirectUrl) {
        const metaRefreshMatch = html.match(/<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']\d+;\s*url\s*=\s*([^"']+)["']/i);
        if (metaRefreshMatch && metaRefreshMatch[1]) {
          redirectUrl = metaRefreshMatch[1];
        }
      }
      
      // 方式5: 直接在HTML中查找详情页面链接
      if (!redirectUrl) {
        // 查找所有包含 /view/ 的链接
        const viewLinkMatches = [];
        const viewLinkPattern = /href\s*=\s*["']([^"']*\/view\/[^"']+)["']/gi;
        let match;
        
        while ((match = viewLinkPattern.exec(html)) !== null) {
          viewLinkMatches.push(match[1]);
        }
        
        if (viewLinkMatches.length > 0) {
          // 优先选择包含原文字的链接，或者第一个链接
          for (const link of viewLinkMatches) {
            // 检查链接是否包含查询的文字（URL编码后的）
            const encodedText = encodeURIComponent(text);
            if (link.includes(encodedText) || link.includes(text)) {
              redirectUrl = link;
              break;
            }
          }
          
          // 如果没有找到匹配的，使用第一个链接
          if (!redirectUrl) {
            redirectUrl = viewLinkMatches[0];
          }
        }
      }
      
      // 方式6: 查找包含查询文字的链接
      if (!redirectUrl) {
        // 查找所有链接
        const allLinks = [];
        const linkPattern = /href\s*=\s*["']([^"']+)["']/gi;
        let linkMatch;
        
        while ((linkMatch = linkPattern.exec(html)) !== null) {
          const link = linkMatch[1];
          // 排除导航链接和外部链接
          if (!link.includes('javascript') && 
              !link.includes('http://') && 
              !link.includes('https://') && 
              !link.includes('#') &&
              link.length > 5) {
            allLinks.push(link);
          }
        }
        
        // 查找包含查询文字的链接
        for (const link of allLinks) {
          if (link.includes(text) || link.includes(encodeURIComponent(text))) {
            redirectUrl = link;
            break;
          }
        }
      }
      
      // 如果找到重定向URL，发起新的请求
      if (redirectUrl) {
        // 处理相对URL
        if (!redirectUrl.startsWith('http')) {
          if (redirectUrl.startsWith('/')) {
            redirectUrl = new URL(redirectUrl, apiUrl).href;
          } else {
            redirectUrl = new URL(redirectUrl, response.url).href;
          }
        }
        
        // 发起重定向后的请求
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
    
    // 解析HTML并提取有用信息
    const result = parseHtmlResponse(html, text);
    
    sendResponse({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('查询失败:', error);
    sendResponse({
      success: false,
      error: error.message || '查询失败'
    });
  }
}

// 构建搜索URL
function buildSearchUrl(baseUrl, text) {
  // 根据目标网站的实际URL结构调整
  // 实际使用的参数是"wd"而不是"q"
  const encodedText = encodeURIComponent(text);
  return `${baseUrl}/search.jsp?wd=${encodedText}`;
}

// 解析HTML响应
function parseHtmlResponse(html, originalText) {
  // 这里使用简单的字符串匹配和正则表达式
  // 因为在service worker中不能直接使用DOM API
  
  let definitions = [];
  let phonetic = '';
  let examples = [];
  
  // 首先尝试从页面标题中提取信息
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  
  // 尝试提取拼音（常见格式：拼音：yán）
  // 根据实际页面结构，格式为：拼音：yán
  const pinyinMatch = html.match(/拼音[：:]\s*([a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+[a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ\s]*)/i);
  if (pinyinMatch && pinyinMatch[1]) {
    phonetic = pinyinMatch[1].trim();
  }
  
  // 查找"详细释义"部分
  // 根据实际页面结构，格式为：
  // 详细释义
  // yán①<动>说；谈论。《桃花源记》："..."
  // ②<名>言语；言论。《鸿门宴》："..."
  
  // 首先查找"详细释义"标记
  const detailSectionMatch = html.match(/详细释义[\s\S]*$/i);
  if (detailSectionMatch) {
    const detailSection = detailSectionMatch[0];
    
    // 提取释义项
    // 格式：①<动>说；谈论。《桃花源记》："..."
    // 或者：yán①<动>说；谈论。《桃花源记》："..."
    
    // 匹配带圆圈序号的释义项
    // 格式：①<动>... 或 ②<名>...
    const itemPattern = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳][\s\S]*?(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|$)/g;
    let itemMatch;
    
    while ((itemMatch = itemPattern.exec(detailSection)) !== null) {
      let item = itemMatch[0];
      
      // 移除HTML标签
      item = item.replace(/<[^>]+>/g, '');
      // 移除多余的空白字符
      item = item.replace(/\s+/g, ' ').trim();
      
      // 检查是否有效
      if (item.length > 5) {
        // 排除一些无效的内容
        const invalidKeywords = ['http', 'www.', 'xmlns', 'xhtml', 'DOCTYPE', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class=', 'id='];
        let isValid = true;
        
        for (const keyword of invalidKeywords) {
          if (item.toLowerCase().includes(keyword.toLowerCase())) {
            isValid = false;
            break;
          }
        }
        
        // 检查是否包含中文字符（至少包含一个中文字符）
        const hasChinese = /[\u4e00-\u9fa5]/.test(item);
        
        if (isValid && hasChinese && item.length < 1000) {
          if (!definitions.includes(item)) {
            definitions.push(item);
          }
        }
      }
    }
    
    // 如果没有找到带圆圈序号的释义项，尝试查找其他格式
    if (definitions.length === 0) {
      // 查找包含词性标记的内容
      // 格式：<动>... 或 <名>...
      const posPattern = /<(?:动|名|形|副|介|连|助|代|量|数|叹|拟)>[^<]+/g;
      let posMatch;
      
      while ((posMatch = posPattern.exec(detailSection)) !== null) {
        let item = posMatch[0];
        
        // 移除HTML标签
        item = item.replace(/<[^>]+>/g, '');
        // 移除多余的空白字符
        item = item.replace(/\s+/g, ' ').trim();
        
        if (item.length > 5 && !definitions.includes(item)) {
          definitions.push(item);
        }
      }
    }
  }
  
  // 如果没有找到"详细释义"部分，尝试其他模式
  if (definitions.length === 0) {
    // 尝试提取释义（多种模式）
    const definitionPatterns = [
      // 【释义】内容
      /【释义】([^【]+?)(?=【|$)/g,
      // 释义：内容
      /释义[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      // [释义]内容
      /\[释义\]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      // 解释：内容
      /解释[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      // 意思：内容
      /意思[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      // 含义：内容
      /含义[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g
    ];
    
    for (const pattern of definitionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let def = match[1];
        if (def) {
          def = def.trim();
          // 移除HTML标签
          def = def.replace(/<[^>]+>/g, '');
          // 移除多余的空白字符
          def = def.replace(/\s+/g, ' ').trim();
          
          // 检查是否有效
          if (def.length > 2 && !definitions.includes(def)) {
            // 排除一些无效的内容
            const invalidKeywords = ['http', 'www.', 'xmlns', 'xhtml', 'DOCTYPE', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class=', 'id='];
            let isValid = true;
            
            for (const keyword of invalidKeywords) {
              if (def.toLowerCase().includes(keyword.toLowerCase())) {
                isValid = false;
                break;
              }
            }
            
            // 检查是否包含中文字符（至少包含一个中文字符）
            const hasChinese = /[\u4e00-\u9fa5]/.test(def);
            
            if (isValid && hasChinese && def.length < 500) {
              definitions.push(def);
            }
          }
        }
      }
    }
  }
  
  // 尝试提取例句
  // 例句通常在《》中，如《桃花源记》："..."
  const exampleMatches = html.match(/《[^》]+》[：:]\s*"[^"]+"/g);
  if (exampleMatches && exampleMatches.length > 0) {
    for (const example of exampleMatches) {
      let cleanExample = example.replace(/<[^>]+>/g, '');
      cleanExample = cleanExample.replace(/\s+/g, ' ').trim();
      if (cleanExample.length > 5 && !examples.includes(cleanExample)) {
        examples.push(cleanExample);
      }
    }
  }
  
  // 如果没有找到明确的释义，尝试更通用的方法
  if (definitions.length === 0) {
    // 移除script、style、nav、footer等标签内容
    let cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');
    
    // 提取所有文本内容
    let textContent = cleanHtml.replace(/<[^>]+>/g, ' ');
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    // 查找包含常见释义关键词的句子
    const keywords = ['解释', '意思', '含义', '说明', '指的是', '表示', '意为', '释义', '解作'];
    const sentences = textContent.split(/[。！？\n]+/);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      // 排除太短或太长的句子
      if (trimmed.length > 10 && trimmed.length < 300) {
        // 排除包含链接的句子
        if (!trimmed.includes('http') && !trimmed.includes('www.')) {
          for (const keyword of keywords) {
            if (trimmed.includes(keyword) && !definitions.includes(trimmed)) {
              definitions.push(trimmed);
              break;
            }
          }
        }
      }
    }
    
    // 如果还是没有找到，尝试查找包含原文字的句子
    if (definitions.length === 0 && originalText) {
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > 15 && trimmed.length < 300) {
          if (trimmed.includes(originalText) && !trimmed.includes('http') && !trimmed.includes('www.')) {
            if (!definitions.includes(trimmed)) {
              definitions.push(trimmed);
            }
          }
        }
      }
    }
  }
  
  return {
    word: originalText,
    phonetic: phonetic,
    definitions: definitions,
    examples: examples,
    hasResult: definitions.length > 0
  };
}

// 插件安装时的初始化
chrome.runtime.onInstalled.addListener((details) => {
  // 设置默认配置
  chrome.storage.local.set({
    panelWidth: 400,
    isPanelFixed: false,
    useBackendProxy: false,
    backendProxyUrl: ''
  });
});

// 处理插件图标点击事件
chrome.action.onClicked.addListener((tab) => {
  // 可以在这里实现一些功能，比如打开设置页面
});
