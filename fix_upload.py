with open('frontend/src/pages/Documents.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix 1: Convert FileList to Array so it survives re-renders
c = c.replace(
    'if (!files?.length || !wsId) return',
    'const fileArray = Array.from(files)\n    if (!fileArray.length || !wsId) return'
)
c = c.replace('for (const file of files)', 'for (const file of fileArray)')

# Fix 2: Fix tagged template literals (missing opening parens)
c = c.replace("setUploadStatusUploading", "setUploadStatus(Uploading")
c = c.replace("setUploadStatusError", "setUploadStatus(Error")
c = c.replace("setUploadStatus${successCount}", "setUploadStatus(${successCount}")

with open('frontend/src/pages/Documents.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Fixed multi-file upload")
