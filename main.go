package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
)

func main() {
	http.HandleFunc("/", HandleMain)
	http.HandleFunc("/conversation", handleConversation)
	http.HandleFunc("/message", handleMessage)
	http.HandleFunc("/file", handleFile)
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
func enableCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

// Message structure for conversation
type Message struct {
	Text    string `json:"text"`
	FileURL string `json:"fileUrl,omitempty"`
}

// Global conversation history
var conversationHistory []Message

// Handle conversation endpoint
func handleConversation(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(conversationHistory)
}

// Handle message endpoint
func handleMessage(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var msg Message
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Add message to conversation history
	conversationHistory = append(conversationHistory, msg)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "success"})
}

// Handle file endpoint
func handleFile(w http.ResponseWriter, r *http.Request) {
	enableCORS(w)

	// Handle preflight requests
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse the multipart form
	err := r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		http.Error(w, "Unable to parse form", http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Unable to get file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	// For now, just return a mock URL - you can implement actual file storage later
	fileURL := fmt.Sprintf("http://%s:8000/uploads/%s", getLocalIP(), header.Filename)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"url": fileURL})
}
