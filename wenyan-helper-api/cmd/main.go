package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
	"wenyan-helper-api/internal/cache"
	"wenyan-helper-api/internal/crawler"
	"wenyan-helper-api/internal/handler"
	"wenyan-helper-api/internal/parser"
	"wenyan-helper-api/internal/service"
	"wenyan-helper-api/pkg/config"

	"github.com/gin-gonic/gin"
)

const (
	defaultApiUrl = "https://wyw.hwxnet.com"
)

func main() {
	cfg := config.Load()

	apiUrl := os.Getenv("API_URL")
	if apiUrl == "" {
		apiUrl = defaultApiUrl
	}

	crawlerInstance := crawler.NewCrawler(&cfg.Crawler)

	parserInstance := parser.NewParser()

	var cacheInstance cache.Cache

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = cfg.Redis.Addr
	}

	redisCache := cache.NewRedisCache(
		&config.RedisConfig{Addr: redisAddr, Password: cfg.Redis.Password, DB: cfg.Redis.DB},
		&cfg.Cache,
	)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := redisCache.Ping(ctx); err != nil {
		log.Printf("Redis 连接失败，使用内存缓存: %v", err)
		cacheInstance = cache.NewMemoryCache(&cfg.Cache)
		log.Println("内存缓存已启用，LRU 策略: 最大 1000 项，TTL 24 小时")
	} else {
		log.Println("Redis 缓存已启用")
		cacheInstance = redisCache
	}

	queryService := service.NewQueryService(crawlerInstance, parserInstance, cacheInstance, apiUrl)

	queryHandler := handler.NewQueryHandler(queryService)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(corsMiddleware())

	r.GET("/health", queryHandler.Health)

	api := r.Group("/api")
	{
		api.GET("/query", queryHandler.Query)

		cacheGroup := api.Group("/cache")
		{
			cacheGroup.GET("/check", queryHandler.CheckCache)
			cacheGroup.POST("/clear", queryHandler.ClearCache)
		}
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = cfg.Server.Port
	}

	serverAddr := fmt.Sprintf(":%s", port)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("服务器启动于 http://localhost%s", serverAddr)
		log.Printf("API 端点: GET /api/query?word=xxx")
		log.Printf("字典网站: %s", apiUrl)
		if err := r.Run(serverAddr); err != nil {
			log.Fatalf("服务器启动失败: %v", err)
		}
	}()

	<-stop
	log.Println("正在关闭服务器...")

	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()

	_ = ctxShutdown
	log.Println("服务器已优雅关闭")
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
