# Built-in plugin contract

Catalog registration is in `src/plugins/catalog.ts`. Registries expose `describe(id)` metadata: stable ID/kind, schema version, defaults, controls, units, determinism, and required capability. Runtime validation covers complete state and partial updates; duplicate IDs and invalid defaults fail registration. Restoration validates all entries before mutation. UI adapters own Tweakpane dependencies.

| ID | Kind/schema | Defaults and units | Evaluation/capability |

| --- | --- | --- | --- |

| gravity | force/1 | enabled, 9.81 m/s², 90° | uniform, simulation |

| wind | force/1 | disabled, base 1.5 and variability 1 m/s², seed 1337 | uniform seeded noise/gusts, simulation |

| radial | force/2 | disabled, 10 m/s², inverse-distance, center 0,0 px | perParticle by default; explicit legacy uniform mode |

| ageAlpha | effect/1 | enabled, linear curve, exponent 2 | WebGL; base lifetime fade also exists in Canvas2D |

| colorShift | effect/1 | disabled, speed 0.8, amount 0.35 | WebGL |

| outline | effect/1 | disabled, thickness .12, strength .7, white | WebGL |

| glow | effect/1 | disabled, radius .2, intensity .6 | WebGL |

| velocityTint | effect/1 | disabled, speed range 0–600 px/s, blue to orange, strength .6 | WebGL |

| heatShimmer | effect/1 | disabled, frequency 8, amplitude .04, speed 1.2, strength .25 | WebGL |

Exact state shapes and defaults live in the plugin implementations; control descriptors and bounded validation live in `plugins/metadata.ts`. Color fields use the shared opaque-color parser. All built-ins are deterministic given configuration, seed/runtime state, and simulation time. New built-ins must declare appropriate bounds/control semantics in metadata and register in the catalog. Force outputs use pixels/second² after converting from m/s².

Preset state excludes wind `rngState`, `activeGustElapsedSec`, `activeGustDurationSec`, and `activeGustStrengthMps2`. Exact benchmark snapshots include these and restore them even when seed changes. Scene imports migrate radial schema 1 to schema 2 with uniform behavior; benchmark schema 1 is history-only. Unknown plugin schemas fail atomically.

New trusted GLSL effects follow the `u_fx{CapitalizedID}{CapitalizedKey}` uniform naming contract. Numeric/boolean fields map to scalar uniforms, color fields to RGB, and the built-in age curve to its enumerated scalar. Arbitrary shader injection and third-party runtime plugins remain unsupported.
