with open('backend/app.py', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('    user: User = Depends(require_user),', '    user: User = Depends(get_current_user),')
with open('backend/app.py', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed")
