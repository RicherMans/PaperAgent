package server

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/paperpaper/paperpaper/internal/api"
	"github.com/paperpaper/paperpaper/internal/export"
	"github.com/paperpaper/paperpaper/internal/prompt"
	"github.com/paperpaper/paperpaper/internal/session"
	"github.com/paperpaper/paperpaper/internal/urlparse"
)

// --- Request types ---

type newPaperRequest struct {
	URL     string `json:"url"`
	Content string `json:"content"`
}

type chatRequest struct {
	Question string `json:"question"`
}

// --- Response types ---

type paperResponse struct {
	ID             string            `json:"id"`
	Title          string            `json:"title"`
	SourceURL      string            `json:"source_url"`
	InitialSummary string            `json:"initial_summary"`
	ModelUsed      string            `json:"model_used"`
	CreatedAt      string            `json:"created_at"`
	UpdatedAt      string            `json:"updated_at"`
	Messages       []messageResponse `json:"messages"`
}

type messageResponse struct {
	RoundNumber int    `json:"round_number"`
	Role        string `json:"role"`
	Content     string `json:"content"`
	Digest      string `json:"digest,omitempty"`
	TokenCount  int    `json:"token_count"`
}

type paperSummaryResponse struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	UpdatedAt string `json:"updated_at"`
}

// --- Handlers ---

func (s *Server) handleNewPaper(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 10<<20) // 10 MB

	var req newPaperRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}

	log.Printf("[new-paper] fetching content for URL: %s", req.URL)

	content, sourceURL, err := s.fetchPaperContent(req)
	if err != nil {
		log.Printf("[new-paper] fetch error: %v", err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	log.Printf("[new-paper] fetched %d chars, creating paper", len(content))

	paper := session.NewPaper(content, sourceURL)
	paper.ModelUsed = s.cfg.API.DefaultModel

	if err := paper.Save(); err != nil {
		log.Printf("[new-paper] save error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}

	log.Printf("[new-paper] paper created: %s", paper.Ref())

	// Start SSE stream
	sw, err := newSSEWriter(w)
	if err != nil {
		log.Printf("[new-paper] SSE not supported: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming not supported"})
		return
	}

	if err := sw.WriteCreated(paper.Ref()); err != nil {
		log.Printf("[new-paper] failed to send created event: %v", err)
		return
	}

	log.Printf("[new-paper] starting summary stream for %s", paper.Ref())

	// Add initial user message
	paper.AddMessage(session.Message{
		RoundNumber: 0,
		Role:        "user",
		Content:     content,
		TokenCount:  session.EstimateTokens(content),
	})

	messages := []api.ChatMessage{
		{Role: "system", Content: prompt.GetHeavy()},
		{Role: "user", Content: content},
	}

	ch := s.api.ChatStream(s.cfg.API.DefaultModel, messages)
	var summaryBuilder strings.Builder

	for chunk := range ch {
		select {
		case <-r.Context().Done():
			log.Printf("[new-paper] client disconnected")
			return
		default:
		}

		if chunk.Err != nil {
			log.Printf("[new-paper] stream error: %v", chunk.Err)
			sw.WriteError(chunk.Err.Error())
			return
		}
		if chunk.Done {
			break
		}
		summaryBuilder.WriteString(chunk.Content)
		if err := sw.WriteChunk(chunk.Content); err != nil {
			log.Printf("[new-paper] write chunk error: %v", err)
			return
		}
	}

	summary := summaryBuilder.String()
	log.Printf("[new-paper] summary complete for %s: %d chars", paper.Ref(), len(summary))

	paper.SetInitialSummary(summary)
	paper.Save()

	// Extract title synchronously
	title, err := s.api.ExtractTitle(s.cfg.API.LightModel, content)
	if err == nil && title != "" {
		paper.SetTitle(title)
		paper.Save()
		sw.WriteTitle(title)
		log.Printf("[new-paper] title extracted: %s", title)
	} else if err != nil {
		log.Printf("[new-paper] title extraction failed: %v", err)
	}

	sw.WriteDone(paper.Ref())
}

func (s *Server) handleGetPaper(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	writeJSON(w, http.StatusOK, paperToResponse(paper))
}

func (s *Server) handleListPapers(w http.ResponseWriter, r *http.Request) {
	papers, err := session.ListPapers()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list failed"})
		return
	}

	response := make([]paperSummaryResponse, 0, len(papers))
	for _, p := range papers {
		response = append(response, paperSummaryResponse{
			ID:        p.Ref(),
			Title:     p.Title,
			UpdatedAt: p.UpdatedAt.Format("2006-01-02 15:04"),
		})
	}
	writeJSON(w, http.StatusOK, response)
}

func (s *Server) handleDeletePaper(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := session.DeletePaperByRef(id); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	log.Printf("[chat] loading paper %s", id)

	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot read request body"})
		return
	}

	var req chatRequest
	if err := json.Unmarshal(body, &req); err != nil || req.Question == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "question required"})
		return
	}

	log.Printf("[chat] question: %s", req.Question)

	round := paper.CurrentRound() + 1

	// Add user message
	userMsg := session.Message{
		RoundNumber: round,
		Role:        "user",
		Content:     req.Question,
		TokenCount:  session.EstimateTokens(req.Question),
	}
	paper.AddMessage(userMsg)

	// Build messages for CHAT phase
	recent := paper.RecentMessages(s.cfg.UI.MaxRecentRounds)
	messages := []api.ChatMessage{
		{Role: "system", Content: prompt.GetLight()},
		{Role: "user", Content: fmt.Sprintf("以下是论文全文：\n\n%s", paper.Content)},
	}
	for _, msg := range recent {
		messages = append(messages, api.ChatMessage{Role: msg.Role, Content: msg.Content})
	}

	// Stream answer via SSE
	sw, err := newSSEWriter(w)
	if err != nil {
		log.Printf("[chat] SSE not supported: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming not supported"})
		return
	}

	ch := s.api.ChatStream(s.cfg.API.DefaultModel, messages)
	var answerBuilder strings.Builder

	for chunk := range ch {
		select {
		case <-r.Context().Done():
			log.Printf("[chat] client disconnected")
			return
		default:
		}

		if chunk.Err != nil {
			log.Printf("[chat] stream error: %v", chunk.Err)
			sw.WriteError(chunk.Err.Error())
			return
		}
		if chunk.Done {
			break
		}
		answerBuilder.WriteString(chunk.Content)
		if err := sw.WriteChunk(chunk.Content); err != nil {
			return
		}
	}

	answer := answerBuilder.String()
	log.Printf("[chat] answer complete: %d chars", len(answer))

	// Save assistant message
	assistantMsg := session.Message{
		RoundNumber: round,
		Role:        "assistant",
		Content:     answer,
		TokenCount:  session.EstimateTokens(answer),
	}
	paper.AddMessage(assistantMsg)
	paper.Save()

	// Generate digest async — reload paper inside goroutine by ref
	go func(paperRef string, question string, round int) {
		digest, err := s.api.SummarizeQuestion(s.cfg.API.LightModel, question)
		if err == nil && digest != "" {
			p, loadErr := session.LoadPaperByRef(paperRef)
			if loadErr != nil {
				log.Printf("[chat] reload paper for digest: %v", loadErr)
				return
			}
			for i := range p.Messages {
				if p.Messages[i].Role == "user" && p.Messages[i].RoundNumber == round {
					p.Messages[i].Digest = digest
					break
				}
			}
			p.Save()
		}
	}(paper.Ref(), req.Question, round)

	sw.WriteDone(paper.Ref())
}

func (s *Server) handleDeleteRound(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	nStr := r.PathValue("n")

	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}

	n, err := strconv.Atoi(nStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid round number"})
		return
	}

	paper.DeleteRound(n)
	paper.Save()

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}

	exportPath, err := export.ExportToObsidian(s.cfg, paper)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "export failed: " + err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"status": "exported",
		"path":   exportPath,
	})
}

func (s *Server) handleGetConfig(w http.ResponseWriter, r *http.Request) {
	cfg := map[string]interface{}{
		"api": map[string]string{
			"base_url":      s.cfg.API.BaseURL,
			"api_key":       "••••••••",
			"default_model": s.cfg.API.DefaultModel,
			"light_model":   s.cfg.API.LightModel,
		},
		"obsidian": map[string]string{
			"vault_path":    s.cfg.Obsidian.VaultPath,
			"export_folder": s.cfg.Obsidian.ExportFolder,
		},
		"ui": map[string]int{
			"max_recent_rounds": s.cfg.UI.MaxRecentRounds,
		},
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) handleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1 MB

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
		return
	}

	if v, ok := updates["obsidian_vault_path"].(string); ok {
		s.cfg.Obsidian.VaultPath = v
	}
	if v, ok := updates["obsidian_export_folder"].(string); ok {
		s.cfg.Obsidian.ExportFolder = v
	}

	if err := s.cfg.Save(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save config failed"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// --- Helpers ---

func (s *Server) fetchPaperContent(req newPaperRequest) (content string, sourceURL string, err error) {
	if req.URL != "" {
		sourceURL = req.URL
		if arxivURL, _, ok := urlparse.NormalizeArxivInput(req.URL); ok {
			sourceURL = arxivURL
			content, err = urlparse.FetchURL(arxivURL)
		} else {
			content, err = urlparse.FetchURL(req.URL)
		}
		if err != nil {
			return "", "", fmt.Errorf("fetch URL failed: %w", err)
		}
		if content == "" {
			return "", "", fmt.Errorf("empty content from URL")
		}
	} else if req.Content != "" {
		content = req.Content
	} else {
		return "", "", fmt.Errorf("url or content required")
	}
	return content, sourceURL, nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("json encode error: %v", err)
	}
}

func paperToResponse(p *session.Paper) paperResponse {
	msgs := make([]messageResponse, 0, len(p.Messages))
	for _, m := range p.Messages {
		msgs = append(msgs, messageResponse{
			RoundNumber: m.RoundNumber,
			Role:        m.Role,
			Content:     m.Content,
			Digest:      m.Digest,
			TokenCount:  m.TokenCount,
		})
	}

	return paperResponse{
		ID:             p.Ref(),
		Title:          p.Title,
		SourceURL:      p.SourceURL,
		InitialSummary: p.InitialSummary,
		ModelUsed:      p.ModelUsed,
		CreatedAt:      p.CreatedAt.Format("2006-01-02 15:04"),
		UpdatedAt:      p.UpdatedAt.Format("2006-01-02 15:04"),
		Messages:       msgs,
	}
}
