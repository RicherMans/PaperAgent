package server

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/paperpaper/paperpaper/internal/api"
	"github.com/paperpaper/paperpaper/internal/config"
	"github.com/paperpaper/paperpaper/internal/session"
)

//go:embed frontend-dist
var frontendDist embed.FS

type Server struct {
	cfg *config.Config
	api *api.Client
	mgr *session.Manager
	mux *http.ServeMux
}

func New(cfg *config.Config) *Server {
	s := &Server{
		cfg: cfg,
		api: api.NewClient(cfg),
		mgr: session.NewManager(),
		mux: http.NewServeMux(),
	}
	s.registerRoutes()
	return s
}

func (s *Server) registerRoutes() {
	mux := s.mux

	mux.HandleFunc("POST /api/papers", s.handleNewPaper)
	mux.HandleFunc("GET /api/papers", s.handleListPapers)
	mux.HandleFunc("GET /api/papers/{id}", s.handleGetPaper)
	mux.HandleFunc("DELETE /api/papers/{id}", s.handleDeletePaper)
	mux.HandleFunc("POST /api/papers/{id}/chat", s.handleChat)
	mux.HandleFunc("DELETE /api/papers/{id}/rounds/{n}", s.handleDeleteRound)
	mux.HandleFunc("POST /api/papers/{id}/export", s.handleExport)
	mux.HandleFunc("GET /api/config", s.handleGetConfig)
	mux.HandleFunc("POST /api/config", s.handleUpdateConfig)

	s.registerStatic()
}

func (s *Server) registerStatic() {
	fSys, err := fs.Sub(frontendDist, "frontend-dist")
	if err != nil {
		log.Printf("Warning: no embedded frontend dist found, will serve 404 for static files")
		return
	}
	fileServer := http.FileServer(http.FS(fSys))
	s.mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		if path == "/" || !strings.Contains(path, ".") {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	}))
}

func (s *Server) Start(addr string) error {
	log.Printf("PaperPaper server starting on http://%s\n", addr)
	return http.ListenAndServe(addr, withCORS(withLogging(s.mux)))
}

func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &loggingResponseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(lw, r)
		duration := time.Since(start)
		log.Printf("[%s] %s %s -> %d (%s)", r.Method, r.URL.Path, r.RemoteAddr, lw.statusCode, duration.Round(time.Millisecond))
	})
}

type loggingResponseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (lw *loggingResponseWriter) WriteHeader(code int) {
	lw.statusCode = code
	lw.ResponseWriter.WriteHeader(code)
}

func (lw *loggingResponseWriter) Write(b []byte) (int, error) {
	return lw.ResponseWriter.Write(b)
}

func (lw *loggingResponseWriter) Flush() {
	if f, ok := lw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
