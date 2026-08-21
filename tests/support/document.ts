import { EndOfLine, Position, Uri } from 'vscode';

export class TestDocument {
  readonly uri: Uri;
  readonly languageId = 'azsl';
  readonly fileName: string;
  readonly eol: EndOfLine;
  private readonly lines: string[];

  get lineCount(): number {
    return this.lines.length;
  }

  constructor(private readonly text: string, filePath = 'C:\\fixtures\\document.azsl') {
    this.uri = Uri.file(filePath);
    this.fileName = this.uri.fsPath;
    this.eol = text.includes('\r\n') ? EndOfLine.CRLF : EndOfLine.LF;
    this.lines = text.split(/\r?\n/);
  }

  getText(): string {
    return this.text;
  }

  lineAt(line: number): { text: string } {
    return { text: this.lines[line] ?? '' };
  }

  positionAt(offset: number): Position {
    const clamped = Math.max(0, Math.min(offset, this.text.length));
    const before = this.text.substring(0, clamped);
    const lines = before.split(/\r?\n/);
    return new Position(lines.length - 1, lines.at(-1)?.length ?? 0);
  }

  offsetAt(position: Position): number {
    const eolLength = this.eol === EndOfLine.CRLF ? 2 : 1;
    let offset = 0;
    for (let line = 0; line < position.line; line++) offset += (this.lines[line]?.length ?? 0) + eolLength;
    return Math.min(this.text.length, offset + position.character);
  }
}
