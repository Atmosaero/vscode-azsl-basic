import * as path from 'node:path';

export class Uri {
  private constructor(public readonly fsPath: string, public readonly scheme = 'file') {}

  static file(filePath: string): Uri {
    return new Uri(path.resolve(filePath));
  }

  static parse(value: string): Uri {
    const separator = value.indexOf(':');
    return separator < 0 ? Uri.file(value) : new Uri(value.substring(separator + 1), value.substring(0, separator));
  }

  toString(): string {
    return this.scheme === 'file' ? `file://${this.fsPath.replace(/\\/g, '/')}` : `${this.scheme}:${this.fsPath}`;
  }
}

export class Position {
  constructor(public readonly line: number, public readonly character: number) {}

  translate(lineDelta = 0, characterDelta = 0): Position {
    return new Position(this.line + lineDelta, this.character + characterDelta);
  }

  compareTo(other: Position): number {
    return this.line === other.line ? this.character - other.character : this.line - other.line;
  }

  isBefore(other: Position): boolean {
    return this.compareTo(other) < 0;
  }
}

export class Range {
  public readonly start: Position;
  public readonly end: Position;

  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(startOrLine: Position | number, endOrCharacter: Position | number, endLine?: number, endCharacter?: number) {
    if (startOrLine instanceof Position && endOrCharacter instanceof Position) {
      this.start = startOrLine;
      this.end = endOrCharacter;
    } else {
      this.start = new Position(startOrLine as number, endOrCharacter as number);
      this.end = new Position(endLine as number, endCharacter as number);
    }
  }
}

export class Location {
  constructor(public readonly uri: Uri, public readonly range: Range) {}
}

export enum EndOfLine {
  LF = 1,
  CRLF = 2
}

export class TextEdit {
  private constructor(public readonly range: Range, public readonly newText: string) {}

  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }
}

export class SignatureHelp {
  signatures: SignatureInformation[] = [];
  activeSignature = 0;
  activeParameter = 0;
}

export class SignatureInformation {
  parameters: ParameterInformation[] = [];

  constructor(public readonly label: string, public readonly documentation?: string) {}
}

export class ParameterInformation {
  constructor(public readonly label: string, public readonly documentation?: string) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3
}

export class Diagnostic {
  code?: string | number;
  source?: string;
  relatedInformation?: unknown[];
  tags?: unknown[];

  constructor(public range: Range, public message: string, public severity = DiagnosticSeverity.Error) {}
}

export enum SymbolKind {
  Class = 4,
  Function = 11,
  Struct = 22,
  Enum = 9,
  Constant = 13
}

export class DocumentSymbol {
  constructor(
    public readonly name: string,
    public readonly detail: string,
    public readonly kind: SymbolKind,
    public readonly range: Range,
    public readonly selectionRange: Range
  ) {}
}

export class SymbolInformation {
  constructor(
    public readonly name: string,
    public readonly kind: SymbolKind,
    public readonly containerName: string,
    public readonly location: Location
  ) {}
}

export const workspace: { workspaceFolders: readonly { uri: Uri }[] | undefined } = {
  workspaceFolders: undefined
};

export const window = {
  createOutputChannel: () => ({
    appendLine: (_message: string) => undefined,
    show: (_preserveFocus?: boolean) => undefined,
    dispose: () => undefined
  })
};
