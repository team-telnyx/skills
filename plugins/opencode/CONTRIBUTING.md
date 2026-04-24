# Contributing

Thanks for your interest in contributing.

## How to contribute

- Open an issue for bugs, questions, or proposed enhancements.
- If you do not have write access, fork the repository, create a branch on your fork, and open a pull request against `main`.
- Open pull requests against `main`.

## Local setup

```bash
npm install
npm run typecheck
npm run build
```

## Pull request expectations

- Keep changes focused and easy to review.
- Explain the problem being solved and the approach you took.
- Update documentation when behavior or setup changes.
- Include validation details when relevant.

## Branch and merge policy

- Contributors should not push directly to `main`.
- Maintainers control merges to `main`.
- Opening issues and pull requests from forks is encouraged.

## Secrets and sensitive data

- Do not commit API keys, tokens, `.env` files, auth exports, or other credentials.
- If a change touches auth or credentials handling, double-check examples and docs for placeholders only.
