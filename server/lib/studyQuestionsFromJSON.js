/**
 * 后端版本 - 从文件系统读取 answer.json 题目数据
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const candidates = [
  path.resolve(__dirname, '../../public/answer.json'),
  path.resolve(__dirname, '../../dist/answer.json'),
];

let questionsData = null;

function loadSync() {
  if (questionsData !== null) return questionsData;
  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        questionsData = JSON.parse(raw);
        return questionsData;
      }
    } catch { continue; }
  }
  questionsData = [];
  return questionsData;
}

export async function preloadQuestions() { return loadSync(); }

function matchQuestion(a, b) {
  if (!a || !b) return false;
  const ca = a.replace(/\s+/g, '').toLowerCase();
  const cb = b.replace(/\s+/g, '').toLowerCase();
  return ca.includes(cb) || cb.includes(ca);
}

export async function findAnswer(question) {
  const questions = loadSync();
  if (!questions || questions.length === 0) return null;
  for (const item of questions) {
    if (item.name && item.value && matchQuestion(item.name, question)) return item.value;
  }
  return null;
}

export const getQuestionAnswer = findAnswer;
