package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var (
	serverPort = "8000" // Default port, can be changed if needed
)

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
	// Find an available port
	availablePort := findAvailablePort(serverPort)
	if availablePort != serverPort {
		fmt.Printf("[INFO] Port %s is busy, using port %s instead\n", serverPort, availablePort)
		serverPort = availablePort
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

	fmt.Printf("[INFO] Server starting on http://%s:%s\n", getLocalIP(), serverPort)

	// Start the server
	if err := http.ListenAndServe(getLocalIP()+":"+serverPort, nil); err != nil {
		fmt.Printf("[ERROR] Server failed to start on port %s: %v\n", serverPort, err)
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

// CORS middleware function
func corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all requests
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

// Flow data structure
type FlowData struct {
	Items []Item `json:"items"`
}

const dataFile = "memory/data.json"
const uploadsDir = "memory/uploads"

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
	go connectionManager.BroadcastUpdate()

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
	go connectionManager.BroadcastUpdate()

	// Generate file URL using the unique filename
	fileURL := fmt.Sprintf("http://%s:%s/uploads/%s", getLocalIP(), serverPort, uniqueFilename)
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
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	// Load latest data
	data := loadData()

	// Broadcast to all connections (both PC and mobile)
	allConnections := make([]*websocket.Conn, 0, len(cm.pcConnections)+len(cm.mobileConnections))
	for conn := range cm.pcConnections {
		allConnections = append(allConnections, conn)
	}
	for conn := range cm.mobileConnections {
		allConnections = append(allConnections, conn)
	}

	for _, conn := range allConnections {
		err := conn.WriteJSON(map[string]interface{}{
			"type": "update",
			"data": data,
		})
		if err != nil {
			fmt.Printf("Error broadcasting to connection: %v", err)
		}
	}
}

// Broadcast YouTube video info to mobile connections only
func (cm *ConnectionManager) BroadcastYouTubeInfo(videoInfo YouTubeVideoInfo) {
	cm.mutex.RLock()
	defer cm.mutex.RUnlock()

	// Send only to mobile connections
	for conn := range cm.mobileConnections {
		if err := conn.WriteJSON(map[string]interface{}{
			"type": "youtube_info",
			"data": videoInfo,
		}); err != nil {
			fmt.Printf("Error broadcasting YouTube info to mobile connection: %v", err)
		}
	}

	fmt.Printf("[DEBUG] ConnectionManager: Broadcasted YouTube info to %d mobile connections\n", len(cm.mobileConnections))
}

var connectionManager = NewConnectionManager()

func main() {
	startServer()
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

	// Broadcast YouTube video info to mobile connections only
	go connectionManager.BroadcastYouTubeInfo(videoInfo)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
	fmt.Printf("[DEBUG] YouTube info: Response sent successfully\n")
}
