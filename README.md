# 🌟 Orion - Cross-Device Message & File Sharing

Orion is a sleek, real-time communication bridge between your PC and mobile devices. Share messages, files, and YouTube video timestamps instantly across your devices with a beautiful, modern interface.

![Orion Logo](icon.png)

## ✨ Features

- **💬 Real-time Messaging**: Instant message synchronization between PC and mobile
- **📁 File Sharing**: Drag & drop files from PC to mobile and vice versa
- **🎥 YouTube Integration**: Share video timestamps directly from your browser
- **📱 Mobile Web Interface**: Access Orion from any mobile browser
- **🔄 Live Updates**: WebSocket-powered real-time synchronization
- **🛡️ Local Network**: All data stays on your local network for privacy
- **🎨 Beautiful UI**: Modern, dark-themed interface with smooth animations

## 🚀 Quick Start

### 1. Download & Setup

1. Download the latest Orion release
2. Extract to your desired folder (e.g., `C:\Projects\Orion\`)
3. Run `orion.exe` (Windows) or `go run main.go` (other platforms)

### 2. Install Browser Extension

#### Chrome/Edge:
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select the `chrome-extension` folder
4. Click the Orion extension icon in your toolbar

#### Firefox:
1. Open Firefox and go to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Navigate to `firefox-extension` folder and select `manifest.json`
4. Click the Orion extension icon in your toolbar

### 3. Connect Your Mobile Device

1. Open the Orion sidebar in your browser
2. Scan the QR code with your mobile device, or
3. Manually visit the displayed URL on your mobile browser

## 📖 How to Use

### 💻 PC Browser Extension

**Open Sidebar**: Click the Orion extension icon in your browser toolbar

**Send Messages**: 
- Type in the input field at the bottom
- Press Enter or click send

**Share Files**:
- Click the 📎 attachment button
- Select your file
- File will appear on all connected devices

**YouTube Integration**:
- While watching YouTube, your current video and timestamp automatically sync to mobile
- You can continue watching from your exact position

### 📱 Mobile Interface

**Access**: Scan QR code or visit the URL shown in the PC sidebar

**Send Messages**: Type and send messages that appear instantly on PC

**Download Files**: Tap any shared file to download it to your device

**YouTube Videos**: Tap shared YouTube videos to open them at the exact timestamp

## ⚙️ Configuration

### Server Settings

Access settings at: `http://[your-ip]:8000/settings/`

**Available Options**:
- **Server Host**: Set custom IP address (auto-detects by default)
- **Server Port**: Change port (default: 8000)
- **Data Retention**: How long to keep message history (default: 30 days, set to 0 for never deleting)

### Extension Settings

Right-click the extension icon → Options

**Available Options**:
- **Server Host**: Your PC's IP address
- **Server Port**: Match your server port
- **Resizable Sidebar**: Enable/disable sidebar resizing

### Network Access

**Local Network**: Orion works on your local network (WiFi/Ethernet)
- PC and mobile must be on the same network
- Automatically detects your IP address
- No internet connection required for basic functionality

**Firewall**: Ensure port 8000 (or your custom port) is open for local network access


## 🛠️ Troubleshooting

### Connection Issues

**Can't connect to server:**
1. Check if Orion.exe is running
2. Verify both devices are on the same network
3. Check firewall settings for port 8000
4. Try accessing `http://[pc-ip]:8000` directly

**Extension not working:**
1. Refresh the page
2. Check extension permissions
3. Ensure server URL is correct in extension settings

**Mobile can't access:**
1. Verify the QR code URL is accessible
2. Try typing the IP address manually
3. Check mobile device's WiFi connection

### Performance Issues

**Slow message delivery:**
1. Check network connection quality
2. Restart Orion server
3. Clear browser cache and reload extension

**Files not uploading:**
1. Check file size (10MB limit)
2. Ensure sufficient disk space
3. Verify uploads folder permissions

## 🔒 Privacy & Security

- **Local Only**: All data stays on your local network
- **No Cloud**: No data sent to external servers
- **File Storage**: Files stored locally in `memory/uploads/`
- **Data Retention**: Automatically cleans old messages based on settings
- **No Tracking**: No analytics or tracking

## 🏗️ Technical Details

**Built With**:
- **Backend**: Go with Gorilla WebSocket
- **Frontend**: Vanilla JavaScript
- **Extensions**: Chrome/Firefox APIs
- **Mobile**: Progressive Web App

**Architecture**:
- Real-time WebSocket connections
- RESTful API endpoints
- Cross-platform compatibility
- Local file storage system

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

If you encounter any issues or have questions:

1. Check the troubleshooting section above
2. Look for error messages in the browser console
3. Check the Orion server logs
4. Create an issue on GitHub with detailed information

## 🎉 Enjoy Orion!

Orion makes cross-device communication effortless and beautiful. Whether you're sharing a quick message, transferring important files, or coordinating YouTube viewing sessions, Orion keeps your devices perfectly in sync.

---
