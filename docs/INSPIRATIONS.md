# Sources and consolidation decisions

This library brings together three ideas: animation as a stream of calculated
values, animation plans interpreted through RxJS composition, and the dot trail
developed as an immutable model with a separate renderer. The source review
below records what the two requested repositories actually implement and what
this project changes. It is a design synthesis, not a claim of API compatibility.

Reviewed on **16 November 2026**, using these fixed revisions:

| Source | Reviewed revision | Contribution to this design |
| --- | --- | --- |
| [Ben Lesh: rxjs-web-animation][ben-root] | `a6771be996d051070720ee64684d721edda0a919` | Frame time, normalized progress, easing, interpolation, velocity, and acceleration |
| [Hans Schenker: rxjs-animations][hans-root] | `1b398706aaed3e2996bfba94832cf9729e416174` | Pure descriptions, lazy execution, nested sequence/group composition, and native-animation ownership |

## 1. Ben Lesh: animation values over time

Despite its name, `rxjs-web-animation` is a **value-stream library**, not a
wrapper around the native Web Animations API. Its public exports are frames,
duration, tween, velocity, acceleration, and easing. Its README calls the
project alpha; its package describes version `0.0.7` and uses RxJS `^6.5.2` as a
development dependency. [Exports][ben-index] · [README][ben-readme] ·
[Package][ben-package]

The central composition is useful and small:

1. A frame source supplies elapsed time.
2. `duration` converts elapsed time into progress between zero and one.
3. An easing function changes that progress curve.
4. `tween` projects progress between two values.
5. A consumer decides how those values affect an output.

The source also offers constant-velocity displacement and an acceleration
accumulator. These establish the broader idea that animation values need not
describe CSS properties: they can represent distance, rotation, or another
quantity chosen by the consumer. [Duration][ben-duration] · [Tween][ben-tween] ·
[Velocity][ben-velocity] · [Acceleration][ben-accelerate]

### Static review findings

The following observations come from reading and evaluating source expressions.
They are **not performance benchmarks or claims about executed upstream tests**.

- **First-subscriber teardown:** `FRAMES` tests `if (index)` before removing a
  subscriber. An index of zero fails that test. In the single-subscriber case,
  the record remains in the collection and the frame loop is not released by
  that cleanup path. [Frame source][ben-frames]
- **Custom-source termination:** `duration` subscribes with a next handler only
  and explicitly assumes its frames cannot error or complete, although its
  argument accepts a custom frame Observable. A replacement should define
  error and early-completion behavior. [Duration][ben-duration]
- **Acceleration:** the accumulator mutates its seed, repeatedly adds
  acceleration times total elapsed time to velocity, and then adds velocity to
  position without a time factor. Its optional initial velocity has no default.
  These expressions motivate explicit units, immutable results, and motion
  calculated from an absolute age or a correctly applied time delta.
  [Acceleration][ben-accelerate]
- **Easing boundaries:** the published `easeInOutSine` expression evaluates to
  `-1` at input `1`; `easeInOutQuad` uses cubic powers; `easeInOutBounce` leaves
  its second-half input untransformed. The family names alone are insufficient
  evidence of the formulas' behavior. [Easing][ben-easing]

This project retains the composition idea and writes a small implementation
with explicit contracts. It does not copy the global frame registry or the
upstream motion accumulator.

## 2. Hans Schenker: descriptions and execution

The existing `rxjs-animations` project already establishes the separation
between an animation description, RxJS orchestration, and a rendering driver.
Its source describes a tree with `plan`, `sequence`, and `group` nodes.
`runAnimation$` interprets a leaf through the native driver, a sequence through
`concat`, and a group through `merge`. Nested topology is preserved.
[Description types][hans-core] · [Interpreter][hans-runtime]

### Implemented milestones and planned scope

The pinned README's status paragraph says F00 is complete and F01 is next.
The same revision's source, composition tests, and roadmap show that **F01 is
also implemented**: sequence, group, and keyframe-description construction are
present. This audit follows those concrete artifacts rather than reproducing
the older README status. [README][hans-readme] · [Composition tests][hans-tests] ·
[Roadmap][hans-roadmap]

The roadmap still marks state/transition descriptions, timing-string parsing,
DOM query and stagger, interruption snapshots, child-animation discovery, and a
generic frame driver as future work. Those entries are inspiration, not code we
can claim to have inherited. The frame/value path in this repository develops
the direction described by that roadmap's F10. [Roadmap][hans-roadmap]

Our [plan module](../src/plans.ts) retains the useful split: pure description
constructors and a lazy interpreter. Its injected driver makes composition
testable without a browser. A sequence waits for a child's completion; a group
connects its children concurrently. Closing their parent releases the active
children and does not start queued work.

## 3. The consolidated library

| Concern | Decision here |
| --- | --- |
| Reactive baseline | RxJS 7.8.2, strict TypeScript, functional APIs, type aliases, and no application classes or enums |
| Time | An injectable clock supplies both timestamps and `now()` from one time domain |
| Sharing | Frame connections are independent by default; sharing is an explicit choice |
| Values | Progress and interpolation emit data; rendering is owned by adapters |
| Motion | Units per second and per second squared; immutable analytical constant-motion results |
| Composition | Description trees preserve serial and concurrent structure |
| Trail | Births and frame timestamps feed a pure transition and view projection |
| Effects | DOM changes and native animations remain at documented boundaries |

### Clock and value contracts

Ben's `FRAMES` shares a global browser loop while retaining a separate start
time for every subscriber. We preserve that distinction explicitly:
`shareAnimationClock` can share timestamps, while each `elapsed$` or `progress$`
connection establishes its own origin. Sharing a timestamp stream must not make
a newly connected animation inherit an older animation's age.
[Upstream frames][ben-frames] · [New time module](../src/time.ts)

`progress$` emits an initial zero and reaches an exact terminal one when an
observed frame reaches the duration. Zero duration emits one immediately.
Early source completion and cancellation do not manufacture a successful final
frame. `tween$` supplies exact numeric endpoints, while `interpolate$` lets a user
function project progress into other value types. A small, independently written
linear, quadratic, cubic, and sine easing set is included; custom functions can
extend it. [Time](../src/time.ts) · [Interpolation](../src/tween.ts) ·
[Easing](../src/easing.ts)

The unit change is deliberate: upstream `velocity(0.1)` means 0.1 units per
millisecond; the corresponding new velocity is 100 units per second. Constant
acceleration uses `x = x0 + v0*t + a*t*t/2` and `v = v0 + a*t`, with `t` in
seconds. Intermediate frame count therefore does not change the calculated
position at a given elapsed time. [Upstream velocity][ben-velocity] ·
[New motion module](../src/motion.ts)

### The dot trail as a reusable state stream

`createTrail$` receives birth records and frame timestamps. It owns no random
generator, DOM element, or implicit browser clock. Its reducer keeps living
particles; its projection calculates positions and opacity from their ages.
The optional particle bound has an explicit oldest-record eviction rule.
Rendering updates existing keyed elements and removes elements missing from the
next view. Unsubscription emits no final empty view, so the rendering boundary
also owns disposal. [Trail](../src/trail.ts) · [DOM adapter](../src/adapters/dom.ts)

## 4. Native lifecycle: deliberate differences

Hans's native driver emits `start`, `finish`, and `cancel` records. Browser-originated
cancellation emits `cancel` and then **completes**. Consequently, a sequence can
advance after that cancellation. Its cleanup preserves an already-finished
native animation. These are observable policy choices, not merely different
implementation details. [Existing driver][hans-driver]

Our optional `animateElement$` adapter has a different contract:

- Connection creates one native animation lazily.
- Natural finish emits that `Animation` once and completes; no frame or start
  notification is emitted.
- Consumer unsubscription cancels silently.
- External native cancellation rejects the captured `finished` promise and
  errors the connected Observable, stopping the surrounding sequence/tree.
- Default `finish: 'release'` releases the native effect even after success.
- `finish: 'retain'` preserves successful native fill behavior and transfers
  eventual cleanup responsibility to the caller. It does not itself request
  forwards fill.

The adapter installs both promise handlers so its own cancellation rejection is
consumed. It is an original browser adapter, not a renamed copy of either
upstream driver. The native API defines successful finish through `finished`
and cancellation through `cancel()`; our adapter defines how those outcomes map
to RxJS. [New adapter](../src/adapters/web-animation.ts) ·
[Native finished](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) ·
[Native cancel](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel)

## 5. Attribution and licensing

Both repositories are MIT-licensed: Ben Lesh's root notice is dated 2019 and
Hans Schenker's is dated 2026. Ben's easing file additionally contains Robert
Penner's 2001 BSD-style notice. That embedded notice matters if its code is
copied; the root license is not a reason to omit it. This project uses original
implementations and a smaller independently written easing set, rather than
copying that easing source. Its provenance records still credit these ideas
and link the reviewed implementations. [Ben license][ben-license] ·
[Hans license][hans-license] · [Penner notice in source][ben-easing]

This consolidation does not claim a full Angular-animation compatibility layer,
a port of every upstream roadmap item, or measured performance superiority.
Its scope is the implemented value streams, motion functions, composition,
trail model, and explicit effect adapters documented in this repository.

[ben-root]: https://github.com/benlesh/rxjs-web-animation/tree/a6771be996d051070720ee64684d721edda0a919
[ben-readme]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/README.md
[ben-package]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/package.json
[ben-index]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/index.ts
[ben-frames]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/frames.ts
[ben-duration]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/duration.ts
[ben-tween]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/tween.ts
[ben-velocity]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/velocity.ts
[ben-accelerate]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/accelerate.ts
[ben-easing]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/src/lib/easing.ts
[ben-license]: https://github.com/benlesh/rxjs-web-animation/blob/a6771be996d051070720ee64684d721edda0a919/LICENSE
[hans-root]: https://github.com/hansschenker/rxjs-animations/tree/1b398706aaed3e2996bfba94832cf9729e416174
[hans-readme]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/README.md
[hans-core]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/src/core/animation.ts
[hans-runtime]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/src/runtime/run-animation.ts
[hans-driver]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/src/drivers/web-animation.ts
[hans-tests]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/tests/composition.test.ts
[hans-roadmap]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/docs/ROADMAP.md
[hans-license]: https://github.com/hansschenker/rxjs-animations/blob/1b398706aaed3e2996bfba94832cf9729e416174/LICENSE
