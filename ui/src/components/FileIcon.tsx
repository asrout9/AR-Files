import React, { useState, useEffect } from "react";
import { EntryRecord } from "../types";
import { invokeCommand } from "../services/ipc";

interface FileIconProps {
  entry: EntryRecord | { name: string; is_directory: boolean; mime_type?: string; path?: string; local_path?: string; thumbnail_url?: string | null; account_id?: string; id?: string };
  size?: number;
  className?: string;
  showThumbnail?: boolean;
}

// In-memory cache to prevent redundant IPC round-trips during fast scrolling
const memoryThumbnailCache = new Map<string, string>();

export const FileIcon: React.FC<FileIconProps> = ({ entry, size = 20, className, showThumbnail = true }) => {
  const isDir = entry.is_directory;
  const name = entry.name.toLowerCase();
  const mime = (entry.mime_type || "").toLowerCase();
  const [thumbError, setThumbError] = useState(false);
  const [asyncThumbSrc, setAsyncThumbSrc] = useState<string | null>(null);

  const entryAny = entry as any;
  const entryId = entryAny.id || entryAny.path || "";
  const accountId = entryAny.account_id || (entryAny.path?.startsWith("/") ? "acc_local" : "");
  const propThumb = entryAny.thumbnail_url;

  const isLocal = accountId === "acc_local" || Boolean(entryAny.local_path);
  const localFilePath = isLocal ? (entryAny.local_path || (entryAny.path?.startsWith("/") ? entryAny.path : "")) : "";

  const cacheKey = `${accountId}:${entryId || localFilePath || entryAny.name}`;

  const isImage = mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(name);
  const isVideo = mime.startsWith("video/") || /\.(mp4|mkv|webm|avi|mov|wmv|flv|m4v|3gp)$/i.test(name);
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(name);
  const isDoc = /\.(docx?|pptx?|xlsx?|odt|ods|odp)$/i.test(name);
  const isCandidate = isImage || isVideo || isPdf || isDoc || Boolean(propThumb) || (!isLocal);

  // Reset errors and async source when cacheKey changes
  useEffect(() => {
    setThumbError(false);
    setAsyncThumbSrc(null);
  }, [cacheKey]);

  // Determine initial synchronous thumbnail source
  let directThumb: string | null = null;
  if (memoryThumbnailCache.has(cacheKey)) {
    directThumb = memoryThumbnailCache.get(cacheKey)!;
  } else if (propThumb && propThumb.startsWith("file://")) {
    directThumb = propThumb;
  } else if (isLocal && isImage && localFilePath) {
    directThumb = localFilePath.startsWith("file://") ? localFilePath : `file://${localFilePath}`;
  }

  useEffect(() => {
    if (!showThumbnail || isDir || thumbError || directThumb || !isCandidate) {
      return;
    }

    if (memoryThumbnailCache.has(cacheKey)) {
      setAsyncThumbSrc(memoryThumbnailCache.get(cacheKey)!);
      return;
    }

    let isMounted = true;
    const fetchThumb = async () => {
      try {
        const res: any = await invokeCommand("get_thumbnail", {
          path: localFilePath || entryId,
          account_id: accountId,
          entry_id: entryId,
          thumbnail_url: propThumb,
        });
        const found: string | null = typeof res === "string" ? res : (res?.thumbnail || res?.data || null);
        if (isMounted && found) {
          memoryThumbnailCache.set(cacheKey, found);
          setAsyncThumbSrc(found);
        }
      } catch {
        // Gracefully keep vector icon fallback
      }
    };

    fetchThumb();

    return () => {
      isMounted = false;
    };
  }, [cacheKey, showThumbnail, isDir, thumbError, directThumb, isCandidate, localFilePath, accountId, entryId, propThumb]);

  const activeThumb = !thumbError ? (directThumb || asyncThumbSrc || (propThumb && !propThumb.startsWith("http") ? propThumb : null)) : null;

  // If thumbnail is allowed and entry is a file, display thumbnail image
  if (showThumbnail && !isDir && activeThumb) {
    return (
      <img
        src={activeThumb}
        alt={entry.name}
        onError={() => setThumbError(true)}
        style={{
          width: size,
          height: size,
          objectFit: "cover",
          borderRadius: size >= 32 ? "var(--adw-radius-m, 6px)" : 3,
          boxShadow: size >= 32 ? "0 2px 8px rgba(0,0,0,0.18)" : "none",
          border: size >= 32 ? "1px solid var(--border-color)" : "1px solid rgba(0,0,0,0.12)",
          flexShrink: 0,
          display: "inline-block",
        }}
        className={className}
      />
    );
  }

  // Helper for folder sub-types
  if (isDir) {
    let folderType = "standard";
    if (name.includes("download")) folderType = "downloads";
    else if (name.includes("document") || name.includes("doc")) folderType = "documents";
    else if (name.includes("music") || name.includes("audio") || name.includes("song")) folderType = "music";
    else if (name.includes("picture") || name.includes("photo") || name.includes("image")) folderType = "pictures";
    else if (name.includes("video") || name.includes("movie") || name.includes("film")) folderType = "videos";
    else if (name.includes("trash")) folderType = "trash";
    else if (name.includes("code") || name.includes("project") || name.includes("dev")) folderType = "code";

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        style={{ flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="folderBack" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#256db4" />
            <stop offset="100%" stopColor="#1c5c9c" />
          </linearGradient>
          <linearGradient id="folderFront" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4395eb" />
            <stop offset="100%" stopColor="#2977cc" />
          </linearGradient>
          <linearGradient id="folderHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <filter id="folderShadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000000" floodOpacity="0.2" />
          </filter>
        </defs>

        {/* Folder Back with Tab */}
        <path
          d="M6 14C6 11.79 7.79 10 10 10H24L30 16H54C56.21 16 58 17.79 58 20V48C58 50.21 56.21 52 54 52H10C7.79 52 6 50.21 6 48V14Z"
          fill="url(#folderBack)"
        />

        {/* Folder Interior Sheet (White hint) */}
        <rect x="10" y="16" width="44" height="20" rx="3" fill="#e8f2fc" opacity="0.6" />

        {/* Folder Front Flap */}
        <path
          d="M6 23C6 20.79 7.79 19 10 19H54C56.21 19 58 20.79 58 23V48C58 50.21 56.21 52 54 52H10C7.79 52 6 50.21 6 48V23Z"
          fill="url(#folderFront)"
          filter="url(#folderShadow)"
        />

        {/* Top Edge Highlight */}
        <path
          d="M10 20H54C55.6 20 57 21.4 57 23V24C57 22.4 55.6 21 54 21H10C8.4 21 7 22.4 7 24V23C7 21.4 8.4 20 10 20Z"
          fill="url(#folderHighlight)"
        />

        {/* Special Emblem Overlay */}
        {folderType === "downloads" && (
          <g transform="translate(24, 27)" fill="#ffffff" opacity="0.95">
            <path d="M8 1v9M4 6l4 4 4-4M1 13h14" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {folderType === "documents" && (
          <g transform="translate(25, 27)" fill="#ffffff" opacity="0.95">
            <path d="M2 1h7l4 4v9a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z" stroke="#ffffff" strokeWidth="2" fill="none" />
            <path d="M4 6h4M4 9h6M4 12h6" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        )}

        {folderType === "pictures" && (
          <g transform="translate(24, 28)" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95">
            <rect x="1" y="1" width="14" height="11" rx="1.5" />
            <circle cx="5" cy="4.5" r="1.2" fill="#ffffff" />
            <path d="m14 9-4-4-6 6" />
          </g>
        )}

        {folderType === "videos" && (
          <g transform="translate(24, 28)" fill="#ffffff" opacity="0.95">
            <polygon points="5,2 13,7.5 5,13" />
          </g>
        )}

        {folderType === "music" && (
          <g transform="translate(24, 27)" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.95">
            <path d="M6 13V3l8-2v10" strokeLinecap="round" />
            <circle cx="4" cy="13" r="2.5" fill="#ffffff" />
            <circle cx="12" cy="11" r="2.5" fill="#ffffff" />
          </g>
        )}

        {folderType === "trash" && (
          <g transform="translate(24, 27)" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95">
            <path d="M3 4h10M5 4V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 4v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4" />
          </g>
        )}

        {folderType === "code" && (
          <g transform="translate(24, 28)" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95">
            <path d="m5 4-4 4 4 4M11 4l4 4-4 4" />
          </g>
        )}
      </svg>
    );
  }

  // File Classification
  const isAudio =
    mime.startsWith("audio/") ||
    /\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)$/.test(name);
  const isArchive =
    mime.includes("zip") ||
    mime.includes("tar") ||
    mime.includes("compressed") ||
    /\.(zip|tar(\.gz|\.xz|\.bz2)?|tgz|7z|rar|gz|bz2|xz|zst)$/.test(name);
  const isSpreadsheet =
    mime.includes("sheet") ||
    mime.includes("csv") ||
    /\.(xlsx?|ods|csv|tsv)$/.test(name);
  const isPresentation =
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    /\.(pptx?|odp|key)$/.test(name);
  const isCode =
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("python") ||
    mime.includes("rust") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("html") ||
    mime.includes("css") ||
    /\.(tsx?|jsx?|rs|py|c|cpp|h|hpp|go|java|sh|bash|json|yaml|yml|toml|xml|html|css|scss|sql|php|rb|lua|vim)$/.test(name);
  const isText =
    mime.startsWith("text/") ||
    /\.(txt|md|markdown|log|ini|conf|cfg|env)$/.test(name);
  const isExecutable =
    /\.(bin|exe|appimage|deb|rpm|run|iso)$/.test(name);

  // --- PDF ---
  if (isPdf) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="pdfGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#f85149" />
            <stop offset="100%" stopColor="#da3633" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#pdfGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#ff7b72" opacity="0.8" />
        <rect x="18" y="24" width="28" height="4" rx="2" fill="#ffffff" opacity="0.9" />
        <rect x="18" y="32" width="22" height="3" rx="1.5" fill="#ffffff" opacity="0.8" />
        <rect x="18" y="38" width="28" height="3" rx="1.5" fill="#ffffff" opacity="0.8" />
        <rect x="16" y="46" width="24" height="10" rx="3" fill="#ffffff" />
        <text x="28" y="54" fontSize="8" fontWeight="800" fontFamily="system-ui, sans-serif" fill="#da3633" textAnchor="middle">PDF</text>
      </svg>
    );
  }

  // --- IMAGES ---
  if (isImage) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="imgGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#f5c211" />
            <stop offset="100%" stopColor="#e5a50a" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#imgGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#f8e45c" opacity="0.75" />
        <rect x="18" y="22" width="28" height="28" rx="4" fill="#ffffff" />
        <circle cx="26" cy="30" r="3.5" fill="#e5a50a" />
        <path d="M19 46L28 35L36 44L41 38L45 46H19Z" fill="#f5c211" />
        <path d="M28 35L33 41L30 46H19L28 35Z" fill="#e5a50a" opacity="0.7" />
      </svg>
    );
  }

  // --- VIDEO ---
  if (isVideo) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="vidGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#a347ba" />
            <stop offset="100%" stopColor="#7e2b96" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#vidGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#c061cb" opacity="0.75" />
        <rect x="18" y="24" width="28" height="24" rx="4" fill="#ffffff" />
        <polygon points="29,31 38,36 29,41" fill="#7e2b96" />
      </svg>
    );
  }

  // --- AUDIO ---
  if (isAudio) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="audGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#2ec27e" />
            <stop offset="100%" stopColor="#1e8954" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#audGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#57e389" opacity="0.75" />
        <circle cx="32" cy="38" r="13" fill="#ffffff" />
        <circle cx="32" cy="38" r="4.5" fill="#1e8954" />
        <path d="M32 25V38" stroke="#1e8954" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  // --- ARCHIVES ---
  if (isArchive) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="zipGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#c0824b" />
            <stop offset="100%" stopColor="#986033" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#zipGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#de9b62" opacity="0.75" />
        {/* Zipper strip */}
        <rect x="29" y="8" width="6" height="34" fill="#503520" opacity="0.6" />
        <path d="M30 10h4M30 14h4M30 18h4M30 22h4M30 26h4M30 30h4M30 34h4" stroke="#ffffff" strokeWidth="1.8" />
        <rect x="28" y="38" width="8" height="11" rx="2" fill="#f6d32d" />
        <circle cx="32" cy="44" r="1.5" fill="#503520" />
      </svg>
    );
  }

  // --- SPREADSHEETS ---
  if (isSpreadsheet) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="sheetGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#26a269" />
            <stop offset="100%" stopColor="#1a7346" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#sheetGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#33d17a" opacity="0.75" />
        <rect x="18" y="24" width="28" height="26" rx="3" fill="#ffffff" />
        <path d="M18 32h28M18 40h28M27 24v26M37 24v26" stroke="#26a269" strokeWidth="1.6" />
      </svg>
    );
  }

  // --- PRESENTATIONS ---
  if (isPresentation) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="presGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#ff7800" />
            <stop offset="100%" stopColor="#e66100" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#presGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#ffa348" opacity="0.75" />
        <rect x="18" y="24" width="28" height="26" rx="3" fill="#ffffff" />
        <path d="M24 44v-8M32 44v-14M40 44v-6" stroke="#e66100" strokeWidth="3.5" strokeLinecap="round" />
      </svg>
    );
  }

  // --- CODE / DEVELOPER ---
  if (isCode) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="codeGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#1c71d8" />
            <stop offset="100%" stopColor="#0d52a8" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#codeGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#62a0ea" opacity="0.8" />
        <rect x="18" y="24" width="28" height="26" rx="4" fill="#1b2430" />
        <path d="m26 33-4 4 4 4M38 33l4 4-4 4M33 30l-2 14" stroke="#38d4f4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // --- EXECUTABLE / BINARY ---
  if (isExecutable) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="binGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#4d4757" />
            <stop offset="100%" stopColor="#2c2834" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#binGrad)" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#77767b" opacity="0.75" />
        <rect x="18" y="24" width="28" height="26" rx="3" fill="#1e1e24" />
        <path d="m23 33 4 4-4 4M29 41h6" stroke="#2ec27e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // --- TEXT / MARKDOWN ---
  if (isText) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
        <defs>
          <linearGradient id="txtGrad" x1="0" y1="0" x2="0" y2="100%">
            <stop offset="0%" stopColor="#f6f8fa" />
            <stop offset="100%" stopColor="#e1e4e8" />
          </linearGradient>
        </defs>
        <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#txtGrad)" stroke="#c3c7cb" strokeWidth="1" />
        <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#d1d5da" />
        <path d="M20 25h24M20 32h24M20 39h18M20 46h14" stroke="#586069" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }

  // --- DEFAULT / GENERIC FILE ---
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="defGrad" x1="0" y1="0" x2="0" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e4e6eb" />
        </linearGradient>
      </defs>
      <path d="M12 8C12 5.79 13.79 4 16 4H40L52 16V56C52 58.21 50.21 60 48 60H16C13.79 60 12 58.21 12 56V8Z" fill="url(#defGrad)" stroke="#c0c4cc" strokeWidth="1" />
      <path d="M40 4L52 16H42C40.9 16 40 15.1 40 14V4Z" fill="#cfd3dc" />
      <rect x="20" y="26" width="24" height="2" rx="1" fill="#9a9ea8" />
      <rect x="20" y="33" width="24" height="2" rx="1" fill="#9a9ea8" />
      <rect x="20" y="40" width="16" height="2" rx="1" fill="#9a9ea8" />
    </svg>
  );
};
