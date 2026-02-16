with open('backend/app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# Add cache-control middleware after CORS middleware
old = '''app.add_middleware(
    CORSMiddleware,'''
new = '''# Prevent Cloudflare from caching API responses
@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    return response

app.add_middleware(
    CORSMiddleware,'''
c = c.replace(old, new)

with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)
print("Added no-cache headers for API routes")
