# Fix 1: Remove tenant name from sidebar
with open('frontend/src/components/Layout.jsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace("""          <div className="tenant-name">{tenant?.name}</div>""", '')
with open('frontend/src/components/Layout.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed Layout.jsx - removed tenant name from sidebar")

# Fix 2: Remove tenant name from Settings subtitle
with open('frontend/src/pages/Settings.jsx', 'r', encoding='utf-8') as f:
    c = f.read()
c = c.replace('<p>{tenant?.name}</p>', '')
with open('frontend/src/pages/Settings.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed Settings.jsx - removed tenant subtitle")

# Fix 3: Documents.jsx - fetch workspaces if empty
with open('frontend/src/pages/Documents.jsx', 'r', encoding='utf-8') as f:
    c = f.read()
# Add a useEffect to load workspaces from API if auth context has none
old = """  useEffect(() => {
    loadDocs()
  }, [activeWs])"""
new = """  useEffect(() => {
    loadDocs()
  }, [activeWs])

  // Fetch workspaces if auth context has none
  useEffect(() => {
    if (workspaces.length === 0) {
      getWorkspaces().then(data => {
        updateWorkspaces(data.workspaces || [])
      }).catch(console.error)
    }
  }, [])"""
c = c.replace(old, new)
with open('frontend/src/pages/Documents.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed Documents.jsx - fetches workspaces if empty")
