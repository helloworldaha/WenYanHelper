package parser

import (
	"fmt"
	"regexp"
	"strings"
	"wenyan-helper-api/internal/models"
)

type Parser struct{}

func NewParser() *Parser {
	return &Parser{}
}

func (p *Parser) Parse(html string, originalText string) *models.QueryResult {
	result := &models.QueryResult{
		Word:        originalText,
		Phonetic:    "",
		Definitions: []string{},
		Examples:    []string{},
		HasResult:   false,
	}

	result.Phonetic = p.extractPhonetic(html)
	result.Definitions = p.extractDefinitions(html, originalText)
	result.Examples = p.extractExamples(html)
	result.HasResult = len(result.Definitions) > 0

	fmt.Printf("[解析] 拼音: '%s', 释义数量: %d\n", result.Phonetic, len(result.Definitions))

	return result
}

func (p *Parser) extractPhonetic(html string) string {
	pinyinPattern := regexp.MustCompile(`<span class="pinyin">([^<]+)</span>`)
	match := pinyinPattern.FindStringSubmatch(html)
	if len(match) > 1 && strings.TrimSpace(match[1]) != "" {
		return strings.TrimSpace(strings.ReplaceAll(match[1], `<img src="/images/sound.gif" class="sound" align="absmiddle" width="17" height="15" onclick="playSound('zhi1');" />`, ""))
	}

	altPattern := regexp.MustCompile(`拼音[：:]\s*([a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ]+[a-zA-ZĀÁǍÀĒÉĚÈĪÍǏÌŌÓǑÒŪÚǓÙǕǗǙǛ\s]*)`)
	match = altPattern.FindStringSubmatch(html)
	if len(match) > 1 && strings.TrimSpace(match[1]) != "" {
		return strings.TrimSpace(match[1])
	}

	return ""
}

func (p *Parser) extractDefinitions(html string, originalText string) []string {
	definitions := []string{}
	definitionSet := make(map[string]bool)

	viewConPattern := regexp.MustCompile(`(?s)<div class="view_con clearfix">(.*?)</div>`)
	viewConMatch := viewConPattern.FindStringSubmatch(html)
	if len(viewConMatch) > 1 {
		viewCon := viewConMatch[1]
		fmt.Printf("[解析] 找到 view_con 区块，长度: %d\n", len(viewCon))

		items := p.splitDefinitionItems(viewCon)
		for _, item := range items {
			cleaned := p.cleanDefinitionText(item)
			if p.isValidDefinition(cleaned, definitionSet) {
				definitions = append(definitions, cleaned)
				definitionSet[cleaned] = true
			}
		}
	}

	if len(definitions) == 0 {
		detailPattern := regexp.MustCompile(`(?i)详细释义[\s\S]*$`)
		detailMatch := detailPattern.FindString(html)
		if detailMatch != "" {
			itemPattern := regexp.MustCompile(`[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳][\s\S]*`)
			matches := itemPattern.FindAllString(detailMatch, -1)

			for _, match := range matches {
				items := p.splitByMarkers(match)
				for _, item := range items {
					cleaned := p.cleanText(item)
					if p.isValidDefinition(cleaned, definitionSet) {
						definitions = append(definitions, cleaned)
						definitionSet[cleaned] = true
					}
				}
			}

			if len(definitions) == 0 {
				posPattern := regexp.MustCompile(`<[动名形副介连助代量数叹拟]>[^<]+`)
				posMatches := posPattern.FindAllString(detailMatch, -1)
				for _, match := range posMatches {
					cleaned := p.cleanText(match)
					if len(cleaned) > 5 && !definitionSet[cleaned] {
						definitions = append(definitions, cleaned)
						definitionSet[cleaned] = true
					}
				}
			}
		}
	}

	if len(definitions) == 0 {
		definitions = p.extractFromTextContent(html, originalText, definitionSet)
	}

	return definitions
}

func (p *Parser) splitDefinitionItems(text string) []string {
	var items []string
	markers := "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
	
	text = strings.ReplaceAll(text, "<br />", "\n")
	text = strings.ReplaceAll(text, "<br/>", "\n")
	text = strings.ReplaceAll(text, "<br>", "\n")

	var current strings.Builder
	var inDefinition bool

	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		for _, marker := range markers {
			if strings.HasPrefix(line, string(marker)) {
				if current.Len() > 0 {
					items = append(items, current.String())
					current.Reset()
				}
				inDefinition = true
				break
			}
		}

		if inDefinition {
			if current.Len() > 0 {
				current.WriteString(" ")
			}
			current.WriteString(line)
		}
	}

	if current.Len() > 0 {
		items = append(items, current.String())
	}

	return items
}

func (p *Parser) cleanDefinitionText(text string) string {
	text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func (p *Parser) splitByMarkers(text string) []string {
	markers := "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
	var items []string
	var current strings.Builder

	for _, r := range text {
		if strings.ContainsRune(markers, r) {
			if current.Len() > 0 {
				items = append(items, current.String())
				current.Reset()
			}
			current.WriteRune(r)
		} else {
			current.WriteRune(r)
		}
	}

	if current.Len() > 0 {
		items = append(items, current.String())
	}

	return items
}

func (p *Parser) extractExamples(html string) []string {
	examples := []string{}
	exampleSet := make(map[string]bool)

	examplePattern := regexp.MustCompile(`《[^》]+》[：:]\s*"[^"]+"`)
	matches := examplePattern.FindAllString(html, -1)

	for _, match := range matches {
		example := p.cleanText(match)
		if len(example) > 5 && !exampleSet[example] {
			examples = append(examples, example)
			exampleSet[example] = true
		}
	}

	return examples
}

func (p *Parser) extractFromTextContent(html string, originalText string, definitionSet map[string]bool) []string {
	definitions := []string{}

	cleanHtml := p.removeScriptsAndStyles(html)
	textContent := p.cleanText(cleanHtml)

	keywords := []string{"解释", "意思", "含义", "说明", "指的是", "表示", "意为", "释义", "解作"}
	sentences := strings.FieldsFunc(textContent, func(r rune) bool {
		return r == '。' || r == '！' || r == '？' || r == '\n'
	})

	for _, sentence := range sentences {
		trimmed := strings.TrimSpace(sentence)
		if len(trimmed) > 10 && len(trimmed) < 300 {
			if !strings.Contains(trimmed, "http") && !strings.Contains(trimmed, "www.") {
				for _, keyword := range keywords {
					if strings.Contains(trimmed, keyword) && !definitionSet[trimmed] {
						definitions = append(definitions, trimmed)
						definitionSet[trimmed] = true
						break
					}
				}
			}
		}
	}

	if len(definitions) == 0 && originalText != "" {
		for _, sentence := range sentences {
			trimmed := strings.TrimSpace(sentence)
			if len(trimmed) > 15 && len(trimmed) < 300 {
				if strings.Contains(trimmed, originalText) &&
					!strings.Contains(trimmed, "http") &&
					!strings.Contains(trimmed, "www.") &&
					!definitionSet[trimmed] {
					definitions = append(definitions, trimmed)
					definitionSet[trimmed] = true
				}
			}
		}
	}

	return definitions
}

func (p *Parser) cleanText(text string) string {
	text = regexp.MustCompile(`<[^>]+>`).ReplaceAllString(text, " ")
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return strings.TrimSpace(text)
}

func (p *Parser) removeScriptsAndStyles(html string) string {
	result := html

	tags := []string{"script", "style", "nav", "footer", "header", "aside"}
	for _, tag := range tags {
		result = p.removeTag(result, tag)
	}

	return result
}

func (p *Parser) removeTag(html string, tag string) string {
	result := html
	openTag := "<" + tag
	closeTag := "</" + tag + ">"

	for {
		openIdx := strings.Index(strings.ToLower(result), strings.ToLower(openTag))
		if openIdx == -1 {
			break
		}

		closeIdx := strings.Index(strings.ToLower(result[openIdx:]), strings.ToLower(closeTag))
		if closeIdx == -1 {
			break
		}
		closeIdx += openIdx + len(closeTag)

		result = result[:openIdx] + result[closeIdx:]
	}

	return result
}

func (p *Parser) isValidDefinition(item string, existingSet map[string]bool) bool {
	if len(item) <= 5 {
		return false
	}

	invalidKeywords := []string{"http", "www.", "xmlns", "xhtml", "DOCTYPE", "html", "head", "body", "script", "style", "div", "span", "class=", "id="}
	for _, keyword := range invalidKeywords {
		if strings.Contains(strings.ToLower(item), strings.ToLower(keyword)) {
			return false
		}
	}

	hasChinese := regexp.MustCompile(`[\p{Han}]`).MatchString(item)
	if !hasChinese {
		return false
	}

	if len(item) >= 1000 {
		return false
	}

	return !existingSet[item]
}
