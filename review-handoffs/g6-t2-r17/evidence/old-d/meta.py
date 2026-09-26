#!/usr/bin/env python3
"""Optional R17 meta-layer read-only probes in an isolated archive."""

from __future__ import annotations

import difflib
import json
import sys

from probe import ROOT, FROZEN, OUT, AUDIT, COMP, NEG, GUARD, change_once, invoke

STREAM = 'tests/g6-parity/event-stream.ts'


def event_disabled() -> dict[str, str]:
    source = (ROOT / STREAM).read_text()
    changed = change_once(source,
        'export function emitEvent(event: ExecutionEvent): void {\n  const path = process.env.G6_EVENT_STREAM;',
        'export function emitEvent(event: ExecutionEvent): void {\n  return;\n  const path = process.env.G6_EVENT_STREAM;')
    return {STREAM: changed}


def closure_deleted() -> dict[str, str]:
    guard = (ROOT / GUARD).read_text()
    guard = change_once(guard, '''      if (settled) {
        throw new Error(
          `${suite}: handle used after settle — an assertion outside the settle window is not an execution`,
        );
      }
''', '')
    body = (ROOT / NEG).read_text()
    body = change_once(body,
        '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {',
        '  let postSettleOk!: (condition: boolean, message: string) => void;\n'
        '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {\n'
        '    postSettleOk = h.ok;')
    body = change_once(body,
        '  });\n  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);',
        '  });\n  postSettleOk(false, "R17 after-settle real red assertion");\n'
        '  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);')
    return {GUARD: guard, NEG: body}


def main(case: str) -> None:
    edits = event_disabled() if case == 'event_disabled' else closure_deleted() if case == 'closure_deleted' else None
    if edits is None:
        raise ValueError(case)
    original = {rel: (ROOT / rel).read_bytes() for rel in edits}
    try:
        for rel, content in edits.items():
            before = original[rel].decode()
            (OUT / f'{case}.{rel.replace("/", "_")}.patch').write_text(''.join(
                difflib.unified_diff(before.splitlines(True), content.splitlines(True),
                                     fromfile='frozen/'+rel, tofile='mutated/'+rel)))
            (ROOT / rel).write_text(content)
        direct = invoke(f'meta_{case}.direct', COMP if case == 'event_disabled' else NEG)
        audit = invoke(f'meta_{case}.audit', AUDIT, stream=False)
        (OUT / f'meta_{case}.summary.json').write_text(json.dumps({'direct': direct, 'audit': audit}, ensure_ascii=False, indent=2))
    finally:
        for rel, data in original.items():
            (ROOT / rel).write_bytes(data)
            assert (ROOT / rel).read_bytes() == data == (FROZEN / rel).read_bytes()
        print('RESTORED meta', case, 'byte-identical to frozen', flush=True)


if __name__ == '__main__':
    main(sys.argv[1])
