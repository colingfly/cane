with open('backend/app.py', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('@app.put("/api/auth/password")', '@app.post("/api/auth/password")')
with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)

with open('frontend/src/api/client.js', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("method: 'PUT', body: form", "method: 'POST', body: form")
with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Switched to POST")
