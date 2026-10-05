// Comment width, enforced instead of remembered.
//
// The Sandcastle reviewer kept rewrapping comments by hand, to a width that
// was never written down. Measured over the repo's own source, tests and CSS
// (678 lines of comments that wrap, 299 one-line comments): lines of comments
// that wrap stop at 80 columns (95th percentile 80; 79 to 80 columns holds 34
// lines, 81 to 90 only 15), and one-line comments, which often sit beside
// code, run longer (95th percentile 86, 99th 98, longest 101). So a comment
// that wraps wraps at 80, and a one-line comment fits in 100.
//
// A line whose overflow is a URL passes: a URL cannot be wrapped. So does a
// tool directive (oxlint-disable, @ts-expect-error), which must stay on one
// line, and a JSDoc tag that is only a type and a name: the type is the page's
// code, typed in JSDoc, and this checks prose.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..');

/** The width a comment that runs over more than one line wraps at. */
const WRAPPED = 80;
/** The width of a comment on one line of its own. */
const ONE_LINE = 100;

/** Not written here: the captured store pages and the Sandcastle scaffold. */
const NOT_OURS = /^(test\/fixtures|\.sandcastle)\//;

/** A URL that runs past the limit and ends the line, but for closing marks. */
const URL_TAIL = /https?:\/\/\S*?[\s)\]>.,;:'"`]*(\*\/)?\s*$/;

/** A directive to a tool, which reads it from a single line. */
const DIRECTIVE = /^\s*(\/\/|\/\*)\s*(oxlint-|@ts-expect-error|@ts-ignore)/;

/** The start of a JSDoc tag with a type, up to the type's opening brace. */
const TYPED_TAG = /^\s*(\/\*\*|\*)\s*@(\w+)\s*\{/;
/** A name after the type: `name`, `[name]` or `[name=default]`. */
const TAG_NAME = /^\s*(\[[^\]]*\]|[\w$.]+)/;

type CommentKind = 'wrapped' | 'one-line' | null;

/** Each whole-line comment line too wide, as `line: why`, 1-based. */
function tooWide(source: string): string[] {
  const lines = source.split('\n');
  const kinds = commentLines(lines);
  const complaints: string[] = [];
  lines.forEach((line, i) => {
    const kind = kinds[i];
    if (kind === null || DIRECTIVE.test(line) || onlyTypeAndName(line)) return;
    const limit = kind === 'wrapped' ? WRAPPED : ONE_LINE;
    if (width(line) <= limit || overflowIsUrl(line, limit)) return;
    complaints.push(`${i + 1}: ${width(line)} columns, over ${limit} for a ${kind} comment`);
  });
  return complaints;
}

/**
 * For each line, whether it is part of a comment that wraps, a comment on one
 * line of its own, or neither. A block comment wraps when it spans lines; `//`
 * lines wrap when two or more follow one another. A comment after code on the
 * same line is the code's width, not a comment's.
 */
function commentLines(lines: string[]): CommentKind[] {
  const kinds: CommentKind[] = lines.map(() => null);
  const slashes = (i: number) => lines[i]?.trimStart().startsWith('//') ?? false;
  let inBlock = false;
  lines.forEach((line, i) => {
    const trimmed = line.trimStart();
    if (inBlock) {
      kinds[i] = 'wrapped';
      inBlock = !line.includes('*/');
    } else if (trimmed.startsWith('/*')) {
      if (trimmed.includes('*/', 2)) {
        kinds[i] = 'one-line';
      } else {
        kinds[i] = 'wrapped';
        inBlock = true;
      }
    } else if (slashes(i)) {
      kinds[i] = slashes(i - 1) || slashes(i + 1) ? 'wrapped' : 'one-line';
    }
  });
  return kinds;
}

/**
 * Whether the line is a JSDoc tag with nothing but its type and, for a tag
 * that names something, the name: `@param {Type} name`, `@returns {Type}`.
 */
function onlyTypeAndName(line: string): boolean {
  const tag = TYPED_TAG.exec(line);
  if (tag === null) return false;
  let depth = 1;
  let i = tag[0].length;
  for (; i < line.length && depth > 0; i++) {
    if (line[i] === '{') depth++;
    else if (line[i] === '}') depth--;
  }
  if (depth > 0) return false;
  let rest = line.slice(i);
  if (!['returns', 'return', 'type'].includes(tag[2])) rest = rest.replace(TAG_NAME, '');
  return rest.replace(/\*\/\s*$/, '').trim() === '';
}

function overflowIsUrl(line: string, limit: number): boolean {
  const url = URL_TAIL.exec(line);
  return url !== null && width(line.slice(0, url.index)) <= limit;
}

/** Columns, counting a character outside the BMP (an emoji, say) as one. */
function width(text: string): number {
  return Array.from(text).length;
}

/** The repo's own source, tests, CSS and tsconfigs: the files with comments. */
function sourceFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '*.ts', '*.mts', '*.js', '*.css', '*tsconfig.json'], {
    cwd: REPO,
    encoding: 'utf8',
  });
  return listed.split('\n').filter(file => file !== '' && !NOT_OURS.test(file));
}

test('a comment that wraps past 80 columns, or one line past 100, is rejected', () => {
  const wrapped = ['/**', ` * ${'word '.repeat(16)}word`, ' */'].join('\n');
  assert.deepEqual(tooWide(wrapped), ['2: 87 columns, over 80 for a wrapped comment']);
  const slashes = ['// fits', `// ${'word '.repeat(16)}word`].join('\n');
  assert.deepEqual(tooWide(slashes), ['2: 87 columns, over 80 for a wrapped comment']);

  // The same width on one line of its own is in bounds, until 100.
  assert.deepEqual(tooWide(`/** ${'word '.repeat(16)}word */`), []);
  assert.deepEqual(tooWide(`// ${'word '.repeat(20)}word`), ['1: 107 columns, over 100 for a one-line comment']);

  // Code is not a comment, a trailing comment included.
  assert.deepEqual(tooWide(`const x = 1; // ${'word '.repeat(30)}`), []);
});

test('a line whose overflow is a URL passes', () => {
  const link = 'https://example.com/a/very/long/path/that/goes/on/and/on/for/quite/a/while';
  assert.deepEqual(tooWide(['/**', ` * See the product page at ${link}.`, ' */'].join('\n')), []);
  // Words after the URL could have wrapped, so they still count.
  assert.equal(tooWide(['/**', ` * See ${link} and then more words`, ' */'].join('\n')).length, 1);
});

test('a tool directive passes at any width', () => {
  const reason = 'word '.repeat(30);
  assert.deepEqual(tooWide(`  // oxlint-disable-next-line require-await -- ${reason}`), []);
  assert.deepEqual(tooWide(['// fits', `// @ts-expect-error ${reason}`].join('\n')), []);
});

test('a JSDoc tag that is only a type and a name passes; prose after it counts', () => {
  const type = `{{ ${'field: string, '.repeat(6)}last: number }}`;
  assert.deepEqual(tooWide(['/**', ` * @param ${type} [options]`, ` * @returns ${type}`, ' */'].join('\n')), []);
  assert.equal(tooWide(['/**', ` * @param ${type} options what it holds`, ' */'].join('\n')).length, 1);
});

test("no comment in the repo's source, tests or CSS is too wide", () => {
  const files = sourceFiles();
  assert.ok(files.some(file => file.startsWith('src/')), 'git ls-files listed no source');
  assert.ok(files.some(file => file.startsWith('public/')), 'git ls-files listed no page code');

  const offenders = files.flatMap(file =>
    tooWide(readFileSync(path.join(REPO, file), 'utf8')).map(complaint => `${file}:${complaint}`),
  );
  assert.deepEqual(offenders, [], `\n${offenders.join('\n')}\n`);
});
