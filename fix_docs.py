with open('frontend/src/pages/Documents.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Change default activeWs from empty to first workspace
c = c.replace(
    "const [activeWs, setActiveWs] = useState('')",
    "const [activeWs, setActiveWs] = useState(null)"
)

# Auto-select first workspace on load
old = """  // Fetch workspaces if auth context has none
  useEffect(() => {
    if (workspaces.length === 0) {
      getWorkspaces().then(data => {
        updateWorkspaces(data.workspaces || [])
      }).catch(console.error)
    }
  }, [])"""
new = """  // Fetch workspaces if auth context has none
  useEffect(() => {
    if (workspaces.length === 0) {
      getWorkspaces().then(data => {
        const ws = data.workspaces || []
        updateWorkspaces(ws)
        if (!activeWs && ws.length > 0) setActiveWs(ws[0].id)
      }).catch(console.error)
    } else if (!activeWs && workspaces.length > 0) {
      setActiveWs(workspaces[0].id)
    }
  }, [workspaces])"""
c = c.replace(old, new)

# Remove the "All" tab button
old = """          <button
            className={workspace-tab }
            onClick={() => setActiveWs('')}
          >
            All
          </button>"""
c = c.replace(old, '')

with open('frontend/src/pages/Documents.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed Documents.jsx - removed All tab, defaults to first workspace")
