package crawler

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"wenyan-helper-api/pkg/config"
)

type Crawler struct {
	client *http.Client
	config *config.CrawlerConfig
}

func NewCrawler(cfg *config.CrawlerConfig) *Crawler {
	return &Crawler{
		client: &http.Client{
			Timeout: cfg.Timeout,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return nil
			},
		},
		config: cfg,
	}
}

func (c *Crawler) Fetch(word string, apiUrl string) (string, error) {
	encodedWord := url.QueryEscape(word)

	searchUrls := []string{
		fmt.Sprintf("%s/search.do?wd=%s&x=0&y=0", apiUrl, encodedWord),
		fmt.Sprintf("%s/search.jsp?q=%s", apiUrl, encodedWord),
	}

	var lastErr error
	for _, searchUrl := range searchUrls {
		var html string
		var err error

		for attempt := 0; attempt < c.config.MaxRetries+1; attempt++ {
			html, err = c.doFetch(searchUrl, apiUrl)
			if err == nil {
				if c.isValidResultPage(html) {
					return html, nil
				}
				fmt.Printf("[警告] 搜索URL %s 返回无效页面，尝试下一个...\n", searchUrl)
				lastErr = fmt.Errorf("无效的搜索结果页面")
				break
			}
			lastErr = err
			time.Sleep(time.Duration(attempt+1) * time.Second)
		}
	}

	return "", fmt.Errorf("抓取失败: %w", lastErr)
}

func (c *Crawler) isValidResultPage(html string) bool {
	if strings.Contains(html, "详细释义") {
		return true
	}
	if strings.Contains(html, "没有找到与您查询的") {
		return false
	}
	if strings.Contains(html, "的文言文解释") {
		return true
	}
	return false
}

func (c *Crawler) doFetch(searchUrl, apiUrl string) (string, error) {
	initialResp, _ := c.makeRequest(apiUrl, apiUrl)
	if initialResp != nil {
		initialResp.Body.Close()
	}

	resp, err := c.makeRequest(searchUrl, apiUrl)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	html, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	htmlStr := string(html)

	finalUrl := resp.Request.URL.String()
	fmt.Printf("[抓取] 最终URL: %s\n", finalUrl)

	if !strings.Contains(finalUrl, "/view/") {
		redirectUrl := c.extractRedirectUrl(htmlStr, apiUrl, searchUrl, finalUrl)
		if redirectUrl != "" {
			fmt.Printf("[重定向] 尝试跳转: %s\n", redirectUrl)
			resp2, err := c.makeRequest(redirectUrl, searchUrl)
			if err != nil {
				return htmlStr, nil
			}
			defer resp2.Body.Close()

			html2, err := io.ReadAll(resp2.Body)
			if err == nil {
				return string(html2), nil
			}
		}
	}

	return htmlStr, nil
}

func (c *Crawler) makeRequest(urlStr, referer string) (*http.Response, error) {
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return nil, fmt.Errorf("创建请求失败: %w", err)
	}

	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
	req.Header.Set("Accept-Language", c.config.AcceptLanguage)
	req.Header.Set("Referer", referer)
	req.Header.Set("User-Agent", c.config.UserAgent)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("请求失败: %w", err)
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP错误: %d", resp.StatusCode)
	}

	return resp, nil
}

func (c *Crawler) extractRedirectUrl(html, apiUrl, searchUrl, currentUrl string) string {
	patterns := []*regexp.Regexp{
		regexp.MustCompile(`window\.location\.href\s*=\s*["']([^"']+)["']`),
		regexp.MustCompile(`window\.location\s*=\s*["']([^"']+)["']`),
		regexp.MustCompile(`location\.href\s*=\s*["']([^"']+)["']`),
	}

	for _, pattern := range patterns {
		match := pattern.FindStringSubmatch(html)
		if len(match) > 1 && match[1] != "" {
			return c.resolveUrl(match[1], apiUrl, currentUrl)
		}
	}

	metaPattern := regexp.MustCompile(`<meta[^>]*http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["']\d+;\s*url\s*=\s*([^"']+)["']`)
	match := metaPattern.FindStringSubmatch(html)
	if len(match) > 1 && match[1] != "" {
		return c.resolveUrl(match[1], apiUrl, currentUrl)
	}

	viewLinkPattern := regexp.MustCompile(`href\s*=\s*["']([^"']*\/view\/[^"']+)["']`)
	viewMatches := viewLinkPattern.FindAllStringSubmatch(html, -1)
	if len(viewMatches) > 0 {
		encodedSearchWord := c.extractSearchWord(searchUrl)
		for _, match := range viewMatches {
			link := match[1]
			if strings.Contains(link, encodedSearchWord) || strings.Contains(link, c.extractRawWord(searchUrl)) {
				return c.resolveUrl(link, apiUrl, currentUrl)
			}
		}
		return c.resolveUrl(viewMatches[0][1], apiUrl, currentUrl)
	}

	allLinkPattern := regexp.MustCompile(`href\s*=\s*["']([^"']+)["']`)
	allMatches := allLinkPattern.FindAllStringSubmatch(html, -1)
	rawWord := c.extractRawWord(searchUrl)
	for _, match := range allMatches {
		link := match[1]
		if !strings.Contains(link, "javascript") &&
			!strings.HasPrefix(link, "http://") &&
			!strings.HasPrefix(link, "https://") &&
			!strings.HasPrefix(link, "#") &&
			len(link) > 5 {
			if strings.Contains(link, rawWord) || strings.Contains(link, url.QueryEscape(rawWord)) {
				return c.resolveUrl(link, apiUrl, currentUrl)
			}
		}
	}

	return ""
}

func (c *Crawler) resolveUrl(urlStr, apiUrl, currentUrl string) string {
	if strings.HasPrefix(urlStr, "http") {
		return urlStr
	}

	if strings.HasPrefix(urlStr, "/") {
		base, err := url.Parse(apiUrl)
		if err == nil {
			rel, err := url.Parse(urlStr)
			if err == nil {
				return base.ResolveReference(rel).String()
			}
		}
	}

	base, err := url.Parse(currentUrl)
	if err == nil {
		rel, err := url.Parse(urlStr)
		if err == nil {
			return base.ResolveReference(rel).String()
		}
	}

	return urlStr
}

func (c *Crawler) extractSearchWord(searchUrl string) string {
	u, err := url.Parse(searchUrl)
	if err != nil {
		return ""
	}
	word := u.Query().Get("wd")
	if word == "" {
		word = u.Query().Get("q")
	}
	return word
}

func (c *Crawler) extractRawWord(searchUrl string) string {
	encoded := c.extractSearchWord(searchUrl)
	if decoded, err := url.QueryUnescape(encoded); err == nil {
		return decoded
	}
	return encoded
}
