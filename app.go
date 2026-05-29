package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx         context.Context
	configPath  string
	startupArgs []string
}

type FileResult struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Error   string `json:"error"`
}

type Config struct {
	RecentFiles   []string `json:"recentFiles"`
	LastOpenedDir string   `json:"lastOpenedDir"`
}

const maxRecentFiles = 10

func NewApp() *App {
	return &App{startupArgs: collectStartupArgs(os.Args)}
}

func collectStartupArgs(args []string) []string {
	if len(args) <= 1 {
		return nil
	}
	var result []string
	for _, raw := range args[1:] {
		if raw == "" || strings.HasPrefix(raw, "-") {
			continue
		}
		abs, err := filepath.Abs(raw)
		if err != nil {
			continue
		}
		info, err := os.Stat(abs)
		if err != nil || info.IsDir() {
			continue
		}
		result = append(result, abs)
	}
	return result
}

func (a *App) GetStartupFiles() []string {
	return a.startupArgs
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	appData, err := os.UserConfigDir()
	if err == nil {
		a.configPath = filepath.Join(appData, "mdediter", "config.json")
		_ = os.MkdirAll(filepath.Dir(a.configPath), 0755)
	}
	runtime.OnFileDrop(ctx, a.onFileDrop)
}

func (a *App) loadConfig() Config {
	var cfg Config
	if a.configPath == "" {
		return cfg
	}
	data, err := os.ReadFile(a.configPath)
	if err != nil {
		return cfg
	}
	_ = json.Unmarshal(data, &cfg)
	return cfg
}

func (a *App) saveConfig(cfg Config) {
	if a.configPath == "" {
		return
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(a.configPath, data, 0644)
}

func (a *App) OpenFileDialog() FileResult {
	cfg := a.loadConfig()
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Open Markdown file",
		DefaultDirectory: cfg.LastOpenedDir,
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown (*.md;*.markdown;*.txt)", Pattern: "*.md;*.markdown;*.txt"},
			{DisplayName: "All files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return FileResult{Error: err.Error()}
	}
	if path == "" {
		return FileResult{Error: "cancelled"}
	}
	return a.ReadFile(path)
}

func (a *App) ReadFile(path string) FileResult {
	data, err := os.ReadFile(path)
	if err != nil {
		return FileResult{Path: path, Error: err.Error()}
	}
	cfg := a.loadConfig()
	cfg.LastOpenedDir = filepath.Dir(path)
	cfg.RecentFiles = addRecent(cfg.RecentFiles, path)
	a.saveConfig(cfg)
	return FileResult{Path: path, Content: string(data)}
}

func (a *App) SaveFile(path string, content string) FileResult {
	if path == "" {
		return FileResult{Error: "path is empty"}
	}
	tmp := path + ".mdediter.tmp"
	if err := os.WriteFile(tmp, []byte(content), 0644); err != nil {
		return FileResult{Path: path, Error: err.Error()}
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return FileResult{Path: path, Error: err.Error()}
	}
	cfg := a.loadConfig()
	cfg.LastOpenedDir = filepath.Dir(path)
	cfg.RecentFiles = addRecent(cfg.RecentFiles, path)
	a.saveConfig(cfg)
	return FileResult{Path: path}
}

func (a *App) SaveFileDialog(suggestedName string, content string) FileResult {
	cfg := a.loadConfig()
	if suggestedName == "" {
		suggestedName = "untitled.md"
	}
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:            "Save As",
		DefaultDirectory: cfg.LastOpenedDir,
		DefaultFilename:  suggestedName,
		Filters: []runtime.FileFilter{
			{DisplayName: "Markdown (*.md)", Pattern: "*.md"},
			{DisplayName: "All files (*.*)", Pattern: "*.*"},
		},
	})
	if err != nil {
		return FileResult{Error: err.Error()}
	}
	if path == "" {
		return FileResult{Error: "cancelled"}
	}
	return a.SaveFile(path, content)
}

func (a *App) GetRecentFiles() []string {
	cfg := a.loadConfig()
	var alive []string
	for _, p := range cfg.RecentFiles {
		if _, err := os.Stat(p); err == nil {
			alive = append(alive, p)
		}
	}
	if len(alive) != len(cfg.RecentFiles) {
		cfg.RecentFiles = alive
		a.saveConfig(cfg)
	}
	return alive
}

func (a *App) ConfirmUnsavedClose(title string) bool {
	selection, err := runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
		Type:          runtime.QuestionDialog,
		Title:         "Unsaved changes",
		Message:       title + " has unsaved changes. Close anyway?",
		Buttons:       []string{"Close", "Cancel"},
		DefaultButton: "Cancel",
		CancelButton:  "Cancel",
	})
	if err != nil {
		return false
	}
	return selection == "Close"
}

func (a *App) onFileDrop(_, _ int, paths []string) {
	if a.ctx == nil || len(paths) == 0 {
		return
	}
	runtime.EventsEmit(a.ctx, "files-dropped", paths)
}

func addRecent(list []string, path string) []string {
	result := []string{path}
	for _, p := range list {
		if p == path {
			continue
		}
		result = append(result, p)
		if len(result) >= maxRecentFiles {
			break
		}
	}
	return result
}
