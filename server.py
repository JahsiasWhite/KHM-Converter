import http.server
import socketserver
import mimetypes

# Explicitly add JavaScript MIME type (some systems may not recognize it)
mimetypes.add_type("application/javascript", ".js")

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force correct MIME type for JS files
        if self.path.endswith(".js"):
            self.send_header("Content-Type", "application/javascript")
        super().end_headers()

PORT = 8000

with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
