/**
 * URL utilities for PhotoPlus photo extraction
 *
 * Based on Python implementation in photo_downloader.py:
 * - _extract_filename_from_thumbnail()
 * - _extract_filename_from_url()
 * - URL normalization and fingerprint extraction
 */

/**
 * Validate and sanitize input string
 * Prevents path traversal attacks and injection attempts
 *
 * @param input - Input string to validate
 * @param maxLength - Maximum allowed length (default: 2048)
 * @returns Validated string or throws error
 */
function validateInput(input: unknown, maxLength = 2048): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }

  if (input.length === 0) {
    throw new Error('Input cannot be empty');
  }

  if (input.length > maxLength) {
    throw new Error(`Input exceeds maximum length of ${maxLength}`);
  }

  return input;
}

/**
 * Sanitize filename by removing path traversal attempts and illegal characters
 *
 * @param filename - Original filename
 * @returns Safe filename without path components
 */
function sanitizePathComponent(filename: string): string {
  // Remove any path traversal attempts
  let safe = filename
    .replace(/\.\./g, '_')           // Replace .. with _
    .replace(/^[/\\]+/, '')          // Remove leading slashes
    .replace(/[/\\]/g, '_');         // Replace path separators

  // Get only the filename (last component)
  const lastSlash = Math.max(safe.lastIndexOf('/'), safe.lastIndexOf('\\'));
  if (lastSlash >= 0) {
    safe = safe.substring(lastSlash + 1);
  }

  return safe;
}

/**
 * Extract fingerprint (unique identifier) from thumbnail URL
 *
 * This is a critical function for deduplication. The fingerprint is extracted
 * from the thumbnail URL and used to identify unique photos.
 *
 * Python equivalent: _extract_filename_from_thumbnail()
 *
 * URL format examples:
 * - //pb.plusx.cn/plus/immediate/35272685/2025111623814917/1060536x354blur2.jpg~tplv-...
 * - Returns: "1060536x354blur2.jpg"
 *
 * @param url - Thumbnail URL
 * @param fallbackIndex - Optional index to use for fallback fingerprint
 * @returns Unique fingerprint string
 */
export function extractFingerprintFromUrl(url: string, fallbackIndex?: number): string {
  try {
    // Validate input
    const validatedUrl = validateInput(url, 4096);

    // Fix relative protocol URL (// -> https://)
    let normalizedUrl = validatedUrl;
    if (validatedUrl.startsWith('//')) {
      normalizedUrl = 'https:' + validatedUrl;
    }

    // Remove query parameters
    let path = normalizedUrl.split('?')[0];

    // IMPORTANT: Remove CDN suffix (everything after ~) FIRST
    // This must happen before extracting filename, otherwise we get wrong results
    // Example: 1060536x354blur2.jpg~tplv-xxx/wst/3:480:1000:gif.avif
    //          -> 1060536x354blur2.jpg
    if (path.includes('~')) {
      path = path.split('~')[0];
    }

    // Extract filename (last segment of path)
    const filename = path.split('/').pop();

    if (!filename) {
      throw new Error('Extracted filename is empty');
    }

    // Sanitize and return (prevent path traversal in fingerprint)
    return sanitizePathComponent(filename);
  } catch (error) {
    // Fallback: use timestamp + index (matches Python's fallback behavior)
    const timestamp = Date.now();
    if (fallbackIndex !== undefined) {
      return `fallback_${timestamp}_${fallbackIndex}`;
    }
    return `fallback_${timestamp}_${Math.floor(Math.random() * 10000)}`;
  }
}

/**
 * Sanitize filename for Dropbox compatibility and security
 *
 * Dropbox doesn't allow these characters in filenames:
 * - Colon (:)
 * - Question mark (?)
 * - Asterisk (*)
 * - Pipe (|)
 * - Quotes (" and ')
 * - Less than / Greater than (< >)
 * - Backslash (\)
 *
 * Additionally prevents:
 * - Path traversal attacks (..)
 * - Leading/trailing slashes
 * - Empty filenames
 *
 * @param filename - Original filename
 * @returns Sanitized filename safe for Dropbox and filesystem
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unknown.jpg';
  }

  // First, apply path traversal protection
  let safe = sanitizePathComponent(filename);

  // Then, replace Dropbox-illegal characters with underscore
  safe = safe.replace(/[:"*?|<>\\/']/g, '_');

  // Ensure filename is not empty after sanitization
  if (!safe || safe.trim() === '') {
    return 'unknown.jpg';
  }

  // Limit filename length (Dropbox has 255 char limit)
  if (safe.length > 200) {
    const ext = safe.lastIndexOf('.');
    if (ext > 0) {
      const extension = safe.substring(ext);
      safe = safe.substring(0, 200 - extension.length) + extension;
    } else {
      safe = safe.substring(0, 200);
    }
  }

  return safe;
}

/**
 * Extract original filename from photo URL
 *
 * Python equivalent: _extract_filename_from_url()
 *
 * URL format examples:
 * - https://cdn.example.com/path/9T1A3143.JPG~tplv-xxx.JPG
 * - Returns: "9T1A3143.JPG"
 *
 * Also handles:
 * - wx_fmt query parameter (WeChat images)
 * - format/type/ext query parameters
 * - Sanitizes filename for Dropbox compatibility
 * - Validates input to prevent injection attacks
 *
 * @param url - Original photo URL
 * @returns Filename with extension (sanitized for Dropbox)
 */
export function extractFilenameFromUrl(url: string): string {
  try {
    // Validate input
    const validatedUrl = validateInput(url, 4096);

    const urlObj = new URL(validatedUrl.startsWith('//') ? 'https:' + validatedUrl : validatedUrl);
    const path = urlObj.pathname;
    let base = path.split('/').pop() || '';

    // Remove CDN processing suffix (after ~)
    if (base.includes('~')) {
      base = base.split('~')[0];
    }

    // Check if we have an extension
    const lastDot = base.lastIndexOf('.');
    const hasExtension = lastDot > 0 && lastDot < base.length - 1;

    if (!hasExtension) {
      // Try to get extension from query parameters (matches Python logic)
      // Order: wx_fmt, format, type, ext
      const params = ['wx_fmt', 'format', 'type', 'ext'];
      for (const param of params) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          return sanitizeFilename(`${base}.${value}`);
        }
      }
    }

    return sanitizeFilename(base || 'unknown.jpg');
  } catch {
    // Simple fallback for invalid URLs
    let filename = url.split('/').pop()?.split('?')[0] || 'unknown.jpg';
    if (filename.includes('~')) {
      filename = filename.split('~')[0];
    }
    return sanitizeFilename(filename);
  }
}

/**
 * Normalize URL by adding https: protocol if missing
 *
 * @param url - URL that may start with //
 * @returns URL with https: protocol
 * @throws Error if URL is invalid
 */
export function normalizeUrl(url: string): string {
  // Validate input
  const validatedUrl = validateInput(url, 4096);

  if (validatedUrl.startsWith('//')) {
    return 'https:' + validatedUrl;
  }
  return validatedUrl;
}

/**
 * Get file extension from URL or Content-Type
 *
 * Python equivalent: _get_extension()
 *
 * @param url - Image URL
 * @param contentType - Optional Content-Type header value
 * @returns File extension with leading dot (e.g., ".jpg")
 */
export function getFileExtension(url: string, contentType?: string): string {
  // Validate URL input
  let validatedUrl: string;
  try {
    validatedUrl = validateInput(url, 4096);
  } catch {
    return '.jpg'; // Default on invalid input
  }

  // Priority 1: Extract from URL
  const extMatch = validatedUrl.match(/\.(jpg|jpeg|png|gif|webp)(?:[?_~]|$)/i);
  if (extMatch) {
    return '.' + extMatch[1].toLowerCase();
  }

  // Priority 2: Infer from Content-Type
  if (contentType) {
    const typeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    const ext = typeMap[contentType.toLowerCase()];
    if (ext) {
      return ext;
    }
  }

  // Default
  return '.jpg';
}

/**
 * Check if a URL is a valid image URL
 *
 * @param url - URL to check
 * @returns true if URL appears to be an image
 */
export function isImageUrl(url: string): boolean {
  if (!url) return false;

  // Check for common image domains
  const imageDomains = [
    'pb.plusx.cn',
    'sinaimg.cn',
    'mmbiz.qpic.cn',
  ];

  const normalizedUrl = normalizeUrl(url).toLowerCase();

  for (const domain of imageDomains) {
    if (normalizedUrl.includes(domain)) {
      return true;
    }
  }

  // Check for common image extensions
  return /\.(jpg|jpeg|png|gif|webp|avif)/i.test(normalizedUrl);
}
