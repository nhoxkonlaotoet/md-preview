import React, { useState, useRef, useMemo, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { 
  FolderOpen, FileText, LayoutTemplate, RefreshCw, 
  ToggleLeft, ToggleRight, List, FolderTree, ChevronRight, ChevronDown, Folder as FolderIcon, GitBranch, Braces, Download
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
  type: 'md' | 'mmd' | 'json' | 'image' | 'other';
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
  if (type === 'json') return <Braces className="file-icon json-icon" size={16} />;
  return <FileText className="file-icon" size={16} />;
};

// --- JSON Preview ---
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const JsonNode = ({ value, depth = 0, isLast = true }: { value: JsonValue; depth?: number; isLast?: boolean }) => {
  const [collapsed, setCollapsed] = useState(depth > 2);

  if (value === null) return <span className="json-null">null</span>;
  if (typeof value === 'boolean') return <span className="json-bool">{value.toString()}</span>;
  if (typeof value === 'number') return <span className="json-number">{value}</span>;
  if (typeof value === 'string') return <span className="json-string">&quot;{value}&quot;</span>;

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as JsonValue[]).map((v, i) => [String(i), v] as [string, JsonValue])
    : Object.entries(value as { [key: string]: JsonValue });

  if (entries.length === 0) {
    return <span className="json-bracket">{isArray ? '[]' : '{}'}</span>;
  }

  const openBr = isArray ? '[' : '{';
  const closeBr = isArray ? ']' : '}';

  return (
    <span>
      <span
        className="json-toggle"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expand' : 'Collapse'}
      >
        <span className="json-toggle-icon">{collapsed ? '▶' : '▼'}</span>
        <span className="json-bracket">{openBr}</span>
      </span>
      {collapsed ? (
        <span>
          <span className="json-collapsed-hint" onClick={() => setCollapsed(false)}>
            {entries.length} {isArray ? 'item' : 'key'}{entries.length !== 1 ? 's' : ''}
          </span>
          <span className="json-bracket">{closeBr}</span>
        </span>
      ) : (
        <span>
          <span className="json-block">
            {entries.map(([key, val], idx) => (
              <span key={key} className="json-entry">
                <span className="json-indent" style={{ paddingLeft: `${(depth + 1) * 20}px` }} />
                {!isArray && <><span className="json-key">&quot;{key}&quot;</span><span className="json-colon">: </span></>}
                <JsonNode value={val} depth={depth + 1} isLast={idx === entries.length - 1} />
                {idx < entries.length - 1 && <span className="json-comma">,</span>}
                {"\n"}
              </span>
            ))}
          </span>
          <span className="json-indent" style={{ paddingLeft: `${depth * 20}px` }} />
          <span className="json-bracket">{closeBr}</span>
        </span>
      )}
    </span>
  );
};

const JsonPreview = ({ content }: { content: string }) => {
  const [parsed, setParsed] = useState<{ data: JsonValue | null; error: string | null }>({ data: null, error: null });

  useEffect(() => {
    try {
      const data = JSON.parse(content);
      setParsed({ data, error: null });
    } catch (e: any) {
      setParsed({ data: null, error: e.message });
    }
  }, [content]);

  if (parsed.error) {
    return (
      <div className="mermaid-error">
        <div className="mermaid-error-title">⚠️ JSON Parse Error</div>
        <pre className="mermaid-error-detail">{parsed.error}</pre>
        <pre className="mermaid-source">{content}</pre>
      </div>
    );
  }

  return (
    <div className="json-preview">
      <pre className="json-pre">
        <JsonNode value={parsed.data} depth={0} />
      </pre>
    </div>
  );
};

const MermaidPreview = ({ content, onSvgChange }: { content: string; onSvgChange?: (svg: string) => void }) => {
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
          onSvgChange?.(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Failed to render Mermaid diagram');
          setSvg('');
          onSvgChange?.('');
        }
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
    <div style={{ width: '100%' }}>
      <div
        className="mermaid-preview"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
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

  // Mermaid PNG export
  const [mermaidSvg, setMermaidSvg] = useState<string>('');
  const [isSavingPng, setIsSavingPng] = useState(false);

  const handleSavePng = async () => {
    if (!mermaidSvg || !selectedFile) return;
    setIsSavingPng(true);
    try {
      // Parse SVG to extract exact viewBox dimensions
      const parser = new DOMParser();
      const doc = parser.parseFromString(mermaidSvg, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (!svgEl) return;

      let w = 800, h = 600;
      const vb = svgEl.getAttribute('viewBox');
      if (vb) {
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
          w = parts[2]; h = parts[3];
        }
      } else {
        const wa = svgEl.getAttribute('width');
        const ha = svgEl.getAttribute('height');
        if (wa && !wa.includes('%')) w = parseFloat(wa);
        if (ha && !ha.includes('%')) h = parseFloat(ha);
      }

      // Force explicit px dimensions so the browser renders it at full size
      svgEl.setAttribute('width', String(w));
      svgEl.setAttribute('height', String(h));

      const svgStr = new XMLSerializer().serializeToString(svgEl);
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const scale = 3; // 3× for crisp high-res output
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.fillStyle = '#111318';
      ctx.fillRect(0, 0, w, h);

      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => { ctx.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve(); };
        img.onerror = reject;
        img.src = url;
      });

      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = selectedFile.name.replace(/\.mmd$/i, '') + '.png';
      a.click();
    } finally {
      setIsSavingPng(false);
    }
  };

  // We keep the input fallback just in case
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewableFiles = useMemo(() => files.filter(f => f.type === 'md' || f.type === 'mmd' || f.type === 'json'), [files]);
  
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
        } else if (lowerName.endsWith('.json')) {
          const text = await file.text();
          newFiles.push({ path, name: entry.name, content: text, type: 'json', handle: fileHandle });
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
      return newFiles.find(f => f.type === 'md' || f.type === 'mmd' || f.type === 'json') || null;
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
      } else if (lowerName.endsWith('.json')) {
        const text = await file.text();
        newFiles.push({ path, name: file.name, content: text, type: 'json', handle: { getFile: async () => fileRefs[path] } });
      } else if (lowerName.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
        const url = URL.createObjectURL(file);
        newFiles.push({ path, name: file.name, url, type: 'image' });
      }
    });

    await Promise.all(promises);

    newFiles.sort((a, b) => a.path.localeCompare(b.path));
    setFiles(newFiles);

    const firstPreviewable = newFiles.find(f => f.type === 'md' || f.type === 'mmd' || f.type === 'json');
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
                  {selectedFile.type === 'mmd' ? <GitBranch size={18} /> : selectedFile.type === 'json' ? <Braces size={18} /> : <FileText size={18} />}
                  {selectedFile.path}
                  {selectedFile.type === 'mmd' && (
                    <span className="file-type-badge mmd-badge">MERMAID</span>
                  )}
                  {selectedFile.type === 'json' && (
                    <span className="file-type-badge json-badge">JSON</span>
                  )}
                </span>

                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isAutoRefresh && (
                    <span style={{ fontSize: '11px', background: 'var(--accent-glow)', color: 'var(--accent-color)', padding: '4px 8px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <RefreshCw size={12} className="spin-anim" /> Live
                    </span>
                  )}
                  {selectedFile.type === 'mmd' && mermaidSvg && (
                    <button
                      onClick={handleSavePng}
                      disabled={isSavingPng}
                      title="Save as PNG"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)',
                        color: isSavingPng ? 'var(--text-tertiary)' : 'var(--accent-color)',
                        padding: '5px 12px', borderRadius: '8px',
                        cursor: isSavingPng ? 'not-allowed' : 'pointer',
                        fontSize: '12px', fontWeight: 600, transition: 'all 0.2s',
                      }}
                    >
                      <Download size={13} />
                      {isSavingPng ? 'Saving…' : 'Save PNG'}
                    </button>
                  )}
                </span>
              </span>
            </div>
            <div className="preview-container">
              {selectedFile.type === 'mmd' ? (
                <div className="mermaid-body">
                  <MermaidPreview content={selectedFile.content || ''} onSvgChange={setMermaidSvg} />
                </div>
              ) : selectedFile.type === 'json' ? (
                <div className="json-body">
                  <JsonPreview content={selectedFile.content || ''} />
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
