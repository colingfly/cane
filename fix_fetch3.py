with open('frontend/src/api/client.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()
bt = chr(96)
for i, line in enumerate(lines):
    if 'await fetch' in line and 'API_BASE' in line:
        lines[i] = '  const res = await fetch(' + bt + '' + bt + ', { ...options, headers })\n'
        print('Fixed line', i+1)
        break
with open('frontend/src/api/client.js', 'w', encoding='utf-8') as f:
    f.writelines(lines)
