"""Small static server for the database-free prototype."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
PUBLIC = Path(__file__).resolve().parent / "public"
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(PUBLIC),**kwargs)
    def end_headers(self):
        self.send_header("X-Content-Type-Options","nosniff"); self.send_header("X-Frame-Options","DENY"); self.send_header("Referrer-Policy","same-origin"); self.send_header("Cache-Control","no-cache"); super().end_headers()
    def do_GET(self):
        path=self.path.split("?",1)[0]; target=PUBLIC/path.lstrip("/")
        if path=="/" or (not target.exists() and "." not in Path(path).name): self.path="/index.html"
        return super().do_GET()
if __name__=="__main__":
    host=os.environ.get("UFH_HOST","127.0.0.1"); port=int(os.environ.get("UFH_PORT","4173")); print(f"UFH Maintenance prototype running at http://{host}:{port}"); ThreadingHTTPServer((host,port),Handler).serve_forever()
