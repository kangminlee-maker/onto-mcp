# Providers

`src/providers/` owns host execution capability contracts and adapters.

Providers do not decide what `onto review` means. They only report and perform
host-specific execution capabilities:

- independent contexts;
- persistent agents;
- cross-process messaging;
- maximum parallelism;
- timeout/failure behavior;
- artifact collection.
