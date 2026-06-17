package prompt

import (
	_ "embed"
	"os"
	"path/filepath"

	"github.com/happyTonakai/paperagent/internal/config"
)

//go:embed prompts/system.txt
var SystemPrompt string

//go:embed prompts/heavy.txt
var HeavyPrompt string

//go:embed prompts/light.txt
var LightPrompt string

//go:embed prompts/summarize.txt
var SummarizePrompt string

//go:embed prompts/system_en.txt
var SystemPromptEN string

//go:embed prompts/heavy_en.txt
var HeavyPromptEN string

//go:embed prompts/light_en.txt
var LightPromptEN string

//go:embed prompts/summarize_en.txt
var SummarizePromptEN string

// Get returns the prompt, checking user override first.
func Get(name string, fallback string) string {
	userPath := filepath.Join(config.PromptsDir(), name+".txt")
	data, err := os.ReadFile(userPath)
	if err == nil {
		return string(data)
	}
	return fallback
}

// GetLang returns the prompt for the given language, checking user override first.
// For English, it checks for a "{name}_en.txt" user override before falling back
// to the built-in English template.
func GetLang(name string, lang string, zhFallback string, enFallback string) string {
	if lang == "en" {
		// Check user override for English variant
		userPath := filepath.Join(config.PromptsDir(), name+"_en.txt")
		data, err := os.ReadFile(userPath)
		if err == nil {
			return string(data)
		}
		return enFallback
	}
	// Default: Chinese — use existing user override logic
	return Get(name, zhFallback)
}

func GetSystem() string    { return Get("system", SystemPrompt) }
func GetHeavy() string     { return Get("heavy", HeavyPrompt) }
func GetLight() string     { return Get("light", LightPrompt) }
func GetSummarize() string { return Get("summarize", SummarizePrompt) }

func GetSystemLang(lang string) string    { return GetLang("system", lang, SystemPrompt, SystemPromptEN) }
func GetHeavyLang(lang string) string     { return GetLang("heavy", lang, HeavyPrompt, HeavyPromptEN) }
func GetLightLang(lang string) string     { return GetLang("light", lang, LightPrompt, LightPromptEN) }
func GetSummarizeLang(lang string) string { return GetLang("summarize", lang, SummarizePrompt, SummarizePromptEN) }

// GetContent returns the effective prompt content for a given name.
// Uses user override if it exists, otherwise returns the built-in default.
func GetContent(name string) string {
	switch name {
	case "system":
		return GetSystem()
	case "heavy":
		return GetHeavy()
	case "light":
		return GetLight()
	case "summarize":
		return GetSummarize()
	}
	return ""
}

// BuiltinNames returns the list of built-in prompt names.
func BuiltinNames() []string {
	return []string{"system", "heavy", "light", "summarize"}
}

// Save writes a user override prompt to disk.
func Save(name string, content string) error {
	dir := config.PromptsDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, name+".txt"), []byte(content), 0644)
}
