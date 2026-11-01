# Movie Geeks API

Express 5 + MySQL 8 API for Movie Geeks: film and series discovery backed by TMDB, plus each member's
library, diary, ratings, reviews, follows and notifications.

## Run it

```bash
npm install
cp .env.example .env      # then fill in DB_PASSWORD, JWT_SECRET and TMDB_TOKEN
npm run migrate           # creates every table; safe to run again
npm run dev               # http://localhost:5000/api
npm test                  # unit tests (no database or network needed)
```

Redis is optional: with `REDIS_URL` unreachable the cache falls back to memory. `OMDB_API_KEY` is
optional and adds IMDb, Rotten Tomatoes and Metacritic scores to title pages.

## How it fits together

- `routes → validations → controllers → services → repositories`, as before.
- All TMDB access goes through `src/integrations/tmdb` and `src/services/catalogService.js`, which
  caches every response (Redis, stale-on-error) and maps TMDB shapes to our own.
- User data references titles through a small `titles` snapshot table, written the first time a
  member acts on a title; the full TMDB catalogue is never stored.
- Schema changes live in `src/db/migrations/*.sql`, applied in order by `npm run migrate`.
- Auth: 15-minute access token in the `Authorization` header, rotating refresh token in an httpOnly
  cookie (`/api/auth/refresh`).
