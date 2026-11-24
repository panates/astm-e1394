# Changelog
<!-- rman:documented-up-to 3c54b718c03bb212d523efa66b716859c2d3ef7d -->

## v1.0.0-beta.0 (2026-11-24)

### ✨ Features

- add ASTM E1394 message model and dictionary (fec5f24)
- **net:** add the E1381 link layer and the connection interface (5d9f8d3)
- **net:** add the TCP client and server connections (40beb7e)
- add handlers, query answers and link.query() (ec6f38e)
- **core:** add bare-record framing and idleTimeout to the link (9d82d36)
- **serial:** add SerialConnection (ecfb622)
- take a serial port or socket made elsewhere (b6c5252)

### 🔧 Refactoring

- move the link layer to core and split net and serial (3dc0926)

### 📚 Documentation

- record the single release group and the one dictionary in CLAUDE.md (091f295)
- add the net package design (12296cf)
- describe the link, its handlers and options in the READMEs (196e3b8)

### 🧹 Chores

- **deps:** raise iconv-lite to ^0.7.3 (febbab6)
- release betas, starting at 1.0.0-beta.0 (e88cba6)
- **deps:** refresh the lockfile (3c54b71)
