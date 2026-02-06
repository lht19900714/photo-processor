import { chromium, Browser, Page, BrowserContext } from 'playwright';
import {
  extractFingerprintFromUrl,
  extractFilenameFromUrl,
  normalizeUrl,
  type TaskSelectors,
  type PhotoInfo,
  type PhotoWithUrl,
} from '@photo-processor/shared';

/**
 * Configuration for the extractor
 */
interface ExtractorConfig {
  headless: boolean;
  timeout: number;
  selectors: TaskSelectors;
  scrollPauseTime: number;
  maxScrollAttempts: number;
  photoDetailLoadWait: number;
  photoCloseWait: number;
  pageRenderWait: number;
}

/**
 * Default configuration matching Python config.py exactly:
 * - SCROLL_PAUSE_TIME = 2 (seconds)
 * - MAX_SCROLL_ATTEMPTS = 50
 * - PHOTO_DETAIL_LOAD_WAIT = 1000 (ms)
 * - PHOTO_CLOSE_WAIT = 500 (ms)
 * - PAGE_RENDER_WAIT = 3000 (ms)
 */
const DEFAULT_CONFIG: ExtractorConfig = {
  headless: true,
  timeout: 30000,
  selectors: {
    photoItem: 'div.photo-content.container li.photo-item',
    photoClick: 'span',
    viewOriginal: 'div.operate-buttons li.row-all-center a',
  },
  scrollPauseTime: 2000,        // Python: SCROLL_PAUSE_TIME = 2 (seconds)
  maxScrollAttempts: 50,        // Python: MAX_SCROLL_ATTEMPTS = 50
  photoDetailLoadWait: 1000,    // Python: PHOTO_DETAIL_LOAD_WAIT = 1000
  photoCloseWait: 500,          // Python: PHOTO_CLOSE_WAIT = 500
  pageRenderWait: 3000,         // Python: PAGE_RENDER_WAIT = 3000
};

/**
 * Event callback types
 */
export interface ExtractorEvents {
  onLog?: (level: 'info' | 'warn' | 'error', message: string) => void;
  onScanProgress?: (scanned: number, total: number) => void;
  onPhotoFound?: (photo: PhotoInfo) => void;
  onBrowserDisconnected?: () => void;
}

/**
 * PhotoExtractor - Playwright-based photo extraction service
 * Ported from Python script
 */
export class PhotoExtractor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: ExtractorConfig;
  private events: ExtractorEvents;

  constructor(config?: Partial<ExtractorConfig>, events?: ExtractorEvents) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events || {};
  }

  private log(level: 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    console[level](`[${timestamp}] [Extractor] ${message}`);
    this.events.onLog?.(level, message);
  }

  /**
   * Initialize browser
   */
  async initialize(): Promise<void> {
    this.log('info', 'Initializing browser...');

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    // Disable cache
    this.context = await this.browser.newContext({
      extraHTTPHeaders: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    // Setup browser disconnect listener
    this.setupDisconnectListener();

    this.log('info', '✓ Browser initialized');
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.log('info', 'Browser closed');
    }
  }

  /**
   * Check if browser is initialized
   */
  get isInitialized(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Check browser health
   * Verifies browser connection and page responsiveness
   */
  async checkHealth(): Promise<boolean> {
    if (!this.browser || !this.page) {
      return false;
    }
    try {
      // Check browser connection status
      if (!this.browser.isConnected()) {
        return false;
      }
      // Execute simple script to verify page responsiveness
      // Using string-based evaluate to avoid DOM type issues in Node environment
      await this.page.evaluate('1 + 1');
      return true;
    } catch (error) {
      this.log('warn', `Health check failed: ${error}`);
      return false;
    }
  }

  /**
   * Monitor browser disconnect event
   */
  private setupDisconnectListener(): void {
    if (this.browser) {
      this.browser.on('disconnected', () => {
        this.log('error', 'Browser disconnected unexpectedly');
        this.browser = null;
        this.context = null;
        this.page = null;
        this.events.onBrowserDisconnected?.();
      });
    }
  }

  /**
   * Reinitialize browser
   * Closes existing resources and initializes a new browser instance
   */
  async reinitialize(): Promise<void> {
    this.log('info', 'Reinitializing browser...');

    // Close existing resources
    try {
      await this.close();
    } catch (error) {
      this.log('warn', `Error closing browser during reinitialize: ${error}`);
    }

    // Reinitialize
    await this.initialize();
    this.log('info', '✓ Browser reinitialized');
  }

  /**
   * Navigate to target URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    this.log('info', `Navigating to: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle' });
    await this.page.waitForTimeout(this.config.pageRenderWait);
    this.log('info', '✓ Page loaded');
  }

  /**
   * Refresh current page
   */
  async refresh(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    this.log('info', 'Refreshing page...');
    await this.page.reload({ waitUntil: 'networkidle' });
    await this.page.waitForTimeout(this.config.pageRenderWait);
    this.log('info', '✓ Page refreshed');
  }

  /**
   * Scroll container to load all photos
   */
  private async scrollToLoadAll(): Promise<void> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    this.log('info', 'Scrolling to load all photos...');

    const containerSelector = 'div.photo-content.container';
    const container = this.page.locator(containerSelector).first();

    await container.waitFor({ timeout: 10000 });

    let lastPhotoCount = 0;
    let scrollCount = 0;
    let noChangeCount = 0;

    while (scrollCount < this.config.maxScrollAttempts) {
      // Scroll container to bottom
      await container.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });

      scrollCount++;
      await this.page.waitForTimeout(this.config.scrollPauseTime);

      // Check photo count
      const currentPhotoCount = await this.page
        .locator(this.config.selectors.photoItem)
        .count();

      if (currentPhotoCount > lastPhotoCount) {
        this.log(
          'info',
          `Scrolling... (${scrollCount}x) - ${currentPhotoCount} photos`
        );
        lastPhotoCount = currentPhotoCount;
        noChangeCount = 0;
      } else {
        noChangeCount++;
        if (noChangeCount >= 3) {
          this.log(
            'info',
            `✓ Scroll complete: ${scrollCount}x, ${currentPhotoCount} photos total`
          );
          break;
        }
      }
    }

    if (scrollCount >= this.config.maxScrollAttempts) {
      this.log(
        'warn',
        `Reached max scroll attempts (${this.config.maxScrollAttempts})`
      );
    }
  }

  /**
   * Fast scan all photo fingerprints (no clicking)
   */
  async extractFingerprints(): Promise<PhotoInfo[]> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    // Scroll to load all photos
    await this.scrollToLoadAll();

    // Get all photo elements
    const photoItems = await this.page
      .locator(this.config.selectors.photoItem)
      .all();
    const totalCount = photoItems.length;

    this.log('info', `Scanning fingerprints for ${totalCount} photos...`);

    const fingerprints: PhotoInfo[] = [];

    for (let idx = 0; idx < photoItems.length; idx++) {
      const photoItem = photoItems[idx];

      try {
        const imgElem = photoItem.locator('img').first();
        const thumbnailUrl = await imgElem.getAttribute('src');

        if (thumbnailUrl) {
          const fingerprint = extractFingerprintFromUrl(thumbnailUrl, idx);
          const photo: PhotoInfo = {
            index: idx,
            fingerprint,
            thumbnailUrl,
          };

          fingerprints.push(photo);
          this.events.onPhotoFound?.(photo);
        } else {
          const fingerprint = extractFingerprintFromUrl('', idx);
          fingerprints.push({
            index: idx,
            fingerprint,
            thumbnailUrl: '',
          });
          this.log('warn', `Photo #${idx + 1} has empty thumbnail URL`);
        }
      } catch (error) {
        const fingerprint = extractFingerprintFromUrl('', idx);
        fingerprints.push({
          index: idx,
          fingerprint,
          thumbnailUrl: '',
        });
        this.log('warn', `Failed to extract photo #${idx + 1}: ${error}`);
      }

      // Report progress every 10 photos
      if ((idx + 1) % 10 === 0 || idx === photoItems.length - 1) {
        this.events.onScanProgress?.(idx + 1, totalCount);
      }
    }

    this.log('info', `✓ Fingerprint scan complete: ${fingerprints.length} photos`);
    return fingerprints;
  }

  /**
   * Extract original URLs for specific fingerprints (requires clicking)
   */
  async extractPhotoUrls(targetFingerprints: string[]): Promise<PhotoWithUrl[]> {
    if (!this.page) {
      throw new Error('Browser not initialized');
    }

    if (targetFingerprints.length === 0) {
      this.log('info', 'No target fingerprints, skipping extraction');
      return [];
    }

    const photoItems = await this.page
      .locator(this.config.selectors.photoItem)
      .all();

    this.log(
      'info',
      `Extracting original URLs for ${targetFingerprints.length} photos...`
    );

    const targetSet = new Set(targetFingerprints);
    const photoUrls: PhotoWithUrl[] = [];
    let processedCount = 0;

    for (let idx = 0; idx < photoItems.length; idx++) {
      const photoItem = photoItems[idx];

      try {
        // Get thumbnail and extract fingerprint
        const imgElem = photoItem.locator('img').first();
        const thumbnailUrl = await imgElem.getAttribute('src');
        const fingerprint = extractFingerprintFromUrl(thumbnailUrl || '', idx);

        // Skip if not in target list
        if (!targetSet.has(fingerprint)) {
          continue;
        }

        processedCount++;

        // Click photo to open detail
        const spanElem = photoItem
          .locator(this.config.selectors.photoClick)
          .first();
        await spanElem.click();

        // Wait for detail to load
        await this.page.waitForTimeout(this.config.photoDetailLoadWait);

        // Find "view original" link
        const linkElem = this.page
          .locator(this.config.selectors.viewOriginal)
          .first();
        await linkElem.waitFor({ timeout: 5000 });

        // Get href
        let originalUrl = await linkElem.getAttribute('href');

        if (originalUrl) {
          originalUrl = normalizeUrl(originalUrl);
          const filename = extractFilenameFromUrl(originalUrl);

          photoUrls.push({
            index: idx,
            fingerprint,
            thumbnailUrl: thumbnailUrl || '',
            url: originalUrl,
            filename,
          });

          this.log(
            'info',
            `[${processedCount}/${targetFingerprints.length}] Extracted: ${filename}`
          );
        }

        // Close detail with Escape
        await this.page.keyboard.press('Escape');
        await this.page.waitForTimeout(this.config.photoCloseWait);
      } catch (error) {
        this.log('warn', `Failed to extract photo #${idx + 1}: ${error}`);

        // Try to close any open detail
        try {
          await this.page.keyboard.press('Escape');
        } catch {
          // Ignore
        }
      }
    }

    this.log(
      'info',
      `✓ URL extraction complete: ${photoUrls.length}/${targetFingerprints.length}`
    );
    return photoUrls;
  }
}
