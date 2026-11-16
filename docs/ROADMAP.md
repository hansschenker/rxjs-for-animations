# Roadmap

## Implemented in 0.1.0

- Lazy clocks; explicit shared frame execution; independent origins.
- Elapsed time and finite normalized progress with precise endpoints/cancellation.
- Numeric and generic interpolation; quadratic, cubic, and sine easing.
- Analytic constant velocity and acceleration.
- Immutable particle/trail model and bounded capacity option.
- Keyed DOM sink with explicit terminal disposal.
- Native Web Animations API adapter with release/retain ownership.
- Pure plan/sequence/group descriptions and lazy recursive interpretation.
- Vite examples, tests, source-pinned analysis, API contracts, and contributor attribution.

## Next: review and strengthen the public contracts

1. Run real-browser smoke tests on the demo, including native finish/cancel, rapid replacement, and reduced motion.
2. Confirm naming and units with actual consumers; evaluate whether numeric-only motion and particle-specific helpers belong in separate entry points.
3. Add public examples of all four higher-order request policies with explicit visual continuity rules.
4. Measure representative particle counts before adding performance-specific complexity.

## Potential later capabilities — not implemented

- Logical playback clocks for pause/resume, speed changes, and seek.
- Retargeting from the current visual value instead of a configured start.
- Spring/damped motion with a specified integration/termination policy.
- Native interruption snapshots and owned final-style commits.
- Staggered element streams and explicit enter/leave lifetimes.
- Dedicated Canvas/SVG renderers and large-particle batching.
- Serializable animation descriptions beyond native keyframe plans.
- Optional temporal properties/model checking for more involved playback controls.

Angular renderer bindings, trigger-aware framework queries, and automatic component-tree discovery are not promised. Application lifecycle and DOM ownership remain explicit inputs.
