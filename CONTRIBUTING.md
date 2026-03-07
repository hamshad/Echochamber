Contributing to Echochamber
==========================

Thanks for wanting to contribute! This document covers the basics to get you started.

How to contribute
- Fork the repository and create a topic branch for your change.
- Follow the existing code style (ES modules, modern Node.js APIs).
- Keep changes small and well-scoped; open a PR with a clear description and rationale.

Development
- Install deps: `npm install`.
- Run tests: `npm test`.
- Start the server locally: `npm start` and open `http://localhost:3000`.

Firebase credentials
- For local development provide a service account JSON via `FIREBASE_SERVICE_ACCOUNT` (env var) or place a `*-firebase-adminsdk-*.json` file in the project root.

Security and secrets
- Never commit service account JSONs, API keys, or other secrets to the repository.
- Use environment variables or secret management in CI.

Code review
- Provide tests for bug fixes and new features when possible.
- Maintain backwards-compatible behavior unless the PR explicitly describes breaking changes.

Issue reporting
- Include steps to reproduce, expected vs actual behavior, and relevant logs or screenshots.

License
- By contributing you agree that your contributions will be under the project's MIT license.
