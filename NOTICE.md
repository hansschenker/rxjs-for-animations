# Attribution and source provenance

This project is an original consolidation of the animation architecture explored with Hans Schenker and ChatGPT — GPT-6 Astra, informed by these reviewed sources:

1. **benlesh/rxjs-web-animation**, commit [`a6771be996d051070720ee64684d721edda0a919`](https://github.com/benlesh/rxjs-web-animation/tree/a6771be996d051070720ee64684d721edda0a919). Root MIT license: copyright 2019 Ben Lesh. A copy is retained in [docs/licenses/benlesh-rxjs-web-animation-MIT.txt](docs/licenses/benlesh-rxjs-web-animation-MIT.txt).
2. **hansschenker/rxjs-animations**, commit [`1b398706aaed3e2996bfba94832cf9729e416174`](https://github.com/hansschenker/rxjs-animations/tree/1b398706aaed3e2996bfba94832cf9729e416174). MIT license: copyright 2026 Hans Schenker. A copy is retained in [docs/licenses/hansschenker-rxjs-animations-MIT.txt](docs/licenses/hansschenker-rxjs-animations-MIT.txt).

The upstream implementations are not vendored. The new code uses independent implementations of their useful ideas and the conversation's state-driven dot trail. The Ben Lesh easing file additionally contains a Robert Penner BSD-style notice; that file and its full easing collection were not copied. This project implements a small independent set of standard polynomial and sine formulas.

RxJS remains a peer dependency distributed under its own Apache-2.0 license. npm/Vite consume it normally; this repository does not replace or relicense RxJS.

Source findings and changes are documented in [docs/INSPIRATIONS.md](docs/INSPIRATIONS.md). Attribution does not imply endorsement by upstream authors or OpenAI.
