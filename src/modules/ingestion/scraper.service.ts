import { Injectable, Logger } from '@nestjs/common';
import { IngestionError } from '../../common/exceptions/rag.exceptions';

/**
 * Servicio de scraping que extrae texto de páginas web.
 * Soporta dos modos:
 * - fetch: HTML estático (sin JS) — rápido, sin dependencias
 * - playwright: renderiza JS — lento, requiere playwright instalado
 *
 * Instalar Playwright (opcional):
 *   npm install playwright
 *   npx playwright install chromium
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);

  /**
   * Extrae texto limpio de una URL.
   * Si renderJs=true, usa Playwright para renderizar la página.
   * Si Playwright no está instalado, lanza error con instrucciones.
   */
  async extractText(url: string, renderJs = false): Promise<string> {
    if (renderJs) {
      return this.extractWithPlaywright(url);
    }
    return this.extractWithFetch(url);
  }

  private async extractWithFetch(url: string): Promise<string> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': 'AI-SDLC-Scraper/1.0' },
    });

    if (!response.ok) {
      throw new IngestionError(`Failed to fetch ${url}: ${response.status}`);
    }

    const html = await response.text();
    return this.htmlToText(html);
  }

  private async extractWithPlaywright(url: string): Promise<string> {
    let chromium: { launch: (opts: Record<string, unknown>) => Promise<unknown> };

    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      throw new IngestionError(
        'Playwright no está instalado. Ejecutá: npm install playwright && npx playwright install chromium',
      );
    }

    const browser = await chromium.launch({ headless: true }) as {
      newPage: () => Promise<{
        goto: (url: string, opts: Record<string, unknown>) => Promise<void>;
        content: () => Promise<string>;
        close: () => Promise<void>;
      }>;
      close: () => Promise<void>;
    };

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      const html = await page.content();
      await page.close();
      return this.htmlToText(html);
    } finally {
      await browser.close();
    }
  }

  /**
   * Convierte HTML a texto limpio manteniendo estructura.
   * Elimina scripts, styles, nav, footer, y extrae el contenido principal.
   */
  private htmlToText(html: string): string {
    let text = html;

    // Eliminar scripts, styles, SVGs
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<svg[\s\S]*?<\/svg>/gi, '');
    text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
    text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
    text = text.replace(/<header[\s\S]*?<\/header>/gi, '');

    // Convertir headings a markdown
    text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
    text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
    text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

    // Convertir code blocks
    text = text.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
    text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

    // Párrafos y line breaks
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<li[^>]*>/gi, '- ');

    // Eliminar todas las tags restantes
    text = text.replace(/<[^>]+>/g, '');

    // Decode HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');

    // Limpiar whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.replace(/[ \t]+/g, ' ');
    text = text.trim();

    if (text.length < 100) {
      this.logger.warn(`Extracted text is very short (${text.length} chars) — page may require JS rendering`);
    }

    return text;
  }
}
