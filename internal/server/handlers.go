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

// handleNewPaper creates a new paper and streams the initial summary.
func (s *Server) handleNewPaper(w http.ResponseWriter, r *http.Request) {
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
	s.mgr.SetPaper(paper)

	if err := session.SavePaper(paper); err != nil {
		log.Printf("[new-paper] save error: %v", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "save failed"})
		return
	}

	log.Printf("[new-paper] paper created: %s", paper.Ref())

	// Start SSE stream
	sw := newSSEWriter(w)

	// CRITICAL: send "created" event with paper ID FIRST,
	// so the frontend can start displaying the ChatView immediately
	if err := sw.WriteCreated(paper.Ref()); err != nil {
		log.Printf("[new-paper] failed to send created event: %v", err)
		return
	}

	log.Printf("[new-paper] starting summary stream for %s", paper.Ref())

	// Add initial user message (for context tracking, not displayed in UI)
	s.mgr.AddMessage(session.Message{
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
	chunkCount := 0

	for chunk := range ch {
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
		chunkCount++
	}

	summary := summaryBuilder.String()
	log.Printf("[new-paper] summary complete for %s: %d chars, %d chunks", paper.Ref(), len(summary), chunkCount)

	s.mgr.SetInitialSummary(summary)
	session.SavePaper(paper)

	// Extract title synchronously before sending "done",
	// so the frontend can receive the title event and update the paper list
	title, err := s.api.ExtractTitle(s.cfg.API.LightModel, content)
	if err == nil && title != "" {
		s.mgr.SetTitle(title)
		session.SavePaper(paper)
		sw.WriteTitle(title)
		log.Printf("[new-paper] title extracted: %s", title)
	} else if err != nil {
		log.Printf("[new-paper] title extraction failed: %v", err)
	}

	sw.WriteDone(paper.Ref())
}

// handleGetPaper returns full paper details.
func (s *Server) handleGetPaper(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	s.mgr.SetPaper(paper)
	writeJSON(w, http.StatusOK, paperToResponse(paper))
}

// handleListPapers returns all paper summaries.
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

// handleDeletePaper deletes a paper.
func (s *Server) handleDeletePaper(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := session.DeletePaperByRef(id); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleChat handles a Q&A round with SSE streaming.
func (s *Server) handleChat(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	log.Printf("[chat] loading paper %s", id)

	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	s.mgr.SetPaper(paper)

	var req chatRequest
	body, _ := io.ReadAll(r.Body)
	if err := json.Unmarshal(body, &req); err != nil || req.Question == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "question required"})
		return
	}

	log.Printf("[chat] question: %s", req.Question)

	round := 1
	if len(paper.Messages) > 0 {
		round = paper.Messages[len(paper.Messages)-1].RoundNumber + 1
	}

	// Add user message
	userMsg := session.Message{
		RoundNumber: round,
		Role:        "user",
		Content:     req.Question,
		TokenCount:  session.EstimateTokens(req.Question),
	}
	s.mgr.AddMessage(userMsg)

	// Build messages for CHAT phase
	recent := s.mgr.GetRecentMessages(s.cfg.UI.MaxRecentRounds)
	messages := []api.ChatMessage{
		{Role: "system", Content: prompt.GetLight()},
		{Role: "user", Content: fmt.Sprintf("以下是论文全文：\n\n%s", paper.Content)},
	}
	for _, msg := range recent {
		messages = append(messages, api.ChatMessage{Role: msg.Role, Content: msg.Content})
	}

	// Stream answer via SSE
	sw := newSSEWriter(w)

	ch := s.api.ChatStream(s.cfg.API.DefaultModel, messages)
	var answerBuilder strings.Builder

	for chunk := range ch {
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
	s.mgr.AddMessage(assistantMsg)
	session.SavePaper(paper)

	// Generate digest async
	go func(mgr *session.Manager, question string, r int) {
		digest, err := s.api.SummarizeQuestion(s.cfg.API.LightModel, question)
		if err == nil && digest != "" {
			p := mgr.Paper()
			if p != nil {
				for i := range p.Messages {
					if p.Messages[i].Role == "user" && p.Messages[i].RoundNumber == r {
						p.Messages[i].Digest = digest
						break
					}
				}
				session.SavePaper(p)
			}
		}
	}(s.mgr, req.Question, round)

	sw.WriteDone(paper.Ref())
}

// handleDeleteRound deletes a specific Q&A round.
func (s *Server) handleDeleteRound(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	nStr := r.PathValue("n")

	paper, err := session.LoadPaperByRef(id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "paper not found"})
		return
	}
	s.mgr.SetPaper(paper)

	n, err := strconv.Atoi(nStr)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid round number"})
		return
	}

	s.mgr.DeleteRound(n)
	session.SavePaper(paper)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// handleExport exports a paper to Obsidian.
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

// handleGetConfig returns current config (without API key).
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

// handleUpdateConfig updates configuration.
func (s *Server) handleUpdateConfig(w http.ResponseWriter, r *http.Request) {
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
	json.NewEncoder(w).Encode(v)
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
