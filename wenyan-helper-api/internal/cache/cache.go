package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
	"wenyan-helper-api/internal/models"
	"wenyan-helper-api/pkg/config"

	"github.com/go-redis/redis/v8"
)

type Cache interface {
	Get(ctx context.Context, word string) (*models.QueryResult, error)
	Set(ctx context.Context, word string, result *models.QueryResult) error
	Exists(ctx context.Context, word string) (bool, error)
	Clear(ctx context.Context) error
}

type RedisCache struct {
	client *redis.Client
	config *config.CacheConfig
}

func NewRedisCache(cfg *config.RedisConfig, cacheCfg *config.CacheConfig) *RedisCache {
	client := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	return &RedisCache{
		client: client,
		config: cacheCfg,
	}
}

func (c *RedisCache) Get(ctx context.Context, word string) (*models.QueryResult, error) {
	key := c.buildKey(word)

	data, err := c.client.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("从 Redis 获取缓存失败: %w", err)
	}

	var result models.QueryResult
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("反序列化缓存数据失败: %w", err)
	}

	return &result, nil
}

func (c *RedisCache) Set(ctx context.Context, word string, result *models.QueryResult) error {
	key := c.buildKey(word)

	data, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("序列化缓存数据失败: %w", err)
	}

	ttl := c.config.TTL
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}

	if err := c.client.Set(ctx, key, data, ttl).Err(); err != nil {
		return fmt.Errorf("写入 Redis 缓存失败: %w", err)
	}

	return nil
}

func (c *RedisCache) Exists(ctx context.Context, word string) (bool, error) {
	key := c.buildKey(word)

	exists, err := c.client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("检查缓存是否存在失败: %w", err)
	}

	return exists > 0, nil
}

func (c *RedisCache) Clear(ctx context.Context) error {
	pattern := "wenyan:query:*"
	keys, err := c.client.Keys(ctx, pattern).Result()
	if err != nil {
		return fmt.Errorf("获取缓存键列表失败: %w", err)
	}

	if len(keys) > 0 {
		if err := c.client.Del(ctx, keys...).Err(); err != nil {
			return fmt.Errorf("清除缓存失败: %w", err)
		}
	}

	return nil
}

func (c *RedisCache) buildKey(word string) string {
	return fmt.Sprintf("wenyan:query:%s", word)
}

func (c *RedisCache) Ping(ctx context.Context) error {
	return c.client.Ping(ctx).Err()
}

type MemoryCache struct {
	items     map[string]*cacheItem
	config    *config.CacheConfig
	accessList *accessLinkedList
	mutex     sync.RWMutex
}

type cacheItem struct {
	result    *models.QueryResult
	expiresAt time.Time
	key       string
}

type accessLinkedList struct {
	head *accessNode
	tail *accessNode
	size int
}

type accessNode struct {
	key  string
	prev *accessNode
	next *accessNode
}

func NewMemoryCache(cfg *config.CacheConfig) *MemoryCache {
	if cfg.MaxItems <= 0 {
		cfg.MaxItems = 1000
	}
	if cfg.TTL <= 0 {
		cfg.TTL = 24 * time.Hour
	}

	return &MemoryCache{
		items:      make(map[string]*cacheItem),
		config:     cfg,
		accessList: &accessLinkedList{},
	}
}

func (c *MemoryCache) Get(_ context.Context, word string) (*models.QueryResult, error) {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	item, exists := c.items[word]
	if !exists {
		return nil, nil
	}

	if time.Now().After(item.expiresAt) {
		delete(c.items, word)
		c.removeFromAccessList(word)
		return nil, nil
	}

	c.moveToFront(word)

	return item.result, nil
}

func (c *MemoryCache) Set(_ context.Context, word string, result *models.QueryResult) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	if _, exists := c.items[word]; exists {
		c.items[word].result = result
		c.items[word].expiresAt = time.Now().Add(c.config.TTL)
		c.moveToFront(word)
		return nil
	}

	if len(c.items) >= c.config.MaxItems && c.config.LRUEnabled {
		c.evictLRU()
	}

	c.items[word] = &cacheItem{
		result:    result,
		expiresAt: time.Now().Add(c.config.TTL),
		key:       word,
	}

	c.addToFront(word)

	return nil
}

func (c *MemoryCache) Exists(_ context.Context, word string) (bool, error) {
	c.mutex.RLock()
	defer c.mutex.RUnlock()

	item, exists := c.items[word]
	if !exists {
		return false, nil
	}

	if time.Now().After(item.expiresAt) {
		return false, nil
	}

	return true, nil
}

func (c *MemoryCache) Clear(_ context.Context) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	c.items = make(map[string]*cacheItem)
	c.accessList = &accessLinkedList{}

	return nil
}

func (c *MemoryCache) evictLRU() {
	if c.accessList.tail == nil {
		return
	}

	oldestKey := c.accessList.tail.key
	delete(c.items, oldestKey)
	c.removeFromAccessList(oldestKey)
}

func (c *MemoryCache) moveToFront(word string) {
	if c.accessList.head != nil && c.accessList.head.key == word {
		return
	}

	c.removeFromAccessList(word)
	c.addToFront(word)
}

func (c *MemoryCache) addToFront(word string) {
	node := &accessNode{key: word}

	if c.accessList.head == nil {
		c.accessList.head = node
		c.accessList.tail = node
	} else {
		node.next = c.accessList.head
		c.accessList.head.prev = node
		c.accessList.head = node
	}

	c.accessList.size++
}

func (c *MemoryCache) removeFromAccessList(word string) {
	if c.accessList.size == 0 {
		return
	}

	var node *accessNode
	for n := c.accessList.head; n != nil; n = n.next {
		if n.key == word {
			node = n
			break
		}
	}

	if node == nil {
		return
	}

	if node.prev != nil {
		node.prev.next = node.next
	} else {
		c.accessList.head = node.next
	}

	if node.next != nil {
		node.next.prev = node.prev
	} else {
		c.accessList.tail = node.prev
	}

	c.accessList.size--
}
