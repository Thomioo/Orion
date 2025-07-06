package main

import "net/http"

func HandleMain(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	htmlContent := "<html><body><h1>Hello from HandleMain</h1></body></html>"
	w.Write([]byte(htmlContent))
}
