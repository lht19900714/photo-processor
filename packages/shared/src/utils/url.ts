/**
 * Extract fingerprint (filename) from thumbnail URL
 *
 * URL format: //pb.plusx.cn/.../filename.jpg~tplv-.../wst/3:480:1000:gif.avif
 * Returns: filename.jpg
 */
export function extractFingerprintFromUrl(url: string, fallbackIndex?: number): string {
  try {
    if (!url) {
      throw new Error('URL is empty');
    }

    // Fix relative protocol URL
    let normalizedUrl = url;
    if (url.startsWith('//')) {
      normalizedUrl = 'https:' + url;
    }

    // Remove query parameters
    let path = normalizedUrl.split('?')[0];

    // Remove CDN suffix (everything after ~)
    if (path.includes('~')) {
      path = path.split('~')[0];
    }

    // Extract filename (last segment of path)
    const filename = path.split('/').pop();

    if (!filename) {
      throw new Error('Extracted filename is empty');
    }

    return filename;
  } catch (error) {
    // Fallback: use timestamp + index
    const timestamp = Date.now();
    if (fallbackIndex !== undefined) {
      return `fallback_${timestamp}_${fallbackIndex}`;
    }
    return `fallback_${timestamp}_${Math.floor(Math.random() * 10000)}`;
  }
}

/**
 * Extract original filename from photo URL
 *
 * URL format: https://cdn.example.com/path/9T1A3143.JPG~tplv-xxx.JPG
 * Returns: 9T1A3143.JPG
 */
export function extractFilenameFromUrl(url: string): string {
  // Get last segment of path, remove query params
  let filename = url.split('/').pop()?.split('?')[0] || 'unknown.jpg';

  // Remove CDN processing suffix (after ~)
  if (filename.includes('~')) {
    filename = filename.split('~')[0];
  }

  return filename;
}

/**
 * Normalize URL by adding https: protocol if missing
 */
export function normalizeUrl(url: string): string {
  if (url.startsWith('//')) {
    return 'https:' + url;
  }
  return url;
}
