//go:build windows

package main

func daemonize() {
	// On Windows, the systray handles the process lifecycle directly.
	// Daemonization via Setsid is Unix-only and not needed here.
}
