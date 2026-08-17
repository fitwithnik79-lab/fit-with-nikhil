import React, { useState, useRef, useEffect, useMemo } from 'react';
import { VaultExerciseItem, isDirectVideoLink, normalizeExerciseName } from '../lib/vaultExerciseHelper';
import { Play, Sparkles, Video, CheckCircle2, BookOpen, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

interface ExerciseAutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelectVaultItem: (item: VaultExerciseItem) => void;
  vaultExercises: VaultExerciseItem[];
  placeholder?: string;
  className?: string;
  hasVideoLink?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export const ExerciseAutocompleteInput: React.FC<ExerciseAutocompleteInputProps> = ({
  value,
  onChange,
  onSelectVaultItem,
  vaultExercises,
  placeholder = 'Exercise Name (e.g. Incline DB Press)...',
  className = '',
  hasVideoLink = false,
  disabled = false,
  autoFocus = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter suggestions matching the current typed input
  const suggestions = useMemo(() => {
    const rawInput = (value || '').trim();
    if (!rawInput || rawInput.length < 2) {
      return [];
    }

    const normInput = normalizeExerciseName(rawInput);
    const searchTerms = normInput.split(/\s+/).filter(t => t.length > 1);

    return vaultExercises
      .filter((item) => {
        const itemNorm = normalizeExerciseName(item.name);
        const itemName = item.name.toLowerCase();

        // 1. Direct prefix or inclusion
        if (itemNorm.includes(normInput) || itemName.includes(rawInput.toLowerCase())) {
          return true;
        }

        // 2. Multi-term match (all search words must exist in item)
        if (searchTerms.length > 1) {
          return searchTerms.every(term => itemNorm.includes(term) || itemName.includes(term));
        }

        return false;
      })
      .sort((a, b) => {
        // Prioritize items with direct video links
        const aHasVideo = isDirectVideoLink(a.youtubeLink) ? 1 : 0;
        const bHasVideo = isDirectVideoLink(b.youtubeLink) ? 1 : 0;
        if (bHasVideo !== aHasVideo) return bHasVideo - aHasVideo;

        // Prioritize items from global_library
        const aIsGlobal = a.sourceType === 'global_library' ? 1 : 0;
        const bIsGlobal = b.sourceType === 'global_library' ? 1 : 0;
        if (bIsGlobal !== aIsGlobal) return bIsGlobal - aIsGlobal;

        // Usage count priority
        const aUsage = a.usageCount || 0;
        const bUsage = b.usageCount || 0;
        if (bUsage !== aUsage) return bUsage - aUsage;

        return a.name.localeCompare(b.name);
      })
      .slice(0, 7); // Max 7 suggestions to keep dropdown snappy
  }, [value, vaultExercises]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: VaultExerciseItem) => {
    onSelectVaultItem(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => {
            if ((value || '').trim().length >= 2 && suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            "w-full bg-zinc-950 border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500/50 transition-all",
            hasVideoLink ? "pr-24" : "pr-10",
            className
          )}
        />

        {/* Video linked indicator tag inside input */}
        {hasVideoLink && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-black uppercase tracking-wider pointer-events-none">
            <CheckCircle2 className="w-3 h-3" />
            <span>Video Link</span>
          </div>
        )}
      </div>

      {/* Autocomplete Dropdown Popover */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[999] bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="px-4 py-2 bg-zinc-950/80 border-b border-zinc-800 flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-orange-500" />
              Global Exercise Library Suggestions
            </div>
            <div className="text-[9px] font-bold text-zinc-500">
              {suggestions.length} matched
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto divide-y divide-zinc-800/60 p-1.5">
            {suggestions.map((item, idx) => {
              const hasVideo = isDirectVideoLink(item.youtubeLink);
              const isHighlighted = idx === highlightedIndex;

              return (
                <button
                  key={item.id || `${item.name}-${idx}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    "w-full text-left p-3 rounded-xl transition-all flex flex-col gap-1.5 group cursor-pointer",
                    isHighlighted
                      ? "bg-zinc-800 border-l-2 border-orange-500 pl-3.5 text-white"
                      : "hover:bg-zinc-800/60 text-zinc-300"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white group-hover:text-orange-400 transition-colors">
                      {item.name}
                    </span>

                    {/* Video demo badge */}
                    {hasVideo ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-md text-[10px] font-bold shrink-0">
                        <Play className="w-2.5 h-2.5 fill-current" />
                        Video Demo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-400 rounded-md text-[10px] font-bold shrink-0">
                        <BookOpen className="w-2.5 h-2.5" />
                        Library Preset
                      </span>
                    )}
                  </div>

                  {/* Sub-parameters & notes */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 flex-wrap">
                    {item.block && (
                      <span className="px-1.5 py-0.5 bg-zinc-950 rounded text-[9px] font-bold text-zinc-400 border border-white/5">
                        {item.block}
                      </span>
                    )}
                    <span>
                      {item.sets || 3} sets • {item.reps || '10-12'} reps
                    </span>
                    {item.weight && (
                      <>
                        <span>•</span>
                        <span>{item.weight}</span>
                      </>
                    )}
                    {item.sourceName && (
                      <span className="text-[10px] text-zinc-400 italic ml-auto truncate max-w-[140px]">
                        {item.sourceName}
                      </span>
                    )}
                  </div>

                  {/* Coaching cue preview */}
                  {item.coachNote && (
                    <div className="text-[10px] text-zinc-400 line-clamp-1 italic bg-zinc-950/40 px-2 py-1 rounded border border-white/5">
                      💡 {item.coachNote}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
