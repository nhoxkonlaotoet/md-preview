import React, { useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FolderOpen, FileText, LayoutTemplate } from 'lucide-react';
import { resolvePath } from './utils/path';
import './App.css';

interface FileNode {
  path: string;
  name: string;
  content?: string;
  url?: string;
  type: 'md' | 'image' | 'other';
}

function App() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const markdownFiles = useMemo(() => files.filter(f => f.type === 'md'), [files]);
  
  // Map of path to ObjectURL for images
  const assetMap = useMemo(() => {
    const map = new Map<string, string>();
    files.forEach(f => {
      if (f.url && f.path) {
        map.set(f.path, f.url);
      }
    });
    return map;
  }, [files]);

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    // Clean up previous URLs
    files.forEach(f => {
      if (f.url) URL.revokeObjectURL(f.url);
    });

    const newFiles: FileNode[] = [];
    
    // We only read text for MD files, and create Object URLs for images
    const promises = Array.from(fileList).map(async (file) => {
      const path = file.webkitRelativePath || file.name;
      const lowerName = file.name.toLowerCase();
      
      if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
        const text = await file.text();
        newFiles.push({ path, name: file.name, content: text, type: 'md' });
      } else if (
        lowerName.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)
      ) {
        const url = URL.createObjectURL(file);
        newFiles.push({ path, name: file.name, url, type: 'image' });
      }
    });

    await Promise.all(promises);

    newFiles.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(newFiles);
    
    const firstMd = newFiles.find(f => f.type === 'md');
    setSelectedFile(firstMd || null);
  };

  const components = {
    // Custom renderer for images that resolves relative paths client-side
    img: ({ node, ...props }: any) => {
       if (!selectedFile) return <img {...props} />;
       
       const src = props.src;
       if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
         return <img {...props} />;
       }

       // Resolve local paths relative to the current markdown file's path
       const resolvedPath = resolvePath(selectedFile.path, src);
       const assetUrl = assetMap.get(resolvedPath);

       return <img {...props} src={assetUrl || src} alt={props.alt || ''} title={props.title || resolvedPath} />;
    }
  };

  return (
    <div className="app-container">
      {/* Hidden folder input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFolderSelect}
        style={{ display: 'none' }}
        {...{ webkitdirectory: "", directory: "" } as any}
        multiple
      />

      <aside className="sidebar">
        <div className="sidebar-header">
          <LayoutTemplate className="logo-icon" size={24} />
          <span className="sidebar-header-title">MD Preview</span>
        </div>

        <button 
          className="open-folder-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <FolderOpen size={18} />
          Open Folder
        </button>

        <div className="file-tree-container">
          {markdownFiles.map(file => (
            <div 
              key={file.path} 
              className={`file-item ${selectedFile?.path === file.path ? 'active' : ''}`}
              onClick={() => setSelectedFile(file)}
              title={file.path}
            >
              <FileText className="file-icon" size={16} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{file.name}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>{file.path.split('/').slice(0, -1).join('/') || '/'}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="main-content">
        {selectedFile ? (
          <>
            <div className="top-bar">
              <span className="top-bar-title">
                <FileText size={18} />
                {selectedFile.path}
              </span>
            </div>
            <div className="preview-container">
              <div className="markdown-body">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={components}
                >
                  {selectedFile.content || ''}
                </ReactMarkdown>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <LayoutTemplate className="empty-state-icon" />
            <h3>No Markdown File Selected</h3>
            <p style={{ fontSize: '14px' }}>Click "Open Folder" to browse your local markdown files.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
