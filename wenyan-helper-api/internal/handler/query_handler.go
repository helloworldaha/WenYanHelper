package handler

import (
	"net/http"
	"wenyan-helper-api/internal/models"
	"wenyan-helper-api/internal/service"

	"github.com/gin-gonic/gin"
)

type QueryHandler struct {
	queryService *service.QueryService
}

func NewQueryHandler(queryService *service.QueryService) *QueryHandler {
	return &QueryHandler{
		queryService: queryService,
	}
}

func (h *QueryHandler) Query(c *gin.Context) {
	word := c.Query("word")
	if word == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "缺少必要参数: word",
		})
		return
	}

	result, err := h.queryService.Query(c.Request.Context(), word)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    result,
	})
}

func (h *QueryHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    map[string]string{"status": "ok"},
	})
}

func (h *QueryHandler) ClearCache(c *gin.Context) {
	err := h.queryService.ClearCache(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    map[string]string{"message": "缓存已清除"},
	})
}

func (h *QueryHandler) CheckCache(c *gin.Context) {
	word := c.Query("word")
	if word == "" {
		c.JSON(http.StatusBadRequest, models.APIResponse{
			Success: false,
			Error:   "缺少必要参数: word",
		})
		return
	}

	exists, err := h.queryService.CheckCache(c.Request.Context(), word)
	if err != nil {
		c.JSON(http.StatusInternalServerError, models.APIResponse{
			Success: false,
			Error:   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, models.APIResponse{
		Success: true,
		Data:    map[string]bool{"exists": exists},
	})
}
