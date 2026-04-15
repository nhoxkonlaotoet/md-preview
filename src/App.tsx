import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { 
  FolderOpen, FileText, LayoutTemplate, RefreshCw, 
  ToggleLeft, ToggleRight, List, FolderTree, ChevronRight, ChevronDown, Folder as FolderIcon, GitBranch 
} from 'lucide-react';
import { resolvePath } from './utils/path';
import './App.css';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    darkMode: true,
    background: '#111318',
    primaryColor: '#6366f1',
    primaryTextColor: '#e0e0e0',
    primaryBorderColor: '#4f46e5',
    lineColor: '#6366f1',
    secondaryColor: '#1e1e2e',
    tertiaryColor: '#2a2a3e',
  },
});

interface FileNode {
  path: string;
  name: string;
  content?: string;
  url?: string;
  type: 'md' | 'mmd' | 'image' | 'other';
  handle?: any; // FileSystemFileHandle if available
}

interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  file?: FileNode;
  children?: TreeNode[];
}

const FileIcon = ({ type }: { type: string }) => {
  if (type === 'mmd') return <GitBranch className="file-icon mmd-icon" size={16} />;
  return <FileText className="file-icon" size={16} />;
};

const MermaidPreview = ({ content }: { content: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const id = `mermaid-${Date.now()}`;
        const { svg: renderedSvg } = await mermaid.render(id, content);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to render Mermaid diagram');
          setSvg('');
        }
        // Clean up any leftover error container mermaid might create
        const errEl = document.getElementById('d' + 'mermaid-error');
        if (errEl) errEl.remove();
      }
    };
    render();
    return () => { cancelled = true; };
  }, [content]);

  if (error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-title">⚠️ Mermaid Syntax Error</div>
        <pre className="mermaid-error-detail">{error}</pre>
        <pre className="mermaid-source">{content}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-preview"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

const TreeNodeItem = ({ node, level, selectedFile, onSelect }: { node: TreeNode, level: number, selectedFile: FileNode | null, onSelect: (file: FileNode) => void }) => {
  const [expanded, setExpanded] = useState(true);
  
  if (node.type === 'file') {
    return (
      <div 
        className={`file-item ${selectedFile?.path === node.file?.path ? 'active' : ''}`}
        style={{ paddingLeft: `${(level * 16) + 12}px` }}
        onClick={() => node.file && onSelect(node.file)}
        title={node.path}
      >
        <FileIcon type={node.file?.type || 'md'} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
    );
  }

  return (
    <div>
      <div 
        className="file-item"
        style={{ paddingLeft: `${(level * 16) + 8}px`, color: 'var(--text-primary)', fontWeight: 500 }}
        onClick={() => setExpanded(!expanded)}
        title={node.path}
      >
        {expanded ? <ChevronDown size={16} className="file-icon" /> : <ChevronRight size={16} className="file-icon" />}
        <FolderIcon size={16} style={{ color: 'var(--accent-color)', opacity: 0.9, flexShrink: 0, marginRight: '4px' }} fill="currentColor" fillOpacity={0.2} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
      {expanded && node.children?.map(child => (
        <TreeNodeItem 
          key={child.path} 
          node={child} 
          level={level + 1} 
          selectedFile={selectedFile}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};

function App() {
  const [files, setFiles] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('tree');
  
  // Storage for File System Access API
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState<boolean>(false);

  // We keep the input fallback just in case
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewableFiles = useMemo(() => files.filter(f => f.type === 'md' || f.type === 'mmd'), [files]);
  
  // Build Tree Structure
  const fileTree = useMemo(() => {
    const root: TreeNode[] = [];
    
    previewableFiles.forEach(file => {
      const parts = file.path.split('/');
      let currentLevel = root;
      let currentPath = '';

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;

        let existingNode = currentLevel.find(n => n.name === part && n.type === (isFile ? 'file' : 'folder'));

        if (!existingNode) {
          existingNode = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'folder',
            file: isFile ? file : undefined,
            children: isFile ? undefined : []
          };
          currentLevel.push(existingNode);
        }

        if (!isFile) {
          currentLevel = existingNode.children!;
        }
      });
    });
    
    return root;
  }, [previewableFiles]);

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
        } else if (lowerName.endsWith('.mmd')) {
          const text = await file.text();
          newFiles.push({ path, name: entry.name, content: text, type: 'mmd', handle: fileHandle });
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
      return newFiles.find(f => f.type === 'md' || f.type === 'mmd') || null;
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
      } else if (lowerName.endsWith('.mmd')) {
        const text = await file.text();
        newFiles.push({ path, name: file.name, content: text, type: 'mmd', handle: { getFile: async () => fileRefs[path] } });
      } else if (lowerName.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        const url = URL.createObjectURL(file);
        newFiles.push({ path, name: file.name, url, type: 'image' });
      }
    });

    await Promise.all(promises);

    newFiles.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(newFiles);

    const firstPreviewable = newFiles.find(f => f.type === 'md' || f.type === 'mmd');
    setSelectedFile(firstPreviewable || null);
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
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px', borderBottom: '1px solid var(--border-color)', marginBottom: '4px' }}>
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
        
        {/* View Mode Toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 16px', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 600 }}>Files</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => setViewMode('tree')}
              style={{ background: viewMode === 'tree' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'tree' ? 'var(--accent-color)' : 'var(--text-tertiary)', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}
              title="Tree View"
            >
              <FolderTree size={16} />
            </button>
            <button
              onClick={() => setViewMode('flat')}
              style={{ background: viewMode === 'flat' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'flat' ? 'var(--accent-color)' : 'var(--text-tertiary)', border: 'none', padding: '4px', borderRadius: '4px', cursor: 'pointer' }}
              title="Flat List View"
            >
              <List size={16} />
            </button>
          </div>
        </div>

        <div className="file-tree-container" style={{ padding: '8px' }}>
          {viewMode === 'tree' ? (
             fileTree.map(node => (
               <TreeNodeItem 
                 key={node.path} 
                 node={node} 
                 level={0} 
                 selectedFile={selectedFile} 
                 onSelect={setSelectedFile} 
               />
             ))
          ) : (
            previewableFiles.map(file => (
              <div
                key={file.path}
                className={`file-item ${selectedFile?.path === file.path ? 'active' : ''}`}
                onClick={() => setSelectedFile(file)}
                title={file.path}
              >
                <FileIcon type={file.type} />
                <div style={{ display: 'flex', flexDirection: 'column', width: '100%', overflow: 'hidden' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                  <span style={{ fontSize: '11px', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.path.split('/').slice(0, -1).join('/') || '/'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      <main className="main-content">
        {selectedFile ? (
          <>
            <div className="top-bar">
              <span className="top-bar-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedFile.type === 'mmd' ? <GitBranch size={18} /> : <FileText size={18} />}
                  {selectedFile.path}
                  {selectedFile.type === 'mmd' && (
                    <span className="file-type-badge mmd-badge">MERMAID</span>
                  )}
                </span>

                {isAutoRefresh && (
                  <span style={{ fontSize: '11px', background: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '4px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RefreshCw size={12} className="spin-anim" /> Live
                  </span>
                )}
              </span>
            </div>
            <div className="preview-container">
              {selectedFile.type === 'mmd' ? (
                <div className="mermaid-body">
                  <MermaidPreview content={selectedFile.content || ''} />
                </div>
              ) : (
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={components}
                  >
                    {selectedFile.content || ''}
                  </ReactMarkdown>
                </div>
              )}
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
