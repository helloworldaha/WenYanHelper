import { QueryResult } from '../types';

export function parseHtmlResult(html: string, originalText: string): QueryResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  let definitions: string[] = [];
  let phonetic = '';
  let examples: string[] = [];
  
  const phoneticElements = doc.querySelectorAll('.pinyin, .pronunciation, [class*="yin"], [class*="pin"]');
  if (phoneticElements.length > 0) {
    phonetic = phoneticElements[0].textContent?.trim() || '';
  }
  
  const definitionElements = doc.querySelectorAll('.definition, .meaning, .explain, [class*="yi"], [class*="shi"]');
  definitionElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (text.length > 0 && !definitions.includes(text)) {
      definitions.push(text);
    }
  });
  
  const exampleElements = doc.querySelectorAll('.example, .sentence, [class*="li"], [class*="ju"]');
  exampleElements.forEach(el => {
    const text = el.textContent?.trim() || '';
    if (text.length > 0 && !examples.includes(text)) {
      examples.push(text);
    }
  });
  
  if (definitions.length === 0) {
    const contentElements = doc.querySelectorAll('p, li, .content, .main');
    contentElements.forEach(el => {
      const text = el.textContent?.trim() || '';
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

export function parseHtmlResponse(html: string, originalText: string): QueryResult {
  let definitions: string[] = [];
  let phonetic = '';
  let examples: string[] = [];
  
  const pinyinMatch = html.match(/拼音[：:]\s*([a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+[a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ\s]*)/i);
  if (pinyinMatch && pinyinMatch[1]) {
    phonetic = pinyinMatch[1].trim();
  }
  
  const detailSectionMatch = html.match(/详细释义[\s\S]*$/i);
  if (detailSectionMatch) {
    const detailSection = detailSectionMatch[0];
    const itemPattern = /[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳][\s\S]*?(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|$)/g;
    let itemMatch;
    
    while ((itemMatch = itemPattern.exec(detailSection)) !== null) {
      let item = itemMatch[0];
      item = item.replace(/<[^>]+>/g, '');
      item = item.replace(/\s+/g, ' ').trim();
      
      if (item.length > 5) {
        const invalidKeywords = ['http', 'www.', 'xmlns', 'xhtml', 'DOCTYPE', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class=', 'id='];
        let isValid = true;
        
        for (const keyword of invalidKeywords) {
          if (item.toLowerCase().includes(keyword.toLowerCase())) {
            isValid = false;
            break;
          }
        }
        
        const hasChinese = /[\u4e00-\u9fa5]/.test(item);
        
        if (isValid && hasChinese && item.length < 1000) {
          if (!definitions.includes(item)) {
            definitions.push(item);
          }
        }
      }
    }
    
    if (definitions.length === 0) {
      const posPattern = /<(?:动|名|形|副|介|连|助|代|量|数|叹|拟)>[^<]+/g;
      let posMatch;
      
      while ((posMatch = posPattern.exec(detailSection)) !== null) {
        let item = posMatch[0];
        item = item.replace(/<[^>]+>/g, '');
        item = item.replace(/\s+/g, ' ').trim();
        
        if (item.length > 5 && !definitions.includes(item)) {
          definitions.push(item);
        }
      }
    }
  }
  
  if (definitions.length === 0) {
    const definitionPatterns = [
      /【释义】([^【]+?)(?=【|$)/g,
      /释义[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      /\[释义\]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      /解释[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      /意思[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g,
      /含义[：:]\s*([^。\n<]{5,}?)(?=。|【|\n|$)/g
    ];
    
    for (const pattern of definitionPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let def = match[1];
        if (def) {
          def = def.trim();
          def = def.replace(/<[^>]+>/g, '');
          def = def.replace(/\s+/g, ' ').trim();
          
          if (def.length > 2 && !definitions.includes(def)) {
            const invalidKeywords = ['http', 'www.', 'xmlns', 'xhtml', 'DOCTYPE', 'html', 'head', 'body', 'script', 'style', 'div', 'span', 'class=', 'id='];
            let isValid = true;
            
            for (const keyword of invalidKeywords) {
              if (def.toLowerCase().includes(keyword.toLowerCase())) {
                isValid = false;
                break;
              }
            }
            
            const hasChinese = /[\u4e00-\u9fa5]/.test(def);
            
            if (isValid && hasChinese && def.length < 500) {
              definitions.push(def);
            }
          }
        }
      }
    }
  }
  
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
  
  if (definitions.length === 0) {
    let cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');
    
    let textContent = cleanHtml.replace(/<[^>]+>/g, ' ');
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    const keywords = ['解释', '意思', '含义', '说明', '指的是', '表示', '意为', '释义', '解作'];
    const sentences = textContent.split(/[。！？\n]+/);
    
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (trimmed.length > 10 && trimmed.length < 300) {
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
