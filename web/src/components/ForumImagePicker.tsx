import { DragEvent, ClipboardEvent, useRef, useState } from "react";
import {
  FORUM_IMAGE_MAX_COUNT,
  validateForumImageFile,
} from "../lib/forumImages";

export type ForumImageDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

type Props = {
  images: ForumImageDraft[];
  onChange: (images: ForumImageDraft[]) => void;
  disabled?: boolean;
};

function addFiles(current: ForumImageDraft[], incoming: File[]): ForumImageDraft[] {
  const next = [...current];
  for (const file of incoming) {
    if (next.length >= FORUM_IMAGE_MAX_COUNT) break;
    const err = validateForumImageFile(file);
    if (err) continue;
    next.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }
  return next;
}

export function ForumImagePicker({ images, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  function removeImage(id: string) {
    const target = images.find((img) => img.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    onChange(images.filter((img) => img.id !== id));
  }

  function handleFiles(fileList: FileList | File[] | null) {
    if (!fileList || disabled) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) {
      setPickError("Choose a PNG, JPG, WebP, or GIF image.");
      return;
    }
    const rejected = files.find((f) => validateForumImageFile(f));
    if (rejected) {
      setPickError(validateForumImageFile(rejected));
    } else {
      setPickError(null);
    }
    onChange(addFiles(images, files));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  function onPaste(e: ClipboardEvent) {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const pasted: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
    }
    if (pasted.length > 0) {
      e.preventDefault();
      handleFiles(pasted);
    }
  }

  const atLimit = images.length >= FORUM_IMAGE_MAX_COUNT;

  return (
    <div className="forums-images" onPaste={onPaste}>
      <div className="forums-images-toolbar">
        <button
          type="button"
          className="btn btn-secondary forums-images-add"
          disabled={disabled || atLimit}
          onClick={() => inputRef.current?.click()}
        >
          Add photo{images.length > 0 ? ` (${images.length}/${FORUM_IMAGE_MAX_COUNT})` : ""}
        </button>
        <span className="forums-hint">PNG, JPG, WebP, or GIF · up to 5 MB each</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          disabled={disabled || atLimit}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div
        className={"forums-images-drop" + (dragOver ? " is-dragover" : "")}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !atLimit) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {images.length === 0 ? (
          <p className="forums-muted">Drag images here or paste from clipboard</p>
        ) : (
          <ul className="forums-images-preview">
            {images.map((img) => (
              <li key={img.id}>
                <img src={img.previewUrl} alt="" />
                <button
                  type="button"
                  className="forums-images-remove"
                  aria-label="Remove image"
                  disabled={disabled}
                  onClick={() => removeImage(img.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pickError ? <p className="forums-error forums-images-error">{pickError}</p> : null}
    </div>
  );
}
