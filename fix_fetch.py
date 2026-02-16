with open('frontend/src/api/client.js', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace(
    "await fetch${API_BASE}, { ...options, headers })",
    "await fetch(${API_BASE}, { ...options, headers })"
)
with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed fetch call")
