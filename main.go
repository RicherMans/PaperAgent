package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	tea "charm.land/bubbletea/v2"

	"github.com/paperpaper/paperpaper/internal/config"
	"github.com/paperpaper/paperpaper/internal/server"
	"github.com/paperpaper/paperpaper/internal/session"
	"github.com/paperpaper/paperpaper/internal/tui"
	"github.com/paperpaper/paperpaper/internal/urlparse"
)

var serverMode = flag.Bool("server", false, "Run as HTTP server instead of TUI")

func main() {
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config: %v\n", err)
		os.Exit(1)
	}

	if cfg.API.APIKey == "" || cfg.API.APIKey == "${OPENAI_API_KEY}" {
		fmt.Fprintln(os.Stderr, "Error: No API key configured.")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Please configure your API key:")
		fmt.Fprintln(os.Stderr, "  export OPENAI_API_KEY=your-key-here")
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Or create ~/.paperpaper/config.yaml with api.api_key set.")
		os.Exit(1)
	}

	os.MkdirAll(config.PapersDir(), 0755)
	os.MkdirAll(config.PromptsDir(), 0755)

	if *serverMode {
		runServer(cfg)
		return
	}

	runTUI(cfg)
}

func runServer(cfg *config.Config) {
	srv := server.New(cfg)

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\nShutting down...")
		os.Exit(0)
	}()

	addr := ":8686"
	if v := os.Getenv("PAPER_ADDR"); v != "" {
		addr = v
	}

	fmt.Printf("PaperPaper server starting on http://localhost%s\n", addr)
	if err := srv.Start(addr); err != nil {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

func runTUI(cfg *config.Config) {
	m := tui.NewModel(cfg)

	if flag.NArg() > 0 {
		input := flag.Arg(0)
		var content string

		if arxivURL, _, ok := urlparse.NormalizeArxivInput(input); ok {
			content, _ = urlparse.FetchURL(arxivURL)
		} else if urlparse.IsURL(input) {
			content, _ = urlparse.FetchURL(input)
		} else {
			content, _ = urlparse.LoadFile(input)
		}

		if content != "" {
			p := session.NewPaper(content, input)
			m.LoadPaper(p)
		}
	}

	if _, err := tea.NewProgram(m).Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}
