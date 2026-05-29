package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"syscall"
	"time"

	tea "charm.land/bubbletea/v2"

	"github.com/paperpaper/paperpaper/internal/config"
	"github.com/paperpaper/paperpaper/internal/server"
	"github.com/paperpaper/paperpaper/internal/session"
	"github.com/paperpaper/paperpaper/internal/tui"
	"github.com/paperpaper/paperpaper/internal/urlparse"
)

var tuiMode = flag.Bool("tui", false, "Run in terminal TUI mode instead of web UI")

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

	if *tuiMode {
		runTUI(cfg)
		return
	}

	runServer(cfg)
}

func runServer(cfg *config.Config) {
	s := server.New(cfg)

	startPort := 8686
	baseAddr := fmt.Sprintf(":%d", startPort)
	if v := os.Getenv("PAPER_ADDR"); v != "" {
		baseAddr = v
	}

	ln, actualPort, err := findAvailablePort(baseAddr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find available port: %v\n", err)
		os.Exit(1)
	}

	httpServer := &http.Server{
		Handler: s.Handler(),
	}

	url := fmt.Sprintf("http://localhost:%d", actualPort)
	fmt.Printf("PaperPaper server starting on %s\n", url)

	// Handle graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigCh
		fmt.Printf("\nReceived %v, shutting down...\n", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "Shutdown error: %v\n", err)
		}
	}()

	// Auto-open browser
	go openBrowser(url)

	if err := httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
}

// findAvailablePort tries to listen on baseAddr. If the port is occupied,
// it increments the port number up to 100 times until it finds an open one.
func findAvailablePort(baseAddr string) (net.Listener, int, error) {
	host, portStr, err := net.SplitHostPort(baseAddr)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid address %q: %w", baseAddr, err)
	}

	startPort, err := strconv.Atoi(portStr)
	if err != nil {
		return nil, 0, fmt.Errorf("invalid port in %q: %w", baseAddr, err)
	}

	for port := startPort; port < startPort+100; port++ {
		addr := net.JoinHostPort(host, strconv.Itoa(port))
		ln, listenErr := net.Listen("tcp", addr)
		if listenErr == nil {
			return ln, port, nil
		}
	}

	return nil, 0, fmt.Errorf("no available port found starting from %d", startPort)
}

// openBrowser opens the given URL in the default browser.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		return
	}
	_ = cmd.Start()
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
