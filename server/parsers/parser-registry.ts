import XLSX from "xlsx";
import type { BaseParser, ParseResult } from "./base-parser";
import { getSheetHeaders } from "./base-parser";

class ParserRegistryImpl {
  private parsers: BaseParser[] = [];

  register(parser: BaseParser): void {
    const existing = this.parsers.findIndex(p => p.name === parser.name);
    if (existing >= 0) {
      this.parsers[existing] = parser;
    } else {
      this.parsers.push(parser);
    }
  }

  detect(workbook: XLSX.WorkBook): { parser: BaseParser | null; confidence: number; allScores: Array<{ name: string; confidence: number }> } {
    const sheetNames = workbook.SheetNames;
    const sampleHeaders: Record<string, string[]> = {};

    for (const name of sheetNames.slice(0, 10)) {
      sampleHeaders[name] = getSheetHeaders(workbook, name);
    }

    const scores = this.parsers.map(parser => {
      try {
        const confidence = parser.detect(workbook, sheetNames, sampleHeaders);
        return { parser, name: parser.name, confidence };
      } catch {
        return { parser, name: parser.name, confidence: 0 };
      }
    });

    scores.sort((a, b) => b.confidence - a.confidence);

    const best = scores[0];
    if (best && best.confidence >= 50) {
      return {
        parser: best.parser,
        confidence: best.confidence,
        allScores: scores.map(s => ({ name: s.name, confidence: s.confidence })),
      };
    }

    return {
      parser: null,
      confidence: 0,
      allScores: scores.map(s => ({ name: s.name, confidence: s.confidence })),
    };
  }

  parse(workbook: XLSX.WorkBook, parserName?: string): ParseResult {
    let parser: BaseParser | null = null;

    if (parserName) {
      parser = this.parsers.find(p => p.name === parserName) || null;
      if (!parser) {
        throw new Error(`Parser '${parserName}' not found. Available: ${this.parsers.map(p => p.name).join(", ")}`);
      }
    } else {
      const detection = this.detect(workbook);
      parser = detection.parser;
      if (!parser) {
        throw new Error(`No parser matched with sufficient confidence. Scores: ${JSON.stringify(detection.allScores)}`);
      }
    }

    return parser.parse(workbook);
  }

  getRegisteredParsers(): Array<{ name: string; description: string }> {
    return this.parsers.map(p => ({ name: p.name, description: p.description }));
  }
}

export const ParserRegistry = new ParserRegistryImpl();
