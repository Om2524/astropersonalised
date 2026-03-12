// Shim: re-export node:http as https.
// compat_date 2025-03-07 doesn't include node:https, and bumping to
// 2025-08-15 breaks OpenNext's IncomingMessage extends. Workers use
// fetch() internally, so http vs https is functionally identical.
module.exports = require("node:http");
