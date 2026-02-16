lines=open('frontend/src/api/client.js','r',encoding='utf-8').readlines()
bt=chr(96)
d=chr(36)
for i,line in enumerate(lines):
    if 'await fetch' in line:
        lines[i]='  const res = await fetch('+bt+d+'{API_BASE}'+d+'{path}'+bt+', { ...options, headers })\n'
        print('fixed line',i+1,repr(lines[i]))
        break
open('frontend/src/api/client.js','w',encoding='utf-8').writelines(lines)
print('saved')
