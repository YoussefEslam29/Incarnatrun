/**
 * Creates a demo account for local poking around.
 *
 *   npx vite-node scripts/seed-demo-user.mts
 *
 * Development only. It prints the password because the password is the point,
 * and the account only exists in whatever database DATABASE_URL points at.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(process.cwd(), ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}

const { prisma } = await import("../lib/db/client.ts");

// bcrypt directly rather than lib/auth, which pulls in next-auth and so
// next/server, neither of which resolve outside the Next.js bundler. The cost
// factor has to stay in step with hashPassword there.
const bcrypt = (await import("bcryptjs")).default;
const hashPassword = (password: string) => bcrypt.hash(password, 12);

const EMAIL = process.env.DEMO_EMAIL ?? "demo@incarnatrun.local";
const PASSWORD = process.env.DEMO_PASSWORD ?? "incarnatrun-demo";

const passwordHash = await hashPassword(PASSWORD);

const user = await prisma.user.upsert({
  where: { email: EMAIL },
  update: { passwordHash },
  create: { email: EMAIL, name: "Demo User", passwordHash },
});

console.log(`\nDemo account ready\n  email    ${user.email}\n  password ${PASSWORD}\n`);

await prisma.$disconnect();
