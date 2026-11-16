# Mission Control API

An Express API for the local Mission Control dashboard. Exposes local OpenClaw status, agents, projects, and workspace memory to the frontend at https://github.com/davisernst04/mission-control.

Install dependencies with `npm ci` and run `node openclaw-api.js` in an isolated, trusted local development environment with OpenClaw installed. The API uses port 3002 and reads workspace files from the current user's OpenClaw directory.

This prototype has no authentication, exposes personal workspace data, and binds to all interfaces. It must not be deployed publicly or run on an untrusted network. The repository publishes source code only, not workspace data or a live service.

## License

MIT. See LICENSE. Third-party dependencies retain their own licenses.
