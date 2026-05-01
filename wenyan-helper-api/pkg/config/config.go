package config

import (
	"time"
)

type Config struct {
	Server ServerConfig
	Redis  RedisConfig
	Crawler CrawlerConfig
	Cache   CacheConfig
}

type ServerConfig struct {
	Port string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type CrawlerConfig struct {
	Timeout        time.Duration
	UserAgent      string
	AcceptLanguage string
	MaxRetries     int
}

type CacheConfig struct {
	TTL        time.Duration
	MaxItems   int
	LRUEnabled bool
}

func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port: "8080",
		},
		Redis: RedisConfig{
			Addr:     "localhost:6379",
			Password: "",
			DB:       0,
		},
		Crawler: CrawlerConfig{
			Timeout:        30 * time.Second,
			UserAgent:      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			AcceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
			MaxRetries:     2,
		},
		Cache: CacheConfig{
			TTL:        24 * time.Hour,
			MaxItems:   1000,
			LRUEnabled: true,
		},
	}
}
