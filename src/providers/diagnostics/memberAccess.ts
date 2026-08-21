import { getVectorSwizzleType, isValidVectorSwizzle, isVectorType } from './expressionTypes';

export type MemberAccessIssue = {
  line: number;
  start: number;
  end: number;
  message: string;
};

export type MemberAccessModel = {
  getVariableType(name: string, line: number): string | null;
  getStructMembers(type: string): ReadonlySet<string> | undefined;
  getStructMemberType(type: string, member: string): string | null;
  getAtomMembers(type: string): ReadonlySet<string> | undefined;
};

const chainPattern = /\b([A-Za-z_][A-Za-z0-9_]*)(?:\s*\[[^\]]*\])?((?:\s*\.\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*\[[^\]]*\])?)+)/g;
const memberPattern = /\.\s*([A-Za-z_][A-Za-z0-9_]*)/g;

export function collectMemberAccessIssues(lines: readonly string[], model: MemberAccessModel): MemberAccessIssue[] {
  const issues: MemberAccessIssue[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    let chain: RegExpExecArray | null;
    chainPattern.lastIndex = 0;
    while ((chain = chainPattern.exec(line)) !== null) {
      const rootName = chain[1]!;
      let currentType = model.getVariableType(rootName, lineIndex);
      if (!currentType) continue;

      const memberText = chain[2]!;
      const memberOffset = chain.index + chain[0].indexOf(memberText);
      memberPattern.lastIndex = 0;
      let memberMatch: RegExpExecArray | null;
      while ((memberMatch = memberPattern.exec(memberText)) !== null) {
        if (!currentType) break;
        const resolvedType = currentType;
        const member = memberMatch[1]!;
        const start = memberOffset + memberMatch.index + memberMatch[0].lastIndexOf(member);

        if (isVectorType(resolvedType)) {
          if (!isValidVectorSwizzle(resolvedType, member)) {
            issues.push({
              line: lineIndex,
              start,
              end: start + member.length,
              message: `invalid swizzle property '${member}' for type '${resolvedType}'`
            });
            break;
          }
          currentType = getVectorSwizzleType(resolvedType, member);
          continue;
        }

        if (/Stream\s*</.test(resolvedType) && member === 'Append') {
          currentType = null;
          continue;
        }

        const structMembers = model.getStructMembers(resolvedType);
        const atomMembers = model.getAtomMembers(resolvedType);
        if (structMembers || atomMembers) {
          // The Atom index deliberately unions members from conditional and
          // repeated declarations. A structural index entry can represent
          // only one such declaration, so accept a member known by either
          // source before reporting it as missing.
          if (!structMembers?.has(member) && !atomMembers?.has(member)) {
            issues.push({
              line: lineIndex,
              start,
              end: start + member.length,
              message: structMembers
                ? `no member named '${member}' in struct '${resolvedType}'`
                : `no member named '${member}' in type '${resolvedType}'`
            });
            break;
          }
          currentType = model.getStructMemberType(resolvedType, member);
          if (!currentType) break;
          continue;
        }

        break;
      }
    }
  }

  return issues;
}
