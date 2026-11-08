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
