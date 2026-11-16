# Verification

## Reproduce

```bash
npm ci
npm run check
npm pack --dry-run
```

The check command runs strict TypeScript checking, Vitest, the library ESM/declaration build, and the Vite demo production build. CI performs these same commands on Node 22. Package versions are pinned in the lockfile; RxJS is fixed at 7.8.2.

## Evidence by responsibility

| Area | Evidence |
| --- | --- |
| Clock/progress | Lazy setup, independent origins, explicit sharing, last-consumer teardown, zero duration, exact endpoints, early completion/errors/cancellation. |
| Interpolation | Exact from/to values, custom easing/project behavior, finite configuration, cold independent execution. |
| Easing | Endpoints, bounds, monotonicity, and symmetry, including generated inputs. |
| Motion | Per-second units, immutable outputs, analytic equations, generated frame-partition independence. |
| Trail | Separate particle ages, expiry boundary, duplicate IDs, capacity, nonrewinding time, frozen-input updates, source cancellation/completion. |
| DOM sink | Keyed node reuse/removal, layer document ownership, terminal and idempotent disposal. |
| Native adapter | Lazy independent resources, successful release/retain, early unsubscription, external cancellation errors, setup/getter failure, synchronous take(1), latest-wins cancellation. |
| Composition | Serial completion order, concurrent starts, nested topology, empty descriptions, sibling cancellation, no subsequent work after error/unsubscription, input snapshots. |

The initial suite contains **67 test cases across eight files**, including fast-check property runs. Tests use deterministic frame sources and browser/DOM test doubles. They execute the actual RxJS implementation, not a separately reimplemented stream model.

## Limits of the current evidence

The native-animation and DOM tests are not real-browser integration tests. Browser launch was blocked in the authoring environment, so no screenshot or real WAAPI visual pass is claimed. The demo is typechecked and production-built. The suite does not establish browser rendering quality, compositor execution, accessibility across assistive technologies, or throughput on arbitrary hardware.

Generated checks are evidence for the stated numeric properties; they are not exhaustive formal proofs. Custom application projections, clocks, and renderers retain their own contracts. Custom timestamp providers should not throw inside native callbacks; DOM sink failures are output-side failures.

## Browser review checklist

1. Open the Vite demo and move across the trail stage. Dots should start under the pointer, drift/fade, and expire.
2. Stop while several dots are alive. They should disappear immediately; moving while stopped should produce none. Start should create fresh ages.
3. Play a tween, then press Play again midflight. The new configured tween should replace the old one.
4. Compare native Sequence and Group. The same two property animations should run serially or concurrently; a new request replaces the previous composition.
5. Enable reduced motion and reload. The trail starts stopped; explicitly requested tween/native animations complete immediately.
6. Leave the page during activity and confirm browser resources are released. `pagehide` is terminal teardown in this minimal demo; automatic back-forward-cache restoration is not implemented.

## Scope of publication claims

A successful `npm pack` establishes local package assembly. It does not mean the package has been published to npm. A production demo build does not mean a public website has been deployed. The repository's CI result should be checked for the exact delivered commit.
