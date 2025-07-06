package main

import (
	"fmt"
	"net"
	"net/http"
	"strings"
)

func main() {
	http.HandleFunc("/", HandleMain)
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
