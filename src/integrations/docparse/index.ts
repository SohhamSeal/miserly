import { parseBinaryDocument as parseImpl } from "../generated";

/** True when pdfjs-dist + mammoth are installed. */
export const documentParsingAvailable: boolean = parseImpl != null;

export class FeatureNotInstalledError extends Error {
  constructor(public readonly feature: string) {
    super(`The "${feature}" feature is not installed.`);
    this.name = "FeatureNotInstalledError";
  }
}

/**
 * Extract plain text from a binary document (PDF / DOCX).
 * Throws `FeatureNotInstalledError` when document parsing is not installed.
 */
export async function parseBinaryDocument(file: File): Promise<string> {
  if (parseImpl == null) throw new FeatureNotInstalledError("documentParsing");
  return parseImpl(file);
}
