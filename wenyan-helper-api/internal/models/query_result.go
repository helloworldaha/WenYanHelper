package models

type QueryResult struct {
	Word        string   `json:"word"`
	Phonetic    string   `json:"phonetic"`
	Definitions []string `json:"definitions"`
	Examples    []string `json:"examples"`
	HasResult   bool     `json:"hasResult"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
