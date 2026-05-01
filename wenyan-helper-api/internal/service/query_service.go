package service

import (
	"context"
	"fmt"
	"wenyan-helper-api/internal/cache"
	"wenyan-helper-api/internal/crawler"
	"wenyan-helper-api/internal/models"
	"wenyan-helper-api/internal/parser"
)

type QueryService struct {
	crawler *crawler.Crawler
	parser  *parser.Parser
	cache   cache.Cache
	apiUrl  string
}

func NewQueryService(crawler *crawler.Crawler, parser *parser.Parser, cache cache.Cache, apiUrl string) *QueryService {
	return &QueryService{
		crawler: crawler,
		parser:  parser,
		cache:   cache,
		apiUrl:  apiUrl,
	}
}

func (s *QueryService) Query(ctx context.Context, word string) (*models.QueryResult, error) {
	if word == "" {
		return nil, fmt.Errorf("查询词不能为空")
	}

	cached, err := s.cache.Get(ctx, word)
	if err != nil {
		fmt.Printf("缓存读取警告: %v\n", err)
	} else if cached != nil {
		fmt.Printf("[缓存命中] 查询词: %s\n", word)
		return cached, nil
	}

	fmt.Printf("[开始抓取] 查询词: %s\n", word)
	html, err := s.crawler.Fetch(word, s.apiUrl)
	if err != nil {
		return nil, fmt.Errorf("抓取页面失败: %w", err)
	}

	fmt.Printf("[抓取完成] HTML 长度: %d 字符\n", len(html))
	if len(html) > 0 {
		previewLen := 500
		if len(html) < previewLen {
			previewLen = len(html)
		}
		fmt.Printf("[HTML 预览] %s...\n", html[:previewLen])
	}

	result := s.parser.Parse(html, word)

	fmt.Printf("[解析完成] 释义数量: %d, 拼音: '%s', hasResult: %v\n", 
		len(result.Definitions), result.Phonetic, result.HasResult)

	if result.HasResult {
		if err := s.cache.Set(ctx, word, result); err != nil {
			fmt.Printf("缓存写入警告: %v\n", err)
		} else {
			fmt.Printf("[缓存写入] 查询词: %s\n", word)
		}
	}

	return result, nil
}

func (s *QueryService) ClearCache(ctx context.Context) error {
	return s.cache.Clear(ctx)
}

func (s *QueryService) CheckCache(ctx context.Context, word string) (bool, error) {
	return s.cache.Exists(ctx, word)
}
