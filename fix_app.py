import sys

p = 'backend/app.py'
c = open(p, encoding='utf-8').read()

# Fix duplicate: remove second copy of admin_update_tenant
first = c.find('def admin_update_tenant(')
second = c.find('def admin_update_tenant(', first + 1)
if second > 0:
    # Find the decorator before the second copy
    dec_pos = c.rfind('@app.put', 0, second)
    if dec_pos > first:
        c = c[:dec_pos].rstrip() + '\n'
        print(f"Removed duplicate endpoints starting at position {dec_pos}")
    else:
        c = c[:second - 1].rstrip() + '\n'
        print(f"Removed duplicate from position {second}")
else:
    print("No duplicate found")

# Fix user ID in tenant detail response
old = '{"email": u.email, "name": u.name, "role": u.role,'
new = '{"id": u.id, "email": u.email, "name": u.name, "role": u.role,'
if old in c:
    c = c.replace(old, new)
    print("Added user ID to tenant detail response")
else:
    print("User ID pattern not found (may already be fixed)")

open(p, 'w', encoding='utf-8').write(c)
print("Done")
