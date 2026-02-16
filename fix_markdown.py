with open('frontend/src/pages/Search.jsx', 'r', encoding='utf-8') as f:
    c = f.read()

# Add import
c = c.replace(
    "import { Search as SearchIcon, Sparkles, FileText, Clock } from 'lucide-react'",
    "import { Search as SearchIcon, Sparkles, FileText, Clock } from 'lucide-react'\nimport ReactMarkdown from 'react-markdown'"
)

# Replace raw text with ReactMarkdown
c = c.replace(
    '<div className="summary-text">{summary.summary}</div>',
    '<div className="summary-text"><ReactMarkdown>{summary.summary}</ReactMarkdown></div>'
)

with open('frontend/src/pages/Search.jsx', 'w', encoding='utf-8') as f:
    f.write(c)
print("Updated Search.jsx with ReactMarkdown")
