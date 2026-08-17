# Semantic Docker development

The fork has an isolated local stack in `docker-compose.semantic.yml`. It does
not replace or modify stock Actual's Compose files.

## Services

- `semantic-server` builds this branch's React client and sync server, enables
  the semantic API, runs bundled PostgreSQL migrations during startup, and
  persists retained Actual authentication data in its own volume.
- `semantic-db` is the canonical PostgreSQL 17 authority with a health check
  and a separate persistent volume.
- `semantic-test` is an on-demand test image with development dependencies. It
  runs the semantic PostgreSQL suite and the authenticated runtime integration
  test against a separate temporary `semantic-test-db`. The test project and
  temporary database are removed automatically, leaving development data
  untouched.

The server is available at `http://localhost:5006` by default. Set
`SEMANTIC_SERVER_PORT` to change the host port. Set
`SEMANTIC_POSTGRES_PASSWORD` to override the local-only default password.
The first production build downloads Actual's translation catalog and
therefore requires network access; subsequent builds reuse Docker's cache.

## Commands

Run from the repository root:

```sh
bin/semantic-stack up
bin/semantic-stack status
bin/semantic-stack logs
bin/semantic-stack test
bin/semantic-stack down
```

`bin/semantic-stack reset` removes both named data volumes before rebuilding
and starting the stack. It is intentionally destructive and should only be
used when disposable local state is desired.

## Verification boundary

Docker is authoritative for server, PostgreSQL, migration, authentication,
semantic API, replay, and failure-recovery development. It does not replace
physical iPhone acceptance for background delivery, native database
projection, TLS/device networking, or lightly modified IPA behavior.
