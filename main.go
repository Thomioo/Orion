package main

import (
	_ "embed" // For embedding files
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/getlantern/systray"
	"github.com/gorilla/websocket"
)

var (
	serverPort = "8000" // Default port, can be changed if needed
)

//go:embed icon.ico
var iconData []byte

//go:embed server-settings.html
var settingsHTML []byte

func findAvailablePort(startPort string) string {
	port := startPort
	for i := 0; i < 10; i++ { // Try up to 10 different ports
		listener, err := net.Listen("tcp", ":"+port)
		if err == nil {
			listener.Close()
			return port
		}
	}
	return startPort // Return original if all fail
}

func startServer() {
	// Load settings
	serverSettings = loadSettings()

	// Use port from settings
	serverPort = serverSettings.ServerPort

	// Find an available port
	availablePort := findAvailablePort(serverPort)
	if availablePort != serverPort {
		fmt.Printf("[INFO] Port %s is busy, using port %s instead\n", serverPort, availablePort)
		serverPort = availablePort
		// Update settings with actual port
		serverSettings.ServerPort = availablePort
	}

	// Determine server host (use setting or auto-detect)
	var serverHost string
	if serverSettings.ServerHost != "" {
		serverHost = serverSettings.ServerHost
	} else {
		serverHost = getLocalIP()
	}

	// Ensure uploads directory exists
	if err := ensureUploadsDir(); err != nil {
		fmt.Printf("[ERROR] Failed to create uploads directory: %v\n", err)
		os.Exit(1)
	}

	http.HandleFunc("/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		textContent := "All Good"
		w.Write([]byte(textContent))
	}))

	// Serve uploaded files
	http.HandleFunc("/uploads/", corsMiddleware(handleFileDownload))

	// Mobile web interface
	http.HandleFunc("/mobile/", corsMiddleware(handleMobileWeb))

	// Serve mobile static files (images, etc.)
	http.HandleFunc("/imgs/", corsMiddleware(handleMobileAssets))

	// WebSocket endpoints
	http.HandleFunc("/pc/ws", corsMiddleware(handlePCWebSocket))
	http.HandleFunc("/mobile/ws", corsMiddleware(handleMobileWebSocket))

	// PC endpoints
	http.HandleFunc("/pc/items", corsMiddleware(handlePCItems))
	http.HandleFunc("/pc/message", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleMessage(w, r, "PC")
	}))
	http.HandleFunc("/pc/file", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleFile(w, r, "PC")
	}))
	http.HandleFunc("/pc/youtube-info", corsMiddleware(handleYouTubeInfo))

	// Mobile endpoints
	http.HandleFunc("/mobile/items", corsMiddleware(handleMobileItems))
	http.HandleFunc("/mobile/message", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleMessage(w, r, "phone")
	}))
	http.HandleFunc("/mobile/file", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleFile(w, r, "phone")
	}))

	// Server settings endpoints
	http.HandleFunc("/settings", corsMiddleware(handleServerSettings))
	http.HandleFunc("/settings/", corsMiddleware(handleServerSettingsPage))
	http.HandleFunc("/status", corsMiddleware(handleServerStatus))
	http.HandleFunc("/clear-history", corsMiddleware(handleClearHistory))
	http.HandleFunc("/favicon.ico", corsMiddleware(handleFavicon))

	fmt.Printf("[INFO] Server starting on http://%s:%s\n", serverHost, serverPort)

	// Start the server
	if err := http.ListenAndServe(serverHost+":"+serverPort, nil); err != nil {
		fmt.Printf("[ERROR] Server failed to start on %s:%s: %v\n", serverHost, serverPort, err)
		fmt.Printf("[INFO] Try closing other applications using port %s and restart\n", serverPort)
	}
}

func getLocalIP() string {
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ""
	}
	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
			if strings.HasPrefix(ipnet.IP.String(), "192.168.") {
				return ipnet.IP.String()
			}
		}
	}
	return ""
}

// Get current server host (from settings or auto-detect)
func getCurrentServerHost() string {
	if serverSettings.ServerHost != "" {
		return serverSettings.ServerHost
	}
	return getLocalIP()
}

// CORS middleware function
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all requests (always enabled)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.Header().Set("Access-Control-Allow-Credentials", "false")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Call the next handler
		next.ServeHTTP(w, r)
	})
}

// Item structure for the flow
type Item struct {
	ID        string    `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	From      string    `json:"from"`
	Type      string    `json:"type"`
	Content   string    `json:"content"`
}

// YouTube video info structure
type YouTubeVideoInfo struct {
	VideoID       string `json:"videoId"`
	Title         string `json:"title"`
	CurrentTime   int    `json:"currentTime"`
	Duration      int    `json:"duration"`
	TimestampLink string `json:"timestampLink"`
	IsPlaying     bool   `json:"isPlaying"`
	URL           string `json:"url"`
}

// Server settings structure
type ServerSettings struct {
	ServerHost string `json:"serverHost"`
	ServerPort string `json:"serverPort"`
	// DataRetention: number of days to keep files; 0 means never delete
	DataRetention int `json:"dataRetention"`
}

// Server status structure
type ServerStatus struct {
	IsOnline    bool   `json:"isOnline"`
	Uptime      string `json:"uptime"`
	Version     string `json:"version"`
	Connections int    `json:"connections"`
}

// Flow data structure
type FlowData struct {
	Items []Item `json:"items"`
}

const dataFile = "memory/data.json"
const uploadsDir = "memory/uploads"
const settingsFile = "memory/settings.json"

var (
	serverSettings  = getDefaultSettings()
	serverStartTime = time.Now()
)

// Get default server settings
func getDefaultSettings() ServerSettings {
	return ServerSettings{
		ServerHost:    "localhost",
		ServerPort:    "8888",
		DataRetention: 0, // 0 means never delete
	}
}

// Load server settings from file
func loadSettings() ServerSettings {
	// On Windows, use embedded settings file
	var settings ServerSettings
	if _, err := os.Stat(settingsFile); os.IsNotExist(err) {
		fmt.Printf("[DEBUG] Settings file doesn't exist, using defaults\n")
		return getDefaultSettings()
	}
	fmt.Printf("[DEBUG] Loading settings from file: %s\n", settingsFile)
	fileData, err := os.ReadFile(settingsFile)
	if err != nil {
		fmt.Printf("[ERROR] Error reading settings file: %v\n", err)
		return getDefaultSettings()
	}
	err = json.Unmarshal(fileData, &settings)
	if err != nil {
		fmt.Printf("[ERROR] Error parsing settings JSON: %v\n", err)
		return getDefaultSettings()
	}
	fmt.Printf("[DEBUG] Settings loaded successfully\n")
	return settings
}

// Load server settings from config.json (for non-Windows)
func loadConfigSettings(configPath string) ServerSettings {
	var settings ServerSettings
	fileData, err := os.ReadFile(configPath)
	if err != nil {
		fmt.Printf("[ERROR] Error reading config.json: %v\n", err)
		return getDefaultSettings()
	}
	err = json.Unmarshal(fileData, &settings)
	if err != nil {
		fmt.Printf("[ERROR] Error parsing config.json: %v\n", err)
		return getDefaultSettings()
	}
	fmt.Printf("[DEBUG] Config loaded from %s\n", configPath)
	return settings
}

// Save server settings to file
func saveSettings(settings ServerSettings) error {
	// On Windows, save to settingsFile
	if runtime.GOOS == "windows" {
		os.MkdirAll("memory", 0755)
		jsonData, err := json.MarshalIndent(settings, "", "    ")
		if err != nil {
			return err
		}
		return os.WriteFile(settingsFile, jsonData, 0644)
	} else {
		// On non-Windows, save to config.json
		jsonData, err := json.MarshalIndent(settings, "", "    ")
		if err != nil {
			return err
		}
		return os.WriteFile("config.json", jsonData, 0644)
	}
}

// Load data from file
func loadData() FlowData {
	var data FlowData

	if _, err := os.Stat(dataFile); os.IsNotExist(err) {
		fmt.Printf("[DEBUG] Data file doesn't exist, creating directory and returning empty data\n")
		// Create directory if it doesn't exist
		os.MkdirAll("memory", 0755)
		return data
	}

	fmt.Printf("[DEBUG] Loading data from file: %s\n", dataFile)
	fileData, err := os.ReadFile(dataFile)
	if err != nil {
		fmt.Printf("[ERROR] Error reading file: %v\n", err)
		return data
	}

	fmt.Printf("[DEBUG] File read successfully, size: %d bytes\n", len(fileData))

	err = json.Unmarshal(fileData, &data)
	if err != nil {
		fmt.Printf("[ERROR] Error parsing JSON: %v\n", err)
		return data
	}

	fmt.Printf("[DEBUG] Data loaded successfully, items count: %d\n", len(data.Items))
	return data
}

// Save data to file
func saveFlowData(data FlowData) error {
	jsonData, err := json.MarshalIndent(data, "", "    ")
	if err != nil {
		return err
	}

	return os.WriteFile(dataFile, jsonData, 0644)
}

// Generate unique ID
func generateID() string {
	return fmt.Sprintf("item_%d", time.Now().UnixNano())
}

// Handle PC items endpoint
func handlePCItems(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] PC items endpoint called - Method: %s\n", r.Method)

	if r.Method != "GET" {
		fmt.Printf("[ERROR] PC items: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := loadData()
	fmt.Printf("[DEBUG] PC items: Loaded %d items from data file\n", len(data.Items))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
	fmt.Printf("[DEBUG] PC items: Response sent successfully\n")
}

// Handle mobile items endpoint
func handleMobileItems(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Mobile items endpoint called - Method: %s\n", r.Method)

	if r.Method != "GET" {
		fmt.Printf("[ERROR] Mobile items: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	data := loadData()
	fmt.Printf("[DEBUG] Mobile items: Loaded %d items from data file\n", len(data.Items))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
	fmt.Printf("[DEBUG] Mobile items: Response sent successfully\n")
}

// Handle message endpoint
func handleMessage(w http.ResponseWriter, r *http.Request, from string) {
	fmt.Printf("[DEBUG] Message endpoint called - From: %s, Method: %s\n", from, r.Method)

	if r.Method != "POST" {
		fmt.Printf("[ERROR] Message: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var msgData struct {
		Text string `json:"text"`
	}

	if err := json.NewDecoder(r.Body).Decode(&msgData); err != nil {
		fmt.Printf("[ERROR] Message: Invalid JSON: %v\n", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	fmt.Printf("[DEBUG] Message: Received text from %s: '%s'\n", from, msgData.Text)

	// Create new item
	item := Item{
		ID:        generateID(),
		Timestamp: time.Now(),
		From:      from,
		Type:      "text",
		Content:   msgData.Text,
	}

	fmt.Printf("[DEBUG] Message: Created item with ID: %s\n", item.ID)

	// Load current data, add item, and save
	data := loadData()
	fmt.Printf("[DEBUG] Message: Loaded existing data with %d items\n", len(data.Items))

	data.Items = append(data.Items, item)
	fmt.Printf("[DEBUG] Message: Added new item, total items: %d\n", len(data.Items))

	if err := saveFlowData(data); err != nil {
		fmt.Printf("[ERROR] Message: Error saving data: %v\n", err)
		http.Error(w, "Error saving data", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[DEBUG] Message: Data saved successfully\n")

	// Broadcast update to all WebSocket connections
	connectionManager.BroadcastUpdate()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "id": item.ID})
	fmt.Printf("[DEBUG] Message: Response sent successfully\n")
}

// Handle file endpoint
func handleFile(w http.ResponseWriter, r *http.Request, from string) {
	fmt.Printf("[DEBUG] File endpoint called - From: %s, Method: %s\n", from, r.Method)

	if r.Method != "POST" {
		fmt.Printf("[ERROR] File: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the multipart form
	err := r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		fmt.Printf("[ERROR] File: Unable to parse form: %v\n", err)
		http.Error(w, "Unable to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		fmt.Printf("[ERROR] File: Unable to get file: %v\n", err)
		http.Error(w, "Unable to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fmt.Printf("[DEBUG] File: Received file from %s: '%s' (size: %d bytes)\n", from, header.Filename, header.Size)

	// Generate unique filename to avoid conflicts
	uniqueFilename := fmt.Sprintf("%s_%s", generateID(), header.Filename)
	filePath := filepath.Join(uploadsDir, uniqueFilename)

	fmt.Printf("[DEBUG] File: Saving to path: %s\n", filePath)

	// Create the file on disk
	dst, err := os.Create(filePath)
	if err != nil {
		fmt.Printf("[ERROR] File: Unable to create file: %v\n", err)
		http.Error(w, "Unable to save file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	// Copy file content
	_, err = io.Copy(dst, file)
	if err != nil {
		fmt.Printf("[ERROR] File: Unable to save file content: %v\n", err)
		http.Error(w, "Unable to save file", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[DEBUG] File: File saved successfully\n")

	// Create new item with the unique filename for storage
	item := Item{
		ID:        generateID(),
		Timestamp: time.Now(),
		From:      from,
		Type:      "file",
		Content:   fmt.Sprintf("%s|%s", header.Filename, uniqueFilename), // Store both display name and unique filename
	}

	fmt.Printf("[DEBUG] File: Created item with ID: %s\n", item.ID)

	// Load current data, add item, and save
	data := loadData()
	fmt.Printf("[DEBUG] File: Loaded existing data with %d items\n", len(data.Items))

	data.Items = append(data.Items, item)
	fmt.Printf("[DEBUG] File: Added new item, total items: %d\n", len(data.Items))

	if err := saveFlowData(data); err != nil {
		fmt.Printf("[ERROR] File: Error saving data: %v\n", err)
		http.Error(w, "Error saving data", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[DEBUG] File: Data saved successfully\n")

	// Broadcast update to all WebSocket connections
	connectionManager.BroadcastUpdate()

	// Generate file URL using the unique filename
	fileURL := fmt.Sprintf("http://%s:%s/uploads/%s", getCurrentServerHost(), serverPort, uniqueFilename)
	fmt.Printf("[DEBUG] File: Generated download URL: %s\n", fileURL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"id":     item.ID,
		"url":    fileURL,
	})
	fmt.Printf("[DEBUG] File: Response sent successfully\n")
}

// Ensure uploads directory exists
func ensureUploadsDir() error {
	fmt.Printf("[DEBUG] Ensuring uploads directory exists: %s\n", uploadsDir)
	err := os.MkdirAll(uploadsDir, 0755)
	if err != nil {
		fmt.Printf("[ERROR] Failed to create uploads directory: %v\n", err)
		return err
	}
	fmt.Printf("[DEBUG] Uploads directory ready\n")
	return nil
}

// Handle file downloads
func handleFileDownload(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] File download requested - URL: %s\n", r.URL.Path)

	if r.Method != "GET" {
		fmt.Printf("[ERROR] File download: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract filename from URL path (remove "/uploads/" prefix)
	filename := r.URL.Path[9:] // Remove "/uploads/"
	if filename == "" {
		fmt.Printf("[ERROR] File download: No filename provided\n")
		http.Error(w, "No filename provided", http.StatusBadRequest)
		return
	}

	filePath := filepath.Join(uploadsDir, filename)
	fmt.Printf("[DEBUG] File download: Looking for file at %s\n", filePath)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		fmt.Printf("[ERROR] File download: File not found: %s\n", filePath)
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Set headers to force download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "application/octet-stream")

	// Serve the file
	fmt.Printf("[DEBUG] File download: Serving file %s\n", filename)
	http.ServeFile(w, r, filePath)
	fmt.Printf("[DEBUG] File download: File served successfully\n")
}

// Handle mobile web interface
func handleMobileWeb(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Mobile web interface requested - URL: %s\n", r.URL.Path)

	if r.Method != "GET" {
		fmt.Printf("[ERROR] Mobile web: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Serve the mobile HTML file
	http.ServeFile(w, r, "mobile/index.html")
}

// Handle mobile static assets (images, etc.)
func handleMobileAssets(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Mobile asset requested - URL: %s\n", r.URL.Path)

	if r.Method != "GET" {
		fmt.Printf("[ERROR] Mobile asset: Method not allowed: %s\n", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract asset path from URL (remove "/imgs/" prefix)
	assetPath := r.URL.Path[6:] // Remove "/imgs/"
	if assetPath == "" {
		fmt.Printf("[ERROR] Mobile asset: No asset path provided\n")
		http.Error(w, "No asset path provided", http.StatusBadRequest)
		return
	}

	// Construct full file path
	filePath := filepath.Join("mobile", "imgs", assetPath)
	fmt.Printf("[DEBUG] Mobile asset: Looking for file at %s\n", filePath)

	// Check if file exists
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		fmt.Printf("[ERROR] Mobile asset: File not found: %s\n", filePath)
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Set appropriate content type based on file extension
	ext := filepath.Ext(assetPath)
	switch ext {
	case ".png":
		w.Header().Set("Content-Type", "image/png")
	case ".jpg", ".jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
	case ".gif":
		w.Header().Set("Content-Type", "image/gif")
	case ".svg":
		w.Header().Set("Content-Type", "image/svg+xml")
	default:
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	// Serve the file
	fmt.Printf("[DEBUG] Mobile asset: Serving file %s\n", assetPath)
	http.ServeFile(w, r, filePath)
	fmt.Printf("[DEBUG] Mobile asset: File served successfully\n")
}

// Handle PC WebSocket connections
func handlePCWebSocket(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] PC WebSocket connection requested\n")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade PC WebSocket connection: %v", err)
		return
	}
	defer conn.Close()

	// Set connection timeouts
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	// Set ping/pong handlers for connection health checking
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Add connection to manager
	connectionManager.AddPCConnection(conn)
	defer connectionManager.RemovePCConnection(conn)

	fmt.Printf("[DEBUG] PC WebSocket connection established\n")

	// Send initial data
	data := loadData()
	err = conn.WriteJSON(map[string]interface{}{
		"type": "initial",
		"data": data,
	})
	if err != nil {
		log.Printf("Error sending initial data to PC WebSocket: %v", err)
		return
	}

	// Start ping ticker
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Handle messages and pings
	go func() {
		defer conn.Close()
		for range ticker.C {
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				fmt.Printf("[DEBUG] PC WebSocket ping failed: %v\n", err)
				return
			}
		}
	}()

	// Keep connection alive and handle incoming messages
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			log.Printf("PC WebSocket connection closed: %v", err)
			break
		}
	}
}

// Handle mobile WebSocket connections
func handleMobileWebSocket(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Mobile WebSocket connection requested\n")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade mobile WebSocket connection: %v", err)
		return
	}
	defer conn.Close()

	// Set connection timeouts
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))

	// Set ping/pong handlers for connection health checking
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Add connection to manager
	connectionManager.AddMobileConnection(conn)
	defer connectionManager.RemoveMobileConnection(conn)

	fmt.Printf("[DEBUG] Mobile WebSocket connection established\n")

	// Send initial data
	data := loadData()
	err = conn.WriteJSON(map[string]interface{}{
		"type": "initial",
		"data": data,
	})
	if err != nil {
		log.Printf("Error sending initial data to mobile WebSocket: %v", err)
		return
	}
	// If there is a current YouTube video playing, send it to the new mobile connection
	if latestYouTubeVideoInfo != nil && latestYouTubeVideoInfo.IsPlaying {
		err = conn.WriteJSON(map[string]interface{}{
			"type": "youtube_info",
			"data": latestYouTubeVideoInfo,
		})
		if err != nil {
			log.Printf("Error sending YouTube info to new mobile WebSocket: %v", err)
		}
	}

	// Start ping ticker
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Handle messages and pings
	go func() {
		defer conn.Close()
		for range ticker.C {
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				fmt.Printf("[DEBUG] Mobile WebSocket ping failed: %v\n", err)
				return
			}
		}
	}()

	// Keep connection alive and handle incoming messages
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Mobile WebSocket connection closed: %v", err)
			break
		}
	}
}

// WebSocket upgrader
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for simplicity
	},
	ReadBufferSize:   1024,
	WriteBufferSize:  1024,
	HandshakeTimeout: 45 * time.Second,
}

// WebSocket connection management
type ConnectionManager struct {
	pcConnections     map[*websocket.Conn]bool
	mobileConnections map[*websocket.Conn]bool
	mutex             sync.RWMutex
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		pcConnections:     make(map[*websocket.Conn]bool),
		mobileConnections: make(map[*websocket.Conn]bool),
	}
}

func (cm *ConnectionManager) AddPCConnection(conn *websocket.Conn) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	cm.pcConnections[conn] = true
	fmt.Printf("[DEBUG] ConnectionManager: Added PC connection, total PC: %d\n", len(cm.pcConnections))
}

func (cm *ConnectionManager) AddMobileConnection(conn *websocket.Conn) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	cm.mobileConnections[conn] = true
	fmt.Printf("[DEBUG] ConnectionManager: Added mobile connection, total mobile: %d\n", len(cm.mobileConnections))
}

func (cm *ConnectionManager) RemovePCConnection(conn *websocket.Conn) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	delete(cm.pcConnections, conn)
	fmt.Printf("[DEBUG] ConnectionManager: Removed PC connection, total PC: %d\n", len(cm.pcConnections))
}

func (cm *ConnectionManager) RemoveMobileConnection(conn *websocket.Conn) {
	cm.mutex.Lock()
	defer cm.mutex.Unlock()
	delete(cm.mobileConnections, conn)
	fmt.Printf("[DEBUG] ConnectionManager: Removed mobile connection, total mobile: %d\n", len(cm.mobileConnections))
}

func (cm *ConnectionManager) BroadcastUpdate() {
	// Load latest data first (outside the lock)
	data := loadData()

	cm.mutex.RLock()

	// Create snapshots of connections to avoid holding the lock too long
	pcConnections := make([]*websocket.Conn, 0, len(cm.pcConnections))
	mobileConnections := make([]*websocket.Conn, 0, len(cm.mobileConnections))

	for conn := range cm.pcConnections {
		pcConnections = append(pcConnections, conn)
	}
	for conn := range cm.mobileConnections {
		mobileConnections = append(mobileConnections, conn)
	}

	cm.mutex.RUnlock()

	// Track connections to remove due to errors
	var pcToRemove []*websocket.Conn
	var mobileToRemove []*websocket.Conn

	// Create the message once
	message := map[string]interface{}{
		"type": "update",
		"data": data,
	}

	// Broadcast to PC connections concurrently
	for _, conn := range pcConnections {
		err := conn.WriteJSON(message)
		if err != nil {
			fmt.Printf("[DEBUG] Error broadcasting to PC connection: %v\n", err)
			pcToRemove = append(pcToRemove, conn)
		}
	}

	// Broadcast to mobile connections concurrently
	for _, conn := range mobileConnections {
		err := conn.WriteJSON(message)
		if err != nil {
			fmt.Printf("[DEBUG] Error broadcasting to mobile connection: %v\n", err)
			mobileToRemove = append(mobileToRemove, conn)
		}
	}

	// Remove failed connections (acquire write lock only if needed)
	if len(pcToRemove) > 0 || len(mobileToRemove) > 0 {
		cm.mutex.Lock()
		for _, conn := range pcToRemove {
			delete(cm.pcConnections, conn)
			conn.Close()
		}
		for _, conn := range mobileToRemove {
			delete(cm.mobileConnections, conn)
			conn.Close()
		}
		fmt.Printf("[DEBUG] Removed %d failed PC connections, %d failed mobile connections\n", len(pcToRemove), len(mobileToRemove))
		fmt.Printf("[DEBUG] Active connections - PC: %d, Mobile: %d\n", len(cm.pcConnections), len(cm.mobileConnections))
		cm.mutex.Unlock()
	}
}

// Broadcast YouTube video info to mobile connections only
func (cm *ConnectionManager) BroadcastYouTubeInfo(videoInfo YouTubeVideoInfo) {
	cm.mutex.RLock()

	// Create snapshot of mobile connections
	mobileConnections := make([]*websocket.Conn, 0, len(cm.mobileConnections))
	for conn := range cm.mobileConnections {
		mobileConnections = append(mobileConnections, conn)
	}

	cm.mutex.RUnlock()

	// Track connections to remove due to errors
	var mobileToRemove []*websocket.Conn

	// Create the message once
	message := map[string]interface{}{
		"type": "youtube_info",
		"data": videoInfo,
	}

	// Send only to mobile connections
	for _, conn := range mobileConnections {
		if err := conn.WriteJSON(message); err != nil {
			fmt.Printf("[DEBUG] Error broadcasting YouTube info to mobile connection: %v\n", err)
			mobileToRemove = append(mobileToRemove, conn)
		}
	}

	// Remove failed connections (acquire write lock only if needed)
	if len(mobileToRemove) > 0 {
		cm.mutex.Lock()
		for _, conn := range mobileToRemove {
			delete(cm.mobileConnections, conn)
			conn.Close()
		}
		fmt.Printf("[DEBUG] Removed %d failed mobile connections during YouTube broadcast, total mobile: %d\n", len(mobileToRemove), len(cm.mobileConnections))
		cm.mutex.Unlock()
	}
}

// Store the latest YouTube video info in memory
var latestYouTubeVideoInfo *YouTubeVideoInfo = nil
var latestYouTubeVideoInfoTimer *time.Timer = nil

const youtubeInfoTimeout = 10 * time.Minute

var connectionManager = NewConnectionManager()

func main() {
	if runtime.GOOS == "windows" {
		systray.Run(onReady, onExit)
	} else {
		// On non-Windows, use config.json for settings
		configPath := "config.json"
		// If config.json does not exist, create it with defaults
		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			defaultConfig := getDefaultSettings()
			jsonData, err := json.MarshalIndent(defaultConfig, "", "    ")
			if err == nil {
				os.WriteFile(configPath, jsonData, 0644)
				fmt.Printf("[INFO] Created default config.json\n")
			} else {
				fmt.Printf("[ERROR] Could not create config.json: %v\n", err)
			}
		}
		// Load settings from config.json
		serverSettings = loadConfigSettings(configPath)
		// Use port from settings
		serverPort = serverSettings.ServerPort
		startServer()
	}
}

func onReady() {
	systray.SetIcon(iconData)
	systray.SetTitle("Orion")
	systray.SetTooltip("Orion is running")

	mSettings := systray.AddMenuItem("Settings", "Open server settings")
	mQuit := systray.AddMenuItem("Quit", "Exit the app")

	go func() {
		for {
			select {
			case <-mSettings.ClickedCh:
				// Open settings page in default browser
				url := fmt.Sprintf("http://%s:%s/settings/", getCurrentServerHost(), serverPort)
				openURL(url)
			case <-mQuit.ClickedCh:
				systray.Quit()
				os.Exit(0)
			}
		}
	}()

	go startServer()
}

func onExit() {
	// Optional: cleanup code
}

// openURL opens the specified URL in the default browser
func openURL(url string) {
	var cmd string
	var args []string

	switch runtime.GOOS {
	case "windows":
		cmd = "cmd"
		args = []string{"/c", "start", url}
	case "darwin":
		cmd = "open"
		args = []string{url}
	default: // "linux", "freebsd", "openbsd", "netbsd"
		cmd = "xdg-open"
		args = []string{url}
	}

	err := exec.Command(cmd, args...).Start()
	if err != nil {
		fmt.Printf("[ERROR] Failed to open URL %s: %v\n", url, err)
	} else {
		fmt.Printf("[INFO] Opened settings page: %s\n", url)
	}
}

// Handle YouTube video info from PC
func handleYouTubeInfo(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] YouTube info endpoint called - Method: %s\n", r.Method)

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var videoInfo YouTubeVideoInfo
	err := json.NewDecoder(r.Body).Decode(&videoInfo)
	if err != nil {
		fmt.Printf("[DEBUG] YouTube info: Error decoding JSON: %v\n", err)
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	fmt.Printf("[DEBUG] YouTube info: Received video info - Title: '%s', VideoID: '%s', CurrentTime: %d\n",
		videoInfo.Title, videoInfo.VideoID, videoInfo.CurrentTime)

	// Store the latest video info in memory
	latestYouTubeVideoInfo = &videoInfo
	go connectionManager.BroadcastYouTubeInfo(videoInfo)

	// Reset the timeout timer
	if latestYouTubeVideoInfoTimer != nil {
		latestYouTubeVideoInfoTimer.Stop()
	}
	latestYouTubeVideoInfoTimer = time.AfterFunc(youtubeInfoTimeout, func() {
		latestYouTubeVideoInfo = nil
		fmt.Printf("[DEBUG] YouTube info: Cleared due to timeout (no update for %v)\n", youtubeInfoTimeout)
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	fmt.Printf("[DEBUG] YouTube info: Response sent successfully\n")
}

// Handle server settings API endpoint
func handleServerSettings(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Server settings endpoint called - Method: %s\n", r.Method)

	switch r.Method {
	case "GET":
		// Return current settings
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(serverSettings)
		fmt.Printf("[DEBUG] Server settings: Current settings sent\n")

	case "POST":
		// Update settings
		var newSettings ServerSettings
		err := json.NewDecoder(r.Body).Decode(&newSettings)
		if err != nil {
			fmt.Printf("[ERROR] Server settings: Invalid JSON: %v\n", err)
			http.Error(w, "Invalid JSON", http.StatusBadRequest)
			return
		}

		// Validate settings
		if newSettings.ServerPort == "" || newSettings.DataRetention < 0 {
			http.Error(w, "Invalid settings values", http.StatusBadRequest)
			return
		}

		// Update global settings
		serverSettings = newSettings

		// Save to file
		if err := saveSettings(serverSettings); err != nil {
			fmt.Printf("[ERROR] Server settings: Error saving settings: %v\n", err)
			http.Error(w, "Error saving settings", http.StatusInternalServerError)
			return
		}

		fmt.Printf("[DEBUG] Server settings: Settings updated successfully\n")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "Settings updated successfully"})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// Handle server status API endpoint
func handleServerStatus(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Server status endpoint called - Method: %s\n", r.Method)

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Calculate uptime
	uptime := time.Since(serverStartTime)
	uptimeStr := fmt.Sprintf("%dh %dm", int(uptime.Hours()), int(uptime.Minutes())%60)

	// Get connection count
	connectionManager.mutex.RLock()
	totalConnections := len(connectionManager.pcConnections) + len(connectionManager.mobileConnections)
	connectionManager.mutex.RUnlock()

	status := ServerStatus{
		IsOnline:    true,
		Uptime:      uptimeStr,
		Version:     "1.0.0",
		Connections: totalConnections,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
	fmt.Printf("[DEBUG] Server status: Status sent successfully\n")
}

// Handle server settings page
func handleServerSettingsPage(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Server settings page requested - URL: %s\n", r.URL.Path)

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Serve the embedded settings HTML
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(settingsHTML)
}

// Handle clear history endpoint
func handleClearHistory(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Clear history endpoint called - Method: %s\n", r.Method)

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Clear all items from data
	emptyData := FlowData{Items: []Item{}}

	if err := saveFlowData(emptyData); err != nil {
		fmt.Printf("[ERROR] Clear history: Error saving empty data: %v\n", err)
		http.Error(w, "Error clearing history", http.StatusInternalServerError)
		return
	}

	fmt.Printf("[DEBUG] Clear history: History cleared successfully\n")

	// Broadcast update to all WebSocket connections
	connectionManager.BroadcastUpdate()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success", "message": "History cleared successfully"})
	fmt.Printf("[DEBUG] Clear history: Response sent successfully\n")
}

// Handle favicon endpoint
func handleFavicon(w http.ResponseWriter, r *http.Request) {
	fmt.Printf("[DEBUG] Favicon requested - Method: %s\n", r.Method)

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Serve the embedded icon
	w.Header().Set("Content-Type", "image/x-icon")
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 24 hours
	w.WriteHeader(http.StatusOK)
	w.Write(iconData)
	fmt.Printf("[DEBUG] Favicon served successfully\n")
}
