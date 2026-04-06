import { Injectable, Logger } from '@nestjs/common';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'; // NEW

export interface ChunkResult {
  content: string;
  chunkIndex: number;
  headingPath?: string;
}

export interface ChunkOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  contentType?: string;
}

@Injectable()
export class SmartChunkerService {
  private readonly logger = new Logger(SmartChunkerService.name);

  async chunk(text: string, options: ChunkOptions = {}): Promise<ChunkResult[]> {
    const { chunkSize = 1000, chunkOverlap = 200, contentType = 'text/plain' } = options;

    const isMarkdown =
      contentType.includes('markdown') ||
      contentType.includes('md') ||
      this.looksLikeMarkdown(text);

    const isCode =
      contentType.includes('code') ||
      contentType.includes('typescript') ||
      contentType.includes('javascript') ||
      contentType.includes('python');

    if (isMarkdown) {
      return this.chunkMarkdown(text, chunkSize, chunkOverlap);
    }

    if (isCode) {
      return this.chunkCode(text, chunkSize, chunkOverlap);
    }

    return this.chunkPlainText(text, chunkSize, chunkOverlap);
  }

  /**
   * Chunking por headings markdown (##, ###).
   * Preserva la jerarquía de secciones — cada heading inicia un nuevo chunk.
   * Si una sección es muy larga, la subdivide con overlap.
   */
  private async chunkMarkdown(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): Promise<ChunkResult[]> {
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const sections: Array<{ heading: string; level: number; start: number }> = [];

    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(text)) !== null) {
      sections.push({
        heading: match[2] ?? '',
        level: (match[1] ?? '#').length,
        start: match.index,
      });
    }

    if (sections.length === 0) {
      return this.chunkPlainText(text, chunkSize, chunkOverlap);
    }

    const results: ChunkResult[] = [];
    const headingPath: string[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i]!;
      const nextStart = sections[i + 1]?.start ?? text.length;
      const sectionText = text.slice(section.start, nextStart).trim();

      // Mantener path jerárquico de headings
      headingPath.splice(section.level - 1);
      headingPath[section.level - 1] = section.heading;

      if (sectionText.length <= chunkSize) {
        results.push({
          content: sectionText,
          chunkIndex: results.length,
          headingPath: headingPath.filter(Boolean).join(' > '),
        });
      } else {
        // Sección larga: subdivide manteniendo el heading como prefijo
        const subChunks = await this.splitLongSection(
          sectionText,
          chunkSize,
          chunkOverlap,
          headingPath.filter(Boolean).join(' > '),
        );
        subChunks.forEach((sc) => results.push({ ...sc, chunkIndex: results.length }));
      }
    }

    this.logger.debug(`Markdown chunking: ${sections.length} sections → ${results.length} chunks`);
    return results;
  }

  /**
   * Chunking para código: usa separadores que respetan funciones, clases y bloques.
   */
  private async chunkCode(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): Promise<ChunkResult[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: [
        '\nclass ',
        '\nfunction ',
        '\nconst ',
        '\nexport ',
        '\nasync function ',
        '\n\n',
        '\n',
        ' ',
        '',
      ],
    });

    const docs = await splitter.createDocuments([text]);
    return docs.map((doc, i) => ({ content: doc.pageContent, chunkIndex: i }));
  }

  /**
   * Chunking para texto plano: prioriza cortar en párrafos y oraciones completas.
   */
  private async chunkPlainText(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
  ): Promise<ChunkResult[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', '. ', '! ', '? ', ' ', ''],
    });

    const docs = await splitter.createDocuments([text]);
    return docs.map((doc, i) => ({ content: doc.pageContent, chunkIndex: i }));
  }

  private async splitLongSection(
    text: string,
    chunkSize: number,
    chunkOverlap: number,
    headingPath: string,
  ): Promise<ChunkResult[]> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', '. ', ' ', ''],
    });

    const docs = await splitter.createDocuments([text]);
    return docs.map((doc, i) => ({
      content: doc.pageContent,
      chunkIndex: i,
      headingPath,
    }));
  }

  private looksLikeMarkdown(text: string): boolean {
    const markdownSignals = [/^#{1,6}\s/m, /\*\*[^*]+\*\*/, /\[.+\]\(.+\)/, /^[-*]\s/m, /^>\s/m];
    return markdownSignals.some((re) => re.test(text));
  }
}
