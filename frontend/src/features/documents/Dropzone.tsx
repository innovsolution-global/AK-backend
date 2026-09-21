import { useRef, useState, type DragEvent } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/utils/cn';
import { formatFileSize } from '@/utils/format';

interface DropzoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  label?: string;
}

/** Zone de dépôt par glisser-déposer, avec sélection classique en repli (§34). */
export function Dropzone({
  file,
  onFileChange,
  accept,
  label = 'Glissez un fichier ici',
}: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 transition-colors',
          dragging
            ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10'
            : 'border-slate-300 bg-slate-50 dark:bg-night-800 hover:border-slate-400',
        )}
      >
        <Icon name="upload" className="mb-2 h-6 w-6 text-ink-muted" />

        {file ? (
          <>
            <p className="text-sm font-medium text-ink dark:text-white">{file.name}</p>
            <p className="mt-0.5 text-xs text-ink-muted">{formatFileSize(file.size)}</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onFileChange(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:text-red-400"
            >
              Retirer
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-soft dark:text-slate-300">{label}</p>
            <p className="mt-0.5 text-xs text-ink-muted">ou cliquez pour parcourir</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
      />
    </div>
  );
}
