# RxJS animations: consolidated analysis

**Author and main implementation contributor: ChatGPT — GPT-6 Astra (OpenAI).**

Developed with Hans Schenker, 16 November 2026.

This document extends the dot-trail discussion into the implemented library. [INSPIRATIONS.md](INSPIRATIONS.md) records the exact upstream revisions and source evidence. [API.md](API.md) defines the callable contracts. The analysis distinguishes implemented behavior from subsequent design work.

## 1. Intuition: values describe the visible world

A mouse position arrives. A new dot receives an origin, a velocity, and a birth time. A frame arrives. Each living dot acquires a calculated position and opacity. After its lifetime, its record disappears from the model. A renderer makes the screen match the emitted records.

The model can be inspected without creating an element. A renderer can be replaced without changing particle lifetime or motion. This is the essential architectural gain from the conversation's refactor.

`tap` is itself a valid RxJS operator for explicit effects; avoiding its name is not a test for purity. Replacing a `tap` handler with a DOM-mutating `map` handler would preserve the same coupling. This library instead separates environmental input, pure calculations, and output ownership. Its core and examples contain no `tap` calls, but sources, random sampling, native animation execution, and rendering remain effects at their respective boundaries.

RxJS's own [tap documentation](https://rxjs.dev/api/operators/tap) identifies this intended effect role. The [scan documentation](https://rxjs.dev/api/operators/scan) describes the accumulation mechanism used for model updates.

## 2. Two execution routes belong in one library

### Frame-driven values

The browser provides timestamps through `animationFrames()`. A connection records its origin, converts timestamp differences to elapsed time, normalizes progress, applies an easing curve, and projects a value. That value may be a number, an object, a Canvas drawing model, an SVG transform, or a DOM view.

Ben Lesh's project supplies the conceptual decomposition. The consolidation modernizes it using RxJS 7.8.2's [animationFrames](https://rxjs.dev/api/index/function/animationFrames), independent origins, explicit sharing, and tested completion semantics.

### Browser-driven keyframes

A native animation is a resource owned by a connection. On subscription, an adapter invokes `Element.animate()`. The browser handles keyframe interpolation. The adapter observes successful completion and ties cancellation to teardown.

Hans Schenker's project supplies pure plan/sequence/group descriptions and the recursive interpretation model. The new implementation deliberately changes the emitted result and external-cancellation policy; it is not a drop-in replacement. The native [finished promise](https://developer.mozilla.org/en-US/docs/Web/API/Animation/finished) and [cancel behavior](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel) are the platform contracts behind this boundary.

The routes solve different problems. A particle model needs observable state at frame granularity. A native transform/opacity sequence can let the browser interpolate while RxJS controls orchestration. This release makes no performance claim that one route always wins, and no promise that every property will run on a compositor thread.

## 3. Time must be an explicit input

`AnimationClock` couples a timestamp source with a `now()` function in the same time domain. Its `frames$` source emits absolute millisecond timestamps. Every `elapsed$` connection reads a fresh origin and calculates:

$$e(t)=\max(0,t-t_0).$$

The implementation additionally prevents elapsed values from moving backwards when an injected frame arrives out of order. A shared clock therefore shares the frame execution, not the age of every animation. A tween connected later starts at zero even while another tween is already running.

Particle births use the same `clock.now()` as their frame timestamps. Comparing a particle's absolute birth time with a frame stream's connection-relative elapsed time would mix origins. The explicit clock interface prevents that ambiguity in the examples.

Time comes from the input source. `progress$` interprets elapsed time; it does not create a separate wall clock. When a browser suspends frame delivery, the next delivered timestamp may jump. This version uses elapsed wall time: the animation can then reach its endpoint immediately. It does not implement paused logical time, a fixed-step physics loop, or background-tab simulation.

Clock providers are expected to return finite timestamps, use a consistent domain, and not throw from a native callback. The package validates emitted timestamps and setup values, but cannot turn every exception thrown inside the platform's callback machinery into a normal stream notification.

## 4. Endpoint and lifetime contracts

For a positive duration, normalized progress starts synchronously at zero. It advances through the closed interval `[0,1]`; the first frame at or beyond the duration produces exactly one terminal `1`, followed by completion. Zero duration emits only `1` and does not read or connect the clock.

Early upstream completion is still completion, but does not assert that the requested duration elapsed. Unsubscription asserts even less: it closes the connection without producing a completion notification or a synthetic endpoint. These distinctions matter when an animation is replaced by `switchMap` or a view disappears.

A numeric tween preserves its exact `from` and `to` endpoints even if a custom easing curve has unusual endpoint values. Generic interpolation calls the user projection with exact `0` and `1` at those boundaries. Interior easing values may overshoot and must be finite. Projection errors follow the normal Observable error channel.

Natural particle expiry has another representation: remove the record when an incoming action advances model time to its lifetime. Expiry does not rely on a separate timer for every particle. If no action arrives, no state transition occurs. `createTrail$` completes only after both its birth and frame inputs complete; ending only the birth input allows already-living particles to continue receiving frame updates.

## 5. Motion is evaluated from time, not frame count

The motion functions use seconds for physical rates:

$$x(t)=x_0+v_0t$$

$$x(t)=x_0+v_0t+\tfrac12at^2,\qquad v(t)=v_0+at.$$

Their input timestamps remain milliseconds, with conversion at the calculation boundary. These analytic constant-velocity and constant-acceleration equations make the value at a given elapsed time independent of how many intermediate frames were delivered.

Repeatedly adding cumulative elapsed time would count earlier time again. Adding a fixed displacement per frame would make motion depend on frame count. Both mistakes are avoided here. General forces, collisions, springs, and numerical integration are outside the current analytic model and require additional specifications.

## 6. State, step, trace, and specification

For the trail, a state contains current model time and living particle records. An action is either a birth or a frame timestamp. `updateTrail` produces the next immutable state; `projectTrail` calculates visible values.

| Given | When | Required next state or action |
| --- | --- | --- |
| Empty model | A valid birth arrives | One particle exists at its origin with opacity 1. |
| A living particle | A later frame arrives | Position and opacity reflect its age. |
| A particle of age 999 ms, lifetime 1000 ms | A frame reaches age 1000 ms | Its record is absent. |
| Several particles | Another birth arrives | Existing particles remain; the new record is added. |
| An existing ID | A birth reuses that ID | The old record is replaced. |
| Capacity is full | Another new ID arrives | The oldest received record is evicted. |
| A later model time | An older timestamp arrives | Time does not rewind. |
| A connected view | Its connection closes | Inputs disconnect; the view owner disposes its renderer. |

For an origin `(200,300)`, velocity `(60,-20)` units/s, birth time `100`, and lifetime `1000`, a trace is:

| Absolute time (ms) | Age (ms) | x | y | Opacity |
| --- | --- | --- | --- | --- |
| 100 | 0 | 200 | 300 | 1 |
| 350 | 250 | 215 | 295 | 0.75 |
| 600 | 500 | 230 | 290 | 0.5 |
| 1100 | 1000 | Record removed | Record removed | Not rendered |

The specification permits arbitrary intermediate frame spacing while preserving the same values at the same ages. The property-based acceleration tests exercise the analogous frame-partition independence for analytic motion. Tests provide executable evidence for these contracts; they are not a formal proof of all browser behavior.

## 7. Composition is represented before it is executed

An animation description is a tree with three node kinds: plan, sequence, and group. Constructors copy supplied arrays and keyframe/timing data so subsequent ordinary input-array changes do not silently change the description. TypeScript marks the descriptions readonly; this is not deep runtime freezing.

The interpreter preserves tree topology. For `sequence([group([A,B]),C])`, A and B start together. C begins only when both complete. Flattening this tree into a list would lose that condition. `concat` supplies serial connection policy and `merge` supplies concurrent connection policy. Empty nodes complete immediately. An error closes active siblings and prevents later serial work.

Source code and tests from [rxjs-animations](https://github.com/hansschenker/rxjs-animations/tree/1b398706aaed3e2996bfba94832cf9729e416174) are the inspiration for representing composition explicitly. The new runner permits an injected driver so nesting and cancellation can be verified with deterministic streams.

Higher-order input policies remain ordinary RxJS composition: `mergeMap` allows overlap, `switchMap` replaces, `concatMap` queues, and `exhaustMap` ignores new requests while busy. The library does not invent another policy vocabulary for these operators. Visual continuity on replacement requires retaining the current visual value; changing the flattening operator alone does not infer that value.

## 8. Ownership and cancellation are separate from visible state

The keyed DOM renderer owns exactly the nodes it creates. It reuses nodes for existing IDs and removes missing ones. Clearing the visible model with `render([])` leaves the renderer available. `dispose()` is terminal, idempotent, and removes only its own nodes.

The consumer attaches disposal to its rendering connection. Closing a data stream cannot itself know what a previously invoked rendering function left on screen. This remains true even when the state stream is shared: a renderer owns its own output, while reference counting governs shared inputs.

The native adapter owns one captured `Animation.finished` promise and one native run per connection. External native cancellation rejects that promise and errors the Observable; ordinary consumer cancellation remains silent. The rejection handler is attached immediately so closing an RxJS connection does not leave the native rejection unobserved.

Successful native completion has an explicit ownership choice. `release` cancels the native effect during teardown. `retain` transfers a successfully finished effect to the caller, who receives the `Animation` and must eventually release it. `retain` alone does not force a forward fill mode. An already-completed retained effect is not later cancelled by unsubscribing its completed stream or an enclosing sequence.

## 9. Cost and scope

The trail uses one frame source for its current collection, rather than one reducer update per particle's inner frame stream. Mouse births also emit state updates, so this is not a claim of exactly one render per frame. The immutable model is linear in the number of retained particles; the renderer similarly inspects its current IDs. The demo sets a capacity of 500. No broad device benchmark has been performed.

The clock can remain active while the enabled trail is empty. Stop disconnects it. A future demand-aware clock or large-particle Canvas adapter should be justified by profiling and preserve the current lifecycle contracts.

The first release includes useful implementations of both execution routes. It does not recreate Angular renderer integration, trigger-aware DOM queries, automatic enter/leave detection, pause/seek controls, or interrupted-style snapshots. [ROADMAP.md](ROADMAP.md) describes these as future work. [VERIFICATION.md](VERIFICATION.md) records the present evidence and limits.
