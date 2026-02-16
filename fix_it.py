c=open('frontend/src/api/client.js','r',encoding='utf-8').read()
bt=chr(96)
old='await fetch'+bt
new='await fetch('+bt
c=c.replace(old,new)
old2='headers })'
new2='headers }))'
c=c.replace(old2,new2,1)
open('frontend/src/api/client.js','w',encoding='utf-8').write(c)
print('done')
