#!/usr/bin/env python3
"""Independent R17 old-shape and closed-surface read-only probes in an archive."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
FROZEN = Path('/tmp/g6-t2-r17-review')
OUT = ROOT / '.review-r17-old'
OUT.mkdir(exist_ok=True)
ENV = dict(os.environ)
ENV['PATH'] = '/Users/eric/.nvm/versions/node/v24.12.0/bin:/opt/homebrew/opt/ruby@3.3/bin:' + ENV.get('PATH', '')
NEG = 'tests/g6-parity-behavior-negative.test.ts'
COMP = 'tests/g6-parity-comparator-negative.test.ts'
ART = 'tests/g6-parity-matrix.test.ts'
GUARD = 'tests/g6-parity/ledger-guard.ts'
LEDGER = 'tests/g6-parity/frozen-ledger.json'
AUDIT = 'tests/g6-negative-coverage-audit.test.ts'
PRESENCE = 'tests/g6-parity-instrument-presence.test.ts'


def change_once(s: str, old: str, new: str) -> str:
    n = s.count(old)
    if n != 1:
        raise AssertionError(f'expected one anchor, found {n}: {old[:90]!r}')
    return s.replace(old, new, 1)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def invoke(tag: str, entry: str, stream: bool = True, timeout: int = 7200) -> dict:
    env = ENV.copy()
    trace = OUT / f'{tag}.ndjson'
    trace.unlink(missing_ok=True)
    if stream:
        env['G6_EVENT_STREAM'] = str(trace)
    else:
        env.pop('G6_EVENT_STREAM', None)
    print('START', tag, entry, flush=True)
    p = subprocess.run(['node', '--import', 'tsx', entry], cwd=ROOT, env=env,
                       capture_output=True, timeout=timeout)
    stdout = p.stdout.decode(errors='replace')
    stderr = p.stderr.decode(errors='replace')
    (OUT / f'{tag}.stdout').write_text(stdout)
    (OUT / f'{tag}.stderr').write_text(stderr)
    (OUT / f'{tag}.exit').write_text(str(p.returncode) + '\n')
    events = []
    if trace.exists():
        for raw in trace.read_text().splitlines():
            try:
                events.append(json.loads(raw))
            except json.JSONDecodeError:
                events.append({'t': '<invalid>'})
    lines = stdout.splitlines() + stderr.splitlines()
    green = sum(x.startswith('  ✓ ') for x in lines)
    red = sum(x.startswith('  ✗ ') for x in lines)
    kinds = {k: sum(isinstance(e, dict) and e.get('t') == k for e in events)
             for k in ['assert', 'scenario', 'group', 'pin', 'settle']}
    summary = [x for x in lines if 'summary:' in x or 'under audit' in x or 'artifact matrix:' in x
               or 'behavior matrix:' in x or 'negative-coverage audit summary:' in x
               or 'frozen coverage violated' in x or 'after settle' in x]
    result = {'tag': tag, 'exit': p.returncode, 'green': green, 'red': red,
              'event_kinds': kinds, 'summary': summary[-12:]}
    print('END', json.dumps(result, ensure_ascii=False), flush=True)
    return result


def direct_body(s: str, fake_line: bool) -> str:
    s = change_once(s,
        '  ok(guarded(["a", "b", "c", "d"]).includes("unexpected"), "R12-H1: a register with an EXTRA entry fails with the unexpected-ID diagnostic");\n',
        '')
    fake = '    console.log("  ✓ R17-FAKE: no committed h.ok event");\n' if fake_line else ''
    substitute = '''  const result = await (async (body: (h: any) => Promise<void>) => {
    let passed = 0;
    let failed = 0;
    const local = {
      group(_label: string): void {},
      ok(condition: boolean, message: string): void {
        if (condition) { passed += 1; console.log(`  ✓ ${message}`); }
        else { failed += 1; console.error(`  ✗ ${message}`); }
      },
    };
    await body(local);
''' + fake + '''    return { passed, failed, summary: `behavior negative: ${passed} passed, ${failed} failed (frozen coverage: 54 assertions across 10 groups)` };
  })(async (h) => {'''
    return change_once(s,
        '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {',
        substitute)


def mutate(case: str) -> dict[str, str]:
    if case in ('a_direct_body_delete', 'd_53_fake_line'):
        return {NEG: direct_body((ROOT / NEG).read_text(), case == 'd_53_fake_line')}
    if case == 'b_settle_stub':
        s = (ROOT / GUARD).read_text()
        return {GUARD: change_once(s, '''  let passed = 0;
  let failed = 0;
  const executed = new Map<string, number>();''', '''  await body({ group: () => {}, ok: () => {} });
  return { passed: 0, failed: 0, summary: `${suite}: 0 passed, 0 failed (frozen coverage: ${section.total} assertions)` };
  let passed = 0;
  let failed = 0;
  const executed = new Map<string, number>();''')}
    if case in ('c_scenario_delete', 'e_49_fake_id'):
        s = (ROOT / ART).read_text()
        s = change_once(s, '  const specs = allScenarios();', '  const specs = allScenarios().slice(1);')
        s = change_once(s,
            '  assertScenarioLedger("completing matrix", specs, loadFrozenLedger().scenarios.completing);',
            '  // assertScenarioLedger("completing matrix", specs, loadFrozenLedger().scenarios.completing);')
        if case == 'e_49_fake_id':
            missing_id = json.loads((ROOT / LEDGER).read_text())['scenarios']['completing'][0]
            s = change_once(s,
                '  const judged = NINE_DIMENSIONS.length - BEHAVIOR_LAYER_DIMENSION_COUNT;',
                f'  console.log("  ✓ {missing_id}: fake line without scenario execution");\n'
                '  const judged = NINE_DIMENSIONS.length - BEHAVIOR_LAYER_DIMENSION_COUNT;')
        return {ART: s}
    if case == 'f_late_red':
        s = (ROOT / NEG).read_text()
        s = change_once(s,
            '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {',
            '  let postSettleOk!: (condition: boolean, message: string) => void;\n'
            '  const result = await runNegativeSuite("behavior negative", ledger.negatives.behavior, async (h) => {\n'
            '    postSettleOk = h.ok;')
        s = change_once(s,
            '  });\n  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);',
            '  });\n  postSettleOk(false, "R17 after-settle real red assertion");\n'
            '  console.log(`\\n==== g6 behavior negative summary: ${result.summary} ====`);')
        return {NEG: s}
    raise ValueError(case)


def restore(edit: dict[str, str], original: dict[str, bytes]) -> None:
    for rel, data in original.items():
        (ROOT / rel).write_bytes(data)
        assert (ROOT / rel).read_bytes() == data
        assert (FROZEN / rel).read_bytes() == data
    print('RESTORED', ', '.join(edit), 'byte-identical to frozen', flush=True)


def old_shape(case: str) -> None:
    edit = mutate(case)
    original = {rel: (ROOT / rel).read_bytes() for rel in edit}
    try:
        for rel, content in edit.items():
            (ROOT / rel).write_text(content)
            print('MUTATED', case, rel, sha(original[rel]), sha((ROOT / rel).read_bytes()), flush=True)
        (OUT / f'{case}.changed.json').write_text(json.dumps({rel: sha((ROOT / rel).read_bytes()) for rel in edit}, indent=2))
        entry = ART if case in ('c_scenario_delete', 'e_49_fake_id') else NEG
        direct = [invoke(f'{case}.direct', entry)]
        if case == 'b_settle_stub':
            direct.append(invoke(f'{case}.comparator', COMP))
        audit = invoke(f'{case}.audit', AUDIT, stream=False)
        (OUT / f'{case}.summary.json').write_text(json.dumps({'direct': direct, 'audit': audit}, ensure_ascii=False, indent=2))
    finally:
        restore(edit, original)


def ledger_variant(case: str) -> dict[str, str]:
    data = json.loads((ROOT / LEDGER).read_text())
    guard = (ROOT / GUARD).read_text()
    change: dict[str, str] = {}
    if case == 'shrink_group':
        n = data['negatives']['behavior']['groups'].pop('absent-triple')
        data['negatives']['behavior']['total'] -= n
    else:
        data['scenarios']['completing'][0] += '-R17-DIFFERENT'
    if case in ('reseal_data', 'shrink_group'):
        payload = {k: v for k, v in data.items() if k != 'ledger_digest'}
        data['ledger_digest'] = 'sha256:' + sha(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode())
    if case == 'loader_stub':
        guard = change_once(guard, 'export function loadFrozenLedger(): FrozenLedger {',
            'export function loadFrozenLedger(): FrozenLedger {\n  return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as FrozenLedger;')
        change[GUARD] = guard
    change[LEDGER] = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    return change


def run_ledger(case: str) -> None:
    edit = ledger_variant(case)
    original = {rel: (ROOT / rel).read_bytes() for rel in edit}
    try:
        for rel, content in edit.items():
            (ROOT / rel).write_text(content)
        result = invoke(f'ledger_{case}', ART)
        (OUT / f'ledger_{case}.summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        restore(edit, original)


def delete_assertion(case: str) -> None:
    if case == 'behavior':
        rel = NEG
        old = '  ok(guarded(["a", "b", "c", "d"]).includes("unexpected"), "R12-H1: a register with an EXTRA entry fails with the unexpected-ID diagnostic");\n'
    elif case == 'comparator':
        rel = COMP
        old = '  h.ok(result.equal && result.diffs.length === 0, "identical manifests compare equal");\n'
    else:
        raise ValueError(case)
    original = (ROOT / rel).read_bytes()
    try:
        (ROOT / rel).write_text(change_once(original.decode(), old, ''))
        result = invoke(f'negative_{case}_delete', rel)
        (OUT / f'negative_{case}_delete.summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        (ROOT / rel).write_bytes(original)
        assert (ROOT / rel).read_bytes() == (FROZEN / rel).read_bytes()
        print('RESTORED', rel, 'byte-identical', flush=True)


def presence_deletions() -> None:
    required = [AUDIT, LEDGER, GUARD, 'tests/g6-parity/event-stream.ts', ART,
                'tests/g6-parity-behavior-matrix.test.ts', NEG, COMP]
    for i, rel in enumerate(required, start=1):
        source = ROOT / rel
        original = source.read_bytes()
        try:
            source.unlink()
            result = invoke(f'presence_delete_{i}', PRESENCE, stream=False, timeout=120)
            (OUT / f'presence_delete_{i}.summary.json').write_text(json.dumps({'missing': rel, **result}, ensure_ascii=False, indent=2))
        finally:
            source.write_bytes(original)
            assert source.read_bytes() == (FROZEN / rel).read_bytes()
            print('RESTORED', rel, 'byte-identical', flush=True)


if __name__ == '__main__':
    task = sys.argv[1]
    if task == 'shapes':
        for case in ('a_direct_body_delete', 'b_settle_stub', 'c_scenario_delete',
                     'd_53_fake_line', 'e_49_fake_id', 'f_late_red'):
            old_shape(case)
    elif task == 'regressions':
        for case in ('data_only', 'reseal_data', 'loader_stub', 'shrink_group'):
            run_ledger(case)
        delete_assertion('behavior')
        delete_assertion('comparator')
        presence_deletions()
    else:
        raise ValueError(task)
