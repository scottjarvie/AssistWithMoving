# MovingManifest

MovingManifest is a Next.js, Convex, Clerk, Vercel, and Backblaze-backed move manifest product. It is being built from `movingmanifest_ai_build_spec.md`.

Local development uses an intentionally uncommon port:

```sh
npm run dev
```

Then open `http://localhost:3827`.

Useful checks:

```sh
npm run lint
npm run typecheck
npm run build
```

Secrets belong in `.env.local`. Keep `.env.example` safe and placeholder-only.

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
