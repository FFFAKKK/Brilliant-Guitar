# Reserved Database Guidelines

`Brilliant Guitar` currently has no database-backed backend layer.

Pure Core Kernel V1 must not introduce a database, ORM, migration framework, cloud store, or persistence database. `.bgp` semantic schema and migration entry points are kernel concerns, while physical file IO and autosave are future external services.

