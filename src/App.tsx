import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FolderOpen, FileText, LayoutTemplate, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
import { resolvePath } from './utils/path';
import './App.css';

interface FileNode {
  path: string;
  name: string;
  content?: string;
  url?: string;
  type: 'md' | 'image' | 'other';
  handle?: any; // FileSystemFileHandle if available
}

function App() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  
  // Storage for File System Access API
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);
  
  // We keep the input fallback just in case
  const fileInputRef = useRef<HTMLInputElement>(null);

  const markdownFiles = useMemo(() => files.filter(f => f.type === 'md'), [files]);
  
  const assetMap = useMemo(() => {
    const map = new Map<string, string>();
    files.forEach(f => {
      if (f.url && f.path) {
        map.set(f.path, f.url);
      }
    });
    return map;
  }, [files]);

  // Recursively read a directory handle (Modern File System API)
  const scanDirectoryHandle = async (dirHandle: any, currentPath = ''): Promise<FileNode[]> => {
    const newFiles: FileNode[] = [];
    for await (const entry of dirHandle.values()) {
      const path = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      const lowerName = entry.name.toLowerCase();
      
      if (entry.kind === 'file') {
        const fileHandle = entry;
        const file = await fileHandle.getFile();
        
        if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
          const text = await file.text();
          newFiles.push({ path, name: entry.name, content: text, type: 'md', handle: fileHandle });
        } else if (lowerName.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
          const url = URL.createObjectURL(file);
          newFiles.push({ path, name: entry.name, url, type: 'image', handle: fileHandle });
        }
      } else if (entry.kind === 'directory') {
        const subFiles = await scanDirectoryHandle(entry, path);
        newFiles.push(...subFiles);
      }
    }
    return newFiles;
  };

  const loadFromDirHandle = async (handle: any) => {
    // Clean up previous URLs
    files.forEach(f => {
      if (f.url) URL.revokeObjectURL(f.url);
    });

    const newFiles = await scanDirectoryHandle(handle);
    newFiles.sort((a, b) => a.path.localeCompare(b.path));
    
    setFiles(newFiles);
    
    // Restore selected file OR auto-select first
    setSelectedFile(prev => {
      if (prev) {
        const matching = newFiles.find(f => f.path === prev.path);
        if (matching) return matching;
      }
      return newFiles.find(f => f.type === 'md') || null;
    });
  };

  // Modern browser API
  const handleOpenFolderNative = async () => {
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker();
        setDirHandle(handle);
        await loadFromDirHandle(handle);
      } catch (err) {
        console.log("Directory picker cancelled or failed", err);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleManualRefresh = async () => {
    if (dirHandle) {
      await loadFromDirHandle(dirHandle);
    } else if (selectedFile && selectedFile.handle) {
      // Re-read selected file if we only have file handles
      const file = await selectedFile.handle.getFile();
      const text = await file.text();
      setSelectedFile({ ...selectedFile, content: text });
    }
  };

  const handleFolderSelectFallback = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    files.forEach(f => {
      if (f.url) URL.revokeObjectURL(f.url);
    });

    const newFiles: FileNode[] = [];
    const fileRefs: Record<string, File> = {}; // for manual re-reads if needed
    
    const promises = Array.from(fileList).map(async (file) => {
      const path = file.webkitRelativePath || file.name;
      const lowerName = file.name.toLowerCase();
      fileRefs[path] = file;
      
      if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown')) {
        const text = await file.text();
        // Pack the raw File as a pseudo-handle for fallback refresh
        newFiles.push({ path, name: file.name, content: text, type: 'md', handle: { getFile: async () => fileRefs[path] } });
      } else if (lowerName.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        const url = URL.createObjectURL(file);
        newFiles.push({ path, name: file.name, url, type: 'image' });
      }
    });

    await Promise.all(promises);

    newFiles.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(newFiles);
    
    const firstMd = newFiles.find(f => f.type === 'md');
    setSelectedFile(firstMd || null);
    setDirHandle(null); // Explicitly denote we aren't using dir handle
  };

  // Auto Refresh Hook
  useEffect(() => {
    if (!isAutoRefresh) return;
    
    const interval = setInterval(() => {
      handleManualRefresh();
    }, 2000); // 2 second interval

    return () => clearInterval(interval);
  }, [isAutoRefresh, dirHandle, selectedFile, files]);

  const components = {
    img: ({ node, ...props }: any) => {
       if (!selectedFile) return <img {...props} />;
       
       const src = props.src;
       if (!src || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
         return <img {...props} />;
       }

       const resolvedPath = resolvePath(selectedFile.path, src);
       const assetUrl = assetMap.get(resolvedPath);

       return <img {...props} src={assetUrl || src} alt={props.alt || ''} title={props.title || resolvedPath} />;
    }
  };

  return (
    <div className="app-container">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFolderSelectFallback}
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
          onClick={handleOpenFolderNative}
          style={{ marginBottom: '8px' }}
        >
          <FolderOpen size={18} />
          Open Folder
        </button>

        {/* Toolbar for Refresh */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: '8px' }}>
            <button 
                onClick={handleManualRefresh}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                title="Refresh Files"
                disabled={!selectedFile && !dirHandle}
            >
                <RefreshCw size={14} /> Refresh
            </button>
            <button 
                onClick={() => setIsAutoRefresh(!isAutoRefresh)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', color: isAutoRefresh ? 'var(--accent-color)' : 'var(--text-secondary)', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                title="Auto Refresh (2s)"
                disabled={!selectedFile && !dirHandle}
            >
                {isAutoRefresh ? <ToggleRight size={16} /> : <ToggleLeft size={16} />} Auto
            </button>
        </div>

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
              <span className="top-bar-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={18} />
                  {selectedFile.path}
                </span>
                
                {isAutoRefresh && (
                  <span style={{ fontSize: '11px', background: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '4px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={12} className="spin-anim" /> Live
                  </span>
                )}
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
