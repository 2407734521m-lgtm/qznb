import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../folia");
const files = [
  ["src/services/qianzhiAccount.ts", "H4sIAAAAAAAC/61X227bRhB991dsgCIkEYlCir5UjuI4gR/SpLZjOS1aFBBW5EjamNpluUu5iq1/7+yNWlK04xTVgySSszNzzlzJ1qWoFLkjWQVUwbuCAVcDorYlkClIyQQnO7KoxJpEb2Rd0jmVMPJ/hl9kdHx0lAkuFQG+IRPCjMJ0DYqm+g6V5AoyUeWvpKoYXw6I/SX3pOY5LBiH/PWxU+H1fq4KVBXj+fS399dns09/nr+dTT9fnr49nZ7NPl99JPf3JIqSFFWt4yStoCxoBvHor9EPo4F+4jVSLvgH2D6i7fT84nz24eyPtkpEBf8YaqweJj8xyr+u2GmWiZqrd4Iv2LKuIEfVb4UogPI4dP/5c287aRjKDLuapAe1HRH8nLSiEaodeKUDcmdE9YfWajUOrvVHKlHRJaDkmER/f+Xz4bqWLBtq2eHmZTRoSZdQSSaVC/iYqKqGtgSeE1ewqECursUN9MrkoCDzSt5zdHdMFrSQgdjO/t0l5mdMeF0Ue6pN1jlmPool47+CWgnNcARryooIkyaqJVScriHan1vUPFM6U9E9UWzgUEXMcmSSLRhUY5eAybjP1L1xyZFpo7ahRQ06aI2KJke0EFuQ+JmRSdC+qivuUOmH7oZ5nDKeFXUOMo7eRAkG2YMat0Dtjo4aPDpaZ1UlqjgTOQSem5vOS28Ubu3t2MbbZEVEXhB9NGnrXdNy6pLKHgH9jTlE1hg9zJsTb+sYf6mq5YmO1XoOFXYDy1HHC8uVO45sTc1xq/gk9fd9jYmP4haqd2g/pNEJW4tkMpmQn378WZ9xxwMGKywPUrA1U0hlr4QSAnHybZQkQW04svbEGk0zownyyDmza1w61Ms4RpPlpNBZ85BxL4R1bLIGqyBKGid6j5hkIFyYjrNg1Vq70y9aUilvsaV+A9pTbfhMnOGD2f6BzkuHY9bCEXJ0yGfN6QaV0XkBkU07V6VUbnm2r1XJltgkfmdq1e6FPaU6IB5xUAKXOJOYhFeu37x2TJhytI02IWpVidvQuQahabYeypPq3Ce460gPtxrbC4Lm4M5gKJ95HD2uPUB1kInW8qTphmHwrXd3JKeKDogpJKzUCaG3lPnBk2pr6Z73S+dMfEeMwrGlYM829unjxkJToAaItpNKS70H099VAhUuWcKzPpfMTwFK81oiFmx2V+6fFVHVtpXr9lmDcAEqW7UG8AsSjXyyydHm5cj32KGt3EFnYlp+MecvL6bXnfm4AprjiOwOWTMYS3ajh6yfywcCEQ53hewPr3G6RaiflmXBMqr9Gn2Rgnds7dqXc5Gj9l+mF+epTX222GLAPJi+mLUVZDRboRim/lAvBdAxF6QbCgndUINx7WsdtSC/AfzDygKF5m/23aGJaEm3haC5ni7iBufI3G5Lx2YwhYPGZsSJFqRZhlczpVeNQKSyG0jnPrq360sSZ7jJEZ80qWY9TvRqqjcOsfCSTwbb6XEBYFPwjSFxo4vFaddXz7B69eLkmoG974GnIep+iRYBySMu+pOaY60qbnzqTFds/q0J+GDXb+P8jn4DfiWMg5U1QDomHZgtHgZBzQfYDw+1Hvs1s7Nb/LfW1du2HpxrS1BuKHjYh8PKrVC9M+tgh3w61cs91V3k/wfQ/eiu5zKr2NxPv1M0Hhf4AgFcD+1Y+veINtyETF6TjWA5EhI3F49wYIXudoc8GAJC6IJrJ6ZKvzWtKF9CHM9gY95lm1CjLu+kdzFpI7cGLX6LsdSA05o3kONv7TQXteosNEH8NeBHot4G+q0pjpZwEshMlLq/FyKj+DKx++7II5p/AQ6S0L0GEAAA"],
  ["src/components/modal/settings/pages/QianzhiAccountRow.tsx", "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"],
  ["test/unit/qianzhiAccount/loginMethod.test.ts", "H4sIAAAAAAAC/6WQS07DMBCG9z3F7OxIaXKACgSsCxLiAMhxpnSQH8GeRIWqd8dOmlJVZQOWLUt+fPPNT7bzgWEPLUYdqMEScNeh5hKI4QCb4C2IgRgji9WC5ucBozcDPpNyX1ta+zdyj8hb357+VFU9zRh0HTEMpDHWH9OHe6197zJxMReW4ggDNV2CyVSwI1aUIAu4uYX9AtIgloIDKo6AVpEBatExbQhDBBXhpe9UoyIeb0fSBSKPqVX5azNSpPK2wXCHO2U7g5XOrRVFxf4hGY90UaxG4CHtl3LOu+VVwXTmljHFCn3KximL/5CM3Gf6a8b8yM3gq34B3xM0qbgUUcefZ35/ywlOsTz1xsizmnl9A91mXhNnAgAA"],
];

async function writeExact(relativePath, value) {
  const target = path.join(root, relativePath);
  const content = gunzipSync(Buffer.from(value, "base64")).toString("utf8");
  await fs.mkdir(path.dirname(target), { recursive: true });
  let current = null;
  try { current = await fs.readFile(target, "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  if (current === content) return;
  if (current !== null) throw new Error("Refusing to overwrite different overlay file: " + relativePath);
  await fs.writeFile(target, content, "utf8");
}

for (const [relativePath, value] of files) await writeExact(relativePath, value);

const helpPath = path.join(root, "src/components/modal/settings/pages/HelpPage.tsx");
let help = await fs.readFile(helpPath, "utf8");
const importLine = "import QianzhiAccountRow from './QianzhiAccountRow';";
if (!help.includes(importLine)) {
  const anchor = "import { iconLabel } from './iconLabel';";
  const index = help.indexOf(anchor);
  if (index < 0 || help.indexOf(anchor, index + anchor.length) >= 0) {
    throw new Error("Could not safely locate the HelpPage import anchor.");
  }
  help = help.slice(0, index + anchor.length) + "\n" + importLine + help.slice(index + anchor.length);
}
const groupAnchor = "<Group def={ABOUT} bare>";
if (!help.includes("<QianzhiAccountRow />")) {
  const index = help.indexOf(groupAnchor);
  if (index < 0 || help.indexOf(groupAnchor, index + groupAnchor.length) >= 0) {
    throw new Error("Could not safely locate the HelpPage About group anchor.");
  }
  const insertAt = index + groupAnchor.length;
  help = help.slice(0, insertAt) + "\n                <QianzhiAccountRow />" + help.slice(insertAt);
}
await fs.writeFile(helpPath, help, "utf8");
console.log("Applied optional Qianzhi Supabase account integration.");
