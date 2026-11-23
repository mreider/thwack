# Thwack

Anonymous writing portfolios with private comments. Live at [thwack.app](https://thwack.app).

Writers connect a Google Doc and Thwack renders it under an assigned pen
name. Readers open a shared link, read, and leave comments that only the
writer sees. Each comment starts a private conversation between the two.
Pressing Refresh on a work captures the doc as the next numbered draft, and
comments stay with the draft they were written on. An hourly job offers each
active reader one piece that needs attention, favoring neglected writers
over popular ones. There's an example portfolio at
[/u/demowriter0q](https://thwack.app/u/demowriter0q).

## Stack

One Cloudflare Worker (Hono, TypeScript, server-rendered HTML), D1 for data,
KV as the public page cache, Google OAuth + Picker (`drive.file`, so the app
only sees docs you pick). Deploys from GitHub Actions on push to main.

## Develop

Needs Node ≥ 22.12.

```
cd worker && npm ci
npx wrangler d1 migrations apply thwack --local
npx wrangler dev
```

Put `DEV_FAKE_AUTH=1` in `worker/.dev.vars` (see the `.example`) to sign in
without Google: `/auth/dev?u=alice`, seed data at `/dev/seed`.

Tests (also the CI gate): `node --test tools/*_test.mjs`

## Issues

Bugs and ideas: [GitHub issues](https://github.com/mreider/thwack/issues).

## License

[MIT](LICENSE)
