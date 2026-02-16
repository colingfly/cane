with open('frontend/src/pages/Documents.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix 1: Convert files to Array in initiateUpload so they survive input reset
c = c.replace(
    '''  function initiateUpload(files) {
    if (!files?.length) return''',
    '''  function initiateUpload(rawFiles) {
    const files = Array.from(rawFiles)
    if (!files.length) return'''
)

# Fix 2: Remove "All" tab
c = c.replace(
    """          <button
            className=workspace-tab }
            onClick={() => setActiveWs('')}
          >
            All
          </button>""",
    ''
)

with open('frontend/src/pages/Documents.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed click upload and removed All tab")
