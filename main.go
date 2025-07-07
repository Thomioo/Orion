package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

func main() {
	http.HandleFunc("/", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		textContent := "All Good"
		w.Write([]byte(textContent))
	}))

	// PC endpoints
	http.HandleFunc("/pc/items", corsMiddleware(handlePCItems))
	http.HandleFunc("/pc/message", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleMessage(w, r, "PC")
	}))
	http.HandleFunc("/pc/file", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleFile(w, r, "PC")
	}))

	// Mobile endpoints
	http.HandleFunc("/mobile/items", corsMiddleware(handleMobileItems))
	http.HandleFunc("/mobile/message", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleMessage(w, r, "phone")
	}))
	http.HandleFunc("/mobile/file", corsMiddleware(func(w http.ResponseWriter, r *http.Request) {
		handleFile(w, r, "phone")
	}))

	fmt.Println("Server is running at http://" + getLocalIP() + ":8000")
	http.ListenAndServe(getLocalIP()+":8000", nil)
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

// Flow data structure
type FlowData struct {
	Items []Item `json:"items"`
}

const dataFile = "memory/data.json"

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

	// Create new item
	item := Item{
		ID:        generateID(),
		Timestamp: time.Now(),
		From:      from,
		Type:      "file",
		Content:   header.Filename,
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

	// For now, just return a mock URL - you can implement actual file storage later
	fileURL := fmt.Sprintf("http://%s:8000/uploads/%s", getLocalIP(), header.Filename)
	fmt.Printf("[DEBUG] File: Generated mock URL: %s\n", fileURL)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"id":     item.ID,
		"url":    fileURL,
	})
	fmt.Printf("[DEBUG] File: Response sent successfully\n")
}
