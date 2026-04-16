import JSZip from 'jszip';
import type { FileItem } from './queue';

/** Package all items with an outputBlob into a single ZIP blob. */
export async function packToZip(items: readonly FileItem[]): Promise<Blob> {
  const zip = new JSZip();
  const seen = new Map<string, number>();

  for (const item of items) {
    if (!item.outputBlob) continue;
    let name = replaceExt(item.file.name, '.webp');
    // De-duplicate names (e.g. two "image.png" in different folders)
    const count = seen.get(name) ?? 0;
    if (count > 0) {
      name = addSuffix(name, `-${count}`);
    }
    seen.set(replaceExt(item.file.name, '.webp'), count + 1);
    zip.file(name, item.outputBlob);
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
  // STORE (no deflate) since WebP is already compressed — saves CPU.
}

function replaceExt(name: string, newExt: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + newExt;
  return name.slice(0, dot) + newExt;
}

function addSuffix(name: string, suffix: string): string {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return name + suffix;
  return name.slice(0, dot) + suffix + name.slice(dot);
}
