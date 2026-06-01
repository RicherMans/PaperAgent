//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"syscall"
)

func daemonize() {
	// When PAPER_FOREGROUND is set (e.g. in dev mode), skip daemonization
	// so the process stays attached to the terminal and receives Ctrl+C.
	if os.Getenv("PAPER_FOREGROUND") != "" {
		return
	}

	args := make([]string, 0, len(os.Args)+1)
	args = append(args, os.Args...)
	args = append(args, "--daemon")

	exe, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to find executable: %v\n", err)
		os.Exit(1)
	}

	cmd := exec.Command(exe, args[1:]...)
	cmd.Env = os.Environ()
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid: true,
	}

	if err := cmd.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start background process: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("PaperAgent started in background.")
	os.Exit(0)
}
