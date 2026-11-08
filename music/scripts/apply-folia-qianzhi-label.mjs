import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const localePath = resolve('music/folia/src/i18n/locales/zh-CN.ts');
const source = await readFile(localePath, 'utf8');
const original = '"latticeOpenCollection": "打开",';
const branded = '"latticeOpenCollection": "qianzhi",';

if (source.includes(branded)) {
    console.log('Folia collection action already uses the qianzhi label.');
} else {
    const occurrences = source.split(original).length - 1;
    if (occurrences !== 1) {
        throw new Error(`Expected exactly one Folia collection action label; found ${occurrences}.`);
    }
    await writeFile(localePath, source.replace(original, branded), 'utf8');
    console.log('Changed the Folia collection action label from 打开 to qianzhi.');
}
