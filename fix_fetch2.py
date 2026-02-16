with open('frontend/src/api/client.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'await fetch' in line and 'API_BASE' in line:
        lines[i] = '  const res = await fetch(' + '${API_BASE}' + ', { ...options, headers })\n'
        print(f"Fixed line {i+1}: {lines[i].strip()}")
        break

with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
