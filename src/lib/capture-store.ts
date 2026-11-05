// In-memory capture storage for operator monitoring
// Stores latest camera + screen frames per exam session

interface Capture {
  sessionId: string
  mahasiswaId: string
  mahasiswaName: string
  ujianTitle: string
  cameraFrame: string  // base64 JPEG
  screenFrame: string  // base64 JPEG
  timestamp: number
}

// Global map: sessionId -> Capture
const captureMap = new Map<string, Capture>()

// Clean up captures older than 60 seconds (session ended)
const CLEANUP_INTERVAL = 60000
setInterval(() => {
  const now = Date.now()
  for (const [key, cap] of captureMap.entries()) {
    if (now - cap.timestamp > CLEANUP_INTERVAL) {
      captureMap.delete(key)
    }
  }
}, 30000)

export function setCapture(data: Capture) {
  captureMap.set(data.sessionId, data)
}

export function getCapture(sessionId: string): Capture | null {
  return captureMap.get(sessionId) || null
}

export function getAllCaptures(): Capture[] {
  return Array.from(captureMap.values()).sort((a, b) => b.timestamp - a.timestamp)
}

export function deleteCapture(sessionId: string) {
  captureMap.delete(sessionId)
}
