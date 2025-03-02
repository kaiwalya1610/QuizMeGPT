# CLAUDE.md - Chrome Extension Development Guide

## Build/Test Commands
- `npm run build` - Build the extension
- `npm run dev` - Watch mode for development
- `npm run lint` - Run ESLint
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm test -- -t "test name"` - Run a specific test

## Code Style Guidelines
- Use TypeScript for type safety
- Follow Google Chrome extension best practices
- Imports: group by external, internal, and relative imports
- CSS: Prefer CSS modules or styled-components
- Naming: camelCase for variables/functions, PascalCase for classes/components
- Error handling: Use try/catch with specific error types
- Security: Avoid inline scripts (CSP restrictions)
- Follow extension manifest v3 guidelines
- Use async/await for asynchronous operations
- Minimize permissions to only what's necessary