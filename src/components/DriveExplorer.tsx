import { ChevronLeft, Folder, FileText, Search, Loader2, X, Check, RefreshCw } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getContrastColor } from '../lib/utils';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
}

interface DriveExplorerProps {
  accessToken: string;
  onSelect: (files: DriveFile[], folders: DriveFile[]) => void;
  onClose: () => void;
  theme: any;
  accentColor?: string;
}

export const DriveExplorer: React.FC<DriveExplorerProps> = ({ accessToken, onSelect, onClose, theme, accentColor = '#1e5fe6' }) => {
  const isDark = ['dark', 'oled', 'monochrome-dark', 'neon-cyan'].includes(theme?.id);
  const colors = isDark 
    ? (theme?.colors || { text: 'text-white', sub: 'text-[#cccccc]' })
    : { text: 'text-[#1f1f1f]', sub: 'text-[#5f6368]' };
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'Meu Drive' }]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => {
    fetchFiles(currentFolder.id);
  }, [currentFolder.id]);

  const fetchFiles = async (folderId: string) => {
    setLoading(true);
    setFiles([]); // Clear previous files
    setError(null);
    try {
      // Simplest possible query to see if anything shows up
      const q = `'${folderId}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?spaces=drive&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime)&pageSize=100`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      if (!res.ok) {
        const errData = await res.json();
        if (res.status === 401) {
          setError('Sua sessão expirou. Por favor, feche esta janela e clique em Agendas novamente para entrar.');
          localStorage.removeItem('accessToken');
        } else {
          throw new Error(errData.error?.message || 'Erro na API do Drive');
        }
        return;
      }

      const data = await res.json();
      setFiles(data.files || []);
    } catch (error: any) {
      console.error('Error fetching drive files:', error);
      setError(error.message || 'Erro ao carregar arquivos');
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const handleFolderClick = (file: DriveFile) => {
    if (file.mimeType === 'application/vnd.google-apps.folder') {
      setFolderStack([...folderStack, { id: file.id, name: file.name }]);
    }
  };

  const goBack = () => {
    if (folderStack.length > 1) {
      setFolderStack(folderStack.slice(0, -1));
    }
  };

  const handleConfirm = () => {
    const selectedList = files.filter(f => selectedItems.has(f.id));
    const folders = selectedList.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
    const individualFiles = selectedList.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
    onSelect(individualFiles, folders);
  };

  const sortedFiles = [...files].sort((a, b) => {
    const isFolderA = a.mimeType === 'application/vnd.google-apps.folder';
    const isFolderB = b.mimeType === 'application/vnd.google-apps.folder';
    if (isFolderA && !isFolderB) return -1;
    if (!isFolderA && isFolderB) return 1;
    return a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' });
  });

  const filteredFiles = sortedFiles.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn("fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-xl", isDark ? "bg-black/80" : "bg-[#f0f4f9]/90")}
    >
      <motion.div 
        initial={{ scale: 0.95, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 30 }}
        className={cn("w-full max-w-4xl rounded-none shadow-2xl flex flex-col h-[750px] overflow-hidden border transition-colors", isDark ? "bg-[#1a1c1e] border-white/10" : "bg-white border-[#dadce0]")}
      >
        {/* Header */}
        <div className={cn("p-8 border-b flex items-center justify-between", isDark ? "border-white/5" : "border-[#f1f3f4]")}>
          <div className="flex items-center gap-6">
            {folderStack.length > 1 && (
              <button 
                onClick={goBack} 
                className="p-3 hover:bg-white/10 rounded-none transition-all"
                style={{ color: accentColor }}
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            <div>
              <h2 className={cn("text-xl font-medium", colors.text)}>Conectar Agendas</h2>
              <div className="flex items-center gap-2 mt-1">
                <button 
                  onClick={() => fetchFiles(currentFolder.id)}
                  className="w-4 h-4 rounded-none flex items-center justify-center transition-all hover:scale-105"
                  style={{ backgroundColor: accentColor, color: getContrastColor(accentColor) }}
                  title="Atualizar"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                </button>
                <div className="w-1.5 h-1.5 rounded-none" style={{ backgroundColor: accentColor }} />
                <p className={cn("text-xs font-medium", colors.sub)}>
                   {currentFolder.name}
                </p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className={cn("p-3 hover:bg-white/10 rounded-none transition-all", colors.sub)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className={cn("px-8 py-6 transition-colors", isDark ? "bg-[#1f2123]" : "bg-[#f8f9fa]")}>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
            <input 
              type="text"
              placeholder="Pesquisar arquivos e pastas..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={cn(
                "w-full pl-12 pr-6 py-3.5 border rounded-none text-sm font-medium transition-all focus:outline-none focus:ring-4",
                isDark ? "bg-[#2d3135] border-white/10 text-white placeholder:text-white/30" : "bg-white border-[#dadce0] text-[#1f1f1f]"
              )}
              style={{ 
                borderColor: !isDark && accentColor ? accentColor : undefined,
                ['--tw-ring-color' as any]: `${accentColor}10` 
              }}
            />
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-1 custom-scrollbar">
          {error ? (
            <div className="flex flex-col items-center justify-center h-full text-[#b3261e] gap-4 p-8 text-center">
              <X className="w-12 h-12 p-3 bg-[#fce8e6] rounded-none" />
              <p className="text-sm font-medium">{error}</p>
              <button 
                onClick={() => fetchFiles(currentFolder.id)}
                className="mt-2 px-6 py-2 rounded-none text-sm font-medium transition-all hover:scale-105"
                style={{ backgroundColor: accentColor, color: getContrastColor(accentColor) }}
              >
                Tentar novamente
              </button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: accentColor }}>
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className={cn("text-sm font-medium animate-pulse", colors.sub)}>Sincronizando com o Cloud...</p>
            </div>
          ) : filteredFiles.length > 0 ? (
            filteredFiles.map(file => {
              const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
              const isSelected = selectedItems.has(file.id);
              
              return (
                <div 
                  key={file.id}
                  onClick={(e) => isFolder ? handleFolderClick(file) : toggleSelect(file.id, e)}
                  className={cn(
                    "flex items-center justify-between p-4 rounded-none transition-all group cursor-pointer",
                    isSelected 
                      ? (isDark ? "bg-white/10" : "bg-black/5") 
                      : (isDark ? "hover:bg-white/5" : "hover:bg-[#f1f3f4]")
                  )}
                  style={isSelected ? { backgroundColor: `${accentColor}1A` } : {}}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    {!isFolder ? (
                      <button 
                        onClick={(e) => toggleSelect(file.id, e)}
                        className={cn(
                          "w-5 h-5 rounded-none border-2 flex items-center justify-center transition-all flex-shrink-0",
                          isSelected 
                            ? "border-transparent" 
                            : (isDark ? "border-white/20 group-hover:border-white/40" : "border-[#dadce0] group-hover:border-[#5f6368]")
                        )}
                        style={{ backgroundColor: isSelected ? accentColor : 'transparent' }}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" style={{ color: getContrastColor(accentColor) }} />}
                      </button>
                    ) : (
                      <div className="w-5 h-5 flex-shrink-0" />
                    )}
                    <div 
                      className={cn(
                        "p-2 rounded-none",
                        isSelected ? (isDark ? "bg-white/10" : "bg-white shadow-sm") : (isDark ? "bg-[#2d3135]" : "bg-[#f8f9fa]")
                      )}
                    >
                      {isFolder ? <Folder className="w-5 h-5" style={{ color: accentColor }} /> : <FileText className="w-5 h-5" style={{ color: accentColor }} />}
                    </div>
                    <span className={cn("text-sm font-medium truncate", colors.text)}>{file.name}</span>
                  </div>
                  {isFolder && <ChevronLeft className={cn("w-4 h-4 rotate-180 opacity-60", colors.sub)} />}
                </div>
              );
            })
          ) : (
            <div className={cn("flex flex-col items-center justify-center h-full gap-4 opacity-30", colors.sub)}>
              <Folder className="w-16 h-16" />
              <p className="text-sm font-medium">Pasta vazia</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={cn("p-8 border-t flex items-center justify-between", isDark ? "bg-[#1a1c1e] border-white/5" : "bg-white border-[#f1f3f4]")}>
          <div>
            <p className={cn("text-sm font-medium", colors.sub)}>
              {selectedItems.size} {selectedItems.size === 1 ? 'item selecionado' : 'itens selecionados'}
            </p>
          </div>
          <div className="flex gap-4 items-center">
            <button 
              onClick={onClose}
              className={cn("px-6 py-2.5 text-sm font-medium rounded-full transition-all", isDark ? "hover:bg-white/5" : "hover:bg-[#f1f3f4]", colors.sub)}
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirm}
              disabled={selectedItems.size === 0}
              className="px-8 py-2.5 rounded-full text-sm font-bold shadow-sm hover:shadow-md active:scale-95 transition-all disabled:opacity-30 disabled:shadow-none"
              style={{ backgroundColor: accentColor, color: getContrastColor(accentColor) }}
            >
              Conectar Agendas
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};
