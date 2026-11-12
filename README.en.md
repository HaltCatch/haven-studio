# Haven Studio

[中文](README.md) · [English](README.en.md)

A structured-model editing project centered on document sessions, edit commands, candidate review and Haven API integration. The current implementation provides editing and review kernels; the complete visual workspace is still in design.

## Features

- Document editing through scoped sessions, node factories, edit commands and error handling.
- Session state and JSON editing buffers for interface-driven changes.
- Candidate contexts, validation results and command submission APIs.
- Shared contracts through Haven Kit Schema, Runtime and UI packages.
- Model/candidate API integration and local proxy configuration.
- Angular type checks, kernel unit tests and build scripts.

## Quick start

Node.js `>=26.13.0 <27`, pnpm `12.18.0`, and matching Haven Kit packages.

```sh
# Build and publish the matching Haven Kit packages first.
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

## Configuration

| Setting | Purpose |
| --- | --- |
| `proxy.conf.json` | Local Haven API proxy target. |
| `src/app/document/` | Document editing and sessions. |
| `src/app/candidates/` | Candidate API, state and review. |
| `@haven registry` | Registry serving the matching Schema/Runtime/UI packages. |

## Usage

`pnpm start` launches the development shell. Editing logic lives in `src/app/document/` and `src/app/candidates/`, using shared contracts to communicate with the API. The current entry point is not a complete end-user editor.

## Project structure

- `src/app/document/` — Document kernel
- `src/app/candidates/` — Candidate-review kernel
- `src/app/core/` — API adapters and common functionality

## License

[PolyForm Noncommercial 1.0.0](LICENSE). See [LICENSE_SCOPE.md](LICENSE_SCOPE.md) for the scope of original material and third-party components, and the accompanying notices for third-party copyrights and licenses.
