"use strict";

const START = "# >>> create-yss-spec managed rules";
const END = "# <<< create-yss-spec managed rules";

function markerState(content) {
  const starts = [...String(content).matchAll(new RegExp(`^${START}$`, "gm"))];
  const ends = [...String(content).matchAll(new RegExp(`^${END}$`, "gm"))];
  if (starts.length === 0 && ends.length === 0) return { kind: "absent" };
  if (starts.length !== 1 || ends.length !== 1 || starts[0].index >= ends[0].index) {
    return { kind: "invalid" };
  }
  const endOffset = ends[0].index + END.length;
  return {
    kind: "valid",
    start: starts[0].index,
    end: content[endOffset] === "\r" && content[endOffset + 1] === "\n"
      ? endOffset + 2
      : content[endOffset] === "\n" ? endOffset + 1 : endOffset,
  };
}

function extractManagedGitignoreBlock(content) {
  const state = markerState(content);
  if (state.kind !== "valid") {
    throw new Error("模板 .gitignore managed rules 标记无效");
  }
  const block = content.slice(state.start, state.end);
  return block.endsWith("\n") ? block : `${block}\n`;
}

function mergeManagedGitignoreBlock(currentContent, managedBlock) {
  const block = extractManagedGitignoreBlock(managedBlock);
  const current = String(currentContent);
  const state = markerState(current);
  if (state.kind === "invalid") throw new Error(".gitignore managed rules 标记无效");
  if (state.kind === "valid") {
    return `${current.slice(0, state.start)}${block}${current.slice(state.end)}`;
  }
  if (!current) return block;
  return `${current.replace(/\s*$/, "")}\n\n${block}`;
}

module.exports = {
  START,
  END,
  markerState,
  extractManagedGitignoreBlock,
  mergeManagedGitignoreBlock,
};
