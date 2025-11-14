import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadJson(path) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf-8'));
  } catch {
    return {};
  }
}

const defaultConfig = {
  endpoint: process.env.XBET_ENDPOINT || 'wss://gw.xbetbot.com/?lang=zh-CN',
  token: process.env.XBET_TOKEN || '',
  username: process.env.XBET_USERNAME || '',
  password: process.env.XBET_PASSWORD || '',
  subscriptions: ['matches', 'odds', 'live']
};

const fileConfig = loadJson('./config.json');
export const config = Object.assign({}, defaultConfig, fileConfig);
