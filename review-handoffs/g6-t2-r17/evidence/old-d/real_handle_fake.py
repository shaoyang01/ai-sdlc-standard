#!/usr/bin/env python3
"""R17 d stricter form: 53 committed handle calls plus one unbacked green line."""

from __future__ import annotations

import difflib
import json
from pathlib import Path

from probe import ROOT, FROZEN, OUT, NEG, AUDIT, change_once, invoke, sha


def main() -> None:
    rel = NEG
    target = ROOT / rel
    original = target.read_bytes()
    text = original.decode()
    text = change_once(text,
        '  ok(guarded(["a", "b", "c", "d"]).includes("unexpected"), "R12-H1: a register with an EXTRA entry fails with the unexpected-ID diagnostic");\n',
        '')
    text = change_once(text,
        '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {',
        '  const result = await (async () => {\n'
        '    try {\n'
        '      return await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {')
    text = change_once(text,
        '  });\n  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);',
        '      });\n'
        '    } catch (error) {\n'
        '      if (!String(error).includes("frozen coverage violated")) throw error;\n'
        '      console.log("  ✓ R17-FAKE: no committed h.ok event");\n'
        '      return { passed: 53, failed: 0, summary: "behavior negative: 53 passed, 0 failed (frozen coverage: 54 assertions across 10 groups)" };\n'
        '    }\n'
        '  })();\n'
        '  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);')
    patch = ''.join(difflib.unified_diff(original.decode().splitlines(True), text.splitlines(True),
                                         fromfile='frozen/'+rel, tofile='mutated/'+rel))
    (OUT / 'd_real_handle.patch').write_text(patch)
    try:
        target.write_text(text)
        print('MUTATED d_real_handle', rel, sha(original), sha(target.read_bytes()), flush=True)
        direct = invoke('d_real_handle.direct', NEG)
        audit = invoke('d_real_handle.audit', AUDIT, stream=False)
        (OUT / 'd_real_handle.summary.json').write_text(json.dumps({'direct': direct, 'audit': audit}, ensure_ascii=False, indent=2))
    finally:
        target.write_bytes(original)
        assert target.read_bytes() == original == (FROZEN / rel).read_bytes()
        print('RESTORED d_real_handle byte-identical to frozen', flush=True)


if __name__ == '__main__':
    main()
